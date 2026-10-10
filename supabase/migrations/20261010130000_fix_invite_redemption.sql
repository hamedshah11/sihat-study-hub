-- Fix batch-code redemption. Safe to re-run manually.
--
-- redeem_invite_code (20261001090000_secure_invite_redemption.sql) bumped the
-- use count with `where id = selected_invite.id`, but invite_codes has no id
-- column: its primary key is `code`. PL/pgSQL only checks that at run time, so
-- every redemption failed with `column "id" does not exist` and new students
-- were left without a batch. Found by the end-to-end join test.
--
-- Identical to the earlier function apart from that one line.

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
   where code = selected_invite.code;

  return 'ok';
end;
$$;

revoke all on function public.redeem_invite_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_invite_code(text, uuid) to service_role;
