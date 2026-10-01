-- Award XP and advance streaks in one idempotent transaction.

alter table public.xp_events
  add column if not exists idempotency_key text;

create unique index if not exists xp_events_user_idempotency_idx
  on public.xp_events (user_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.record_activity(
  p_user_id uuid,
  p_source text,
  p_amount integer,
  p_idempotency_key text,
  p_award_xp boolean default true
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today_pkt date := (now() at time zone 'Asia/Karachi')::date;
  streak_row public.streaks%rowtype;
  gap integer;
  next_current integer;
  next_longest integer;
  next_freezes integer;
  inserted_xp integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if p_award_xp and p_amount <= 0 then
    raise exception 'positive XP amount required' using errcode = '22023';
  end if;

  if p_award_xp then
    insert into public.xp_events (user_id, amount, source, idempotency_key)
    values (p_user_id, p_amount, p_source, p_idempotency_key)
    on conflict (user_id, idempotency_key) where idempotency_key is not null do nothing;
    if found then
      inserted_xp := p_amount;
    end if;
  end if;

  select * into streak_row
    from public.streaks
   where user_id = p_user_id
   for update;

  if not found then
    insert into public.streaks (
      user_id, current_streak, longest_streak, last_active_date, freezes_available
    ) values (p_user_id, 1, 1, today_pkt, 1)
    on conflict (user_id) do nothing;
    return inserted_xp;
  end if;

  if streak_row.last_active_date = today_pkt then
    return inserted_xp;
  end if;

  gap := case
    when streak_row.last_active_date is null then null
    else today_pkt - streak_row.last_active_date
  end;
  next_freezes := coalesce(streak_row.freezes_available, 0);

  if gap = 1 then
    next_current := coalesce(streak_row.current_streak, 0) + 1;
  elsif gap = 2 and next_freezes > 0 then
    next_current := coalesce(streak_row.current_streak, 0) + 1;
    next_freezes := next_freezes - 1;
  else
    next_current := 1;
  end if;

  if next_current % 7 = 0 then
    next_freezes := least(2, next_freezes + 1);
  end if;
  next_longest := greatest(coalesce(streak_row.longest_streak, 0), next_current);

  update public.streaks
     set current_streak = next_current,
         longest_streak = next_longest,
         last_active_date = today_pkt,
         freezes_available = next_freezes
   where user_id = p_user_id;

  return inserted_xp;
end;
$$;

revoke all on function public.record_activity(uuid, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_activity(uuid, text, integer, text, boolean)
  to service_role;

