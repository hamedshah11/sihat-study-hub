-- Secure enrolment: invite redemption is atomic and an assigned batch is locked.

-- Service-role requests are trusted server operations. Explicitly recognise
-- them in the trigger; bypassing RLS does not itself bypass Postgres triggers.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_role_admin(auth.uid()) then
    new.role         := old.role;
    new.batch_id     := old.batch_id;
    new.student_type := old.student_type;
    new.email        := old.email;
  end if;
  return new;
end;
$$;

-- Only trusted server code can call this function. The invite and profile
-- rows are locked until the transaction completes, preventing over-redemption
-- and lost use-count increments under concurrent sign-ups.
create or replace function public.redeem_invite_code(p_code text, p_user_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_invite public.invite_codes%rowtype;
  current_batch uuid;
  current_student_type text;
begin
  select *
    into selected_invite
    from public.invite_codes
   where code = trim(p_code)
   for update;

  if not found then
    return 'not_found';
  end if;
  if selected_invite.batch_id is null then
    return 'not_found';
  end if;
  if selected_invite.expires_at is not null and selected_invite.expires_at < now() then
    return 'expired';
  end if;
  if selected_invite.used_count >= selected_invite.max_uses then
    return 'exhausted';
  end if;

  select batch_id, student_type
    into current_batch, current_student_type
    from public.profiles
   where id = p_user_id
   for update;

  if not found then
    return 'profile_not_found';
  end if;
  if current_batch is not null or current_student_type = 'internal' then
    return 'already_enrolled';
  end if;

  update public.profiles
     set batch_id = selected_invite.batch_id,
         student_type = 'internal'
   where id = p_user_id;

  update public.invite_codes
     set used_count = used_count + 1
   where id = selected_invite.id;

  return 'ok';
end;
$$;

revoke all on function public.redeem_invite_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_invite_code(text, uuid) to service_role;
