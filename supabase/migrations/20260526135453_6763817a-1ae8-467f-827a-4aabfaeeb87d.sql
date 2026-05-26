-- =====================================================================
-- Tighten profile + invite-code security
-- =====================================================================
-- Why: students must not be able to promote themselves to instructor/admin,
-- reassign their batch, flip student_type to "internal" to gain access to
-- batch content, or change the email tied to their auth identity. RLS UPDATE
-- policies in Postgres apply to whole rows, so we enforce per-column
-- restrictions with a BEFORE UPDATE trigger that resets protected columns
-- back to their OLD values unless the caller is an admin.
-- =====================================================================

-- 1. Replace the profile-protection trigger function with a stricter version
--    that covers role + email in addition to batch_id + student_type.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins (and the service_role, which bypasses RLS entirely) can change
  -- anything. Everyone else gets the protected fields silently reverted.
  if not public.has_role_admin(auth.uid()) then
    NEW.role         := OLD.role;
    NEW.batch_id     := OLD.batch_id;
    NEW.student_type := OLD.student_type;
    NEW.email        := OLD.email;
  end if;
  return NEW;
end;
$$;

-- Helper: the existing is_admin() already does this, but we wrap it so the
-- trigger doesn't depend on the public.app_role enum (role is stored as text).
create or replace function public.has_role_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and role = 'admin'
  )
$$;

-- Attach the trigger (drop-if-exists so this migration is idempotent).
drop trigger if exists protect_profile_fields_trg on public.profiles;
create trigger protect_profile_fields_trg
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- =====================================================================
-- 2. Invite codes: lock down so students cannot enumerate codes.
-- =====================================================================
-- The previous policy allowed any authenticated user to SELECT all invite
-- codes, which leaks the codes themselves and lets students self-assign
-- to any batch by guessing batch_id mappings. Validation now goes through
-- the applyInviteCode server function, which uses the service-role client
-- and bypasses RLS safely.

drop policy if exists "Authed users read invite codes" on public.invite_codes;
drop policy if exists "Admins manage invite codes"    on public.invite_codes;

create policy "Admins manage invite codes"
  on public.invite_codes
  for all
  to authenticated
  using (public.has_role_admin(auth.uid()))
  with check (public.has_role_admin(auth.uid()));

-- Note: no SELECT policy for non-admins. The applyInviteCode server function
-- (src/lib/invite.functions.ts) uses supabaseAdmin and is the only sanctioned
-- path for students to redeem a code.
