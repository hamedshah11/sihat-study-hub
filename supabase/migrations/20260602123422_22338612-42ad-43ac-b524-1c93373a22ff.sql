
-- 1) Attach profile protection trigger (function already exists but was not wired up)
DROP TRIGGER IF EXISTS protect_profile_fields_trg ON public.profiles;
CREATE TRIGGER protect_profile_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_fields();

-- 2) Revoke execute on trigger-only SECURITY DEFINER functions from client roles.
-- These are only ever invoked by triggers, never directly by clients.
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- 3) Tighten access on role-check helpers: only authenticated users (needed for RLS evaluation).
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_weekly_leaderboard() FROM anon, PUBLIC;
