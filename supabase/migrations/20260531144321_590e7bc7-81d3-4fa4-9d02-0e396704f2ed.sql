CREATE OR REPLACE FUNCTION public.protect_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Allow trusted server-side updates (service_role calls have auth.uid() = NULL
  -- and already bypass RLS). Only enforce protection for actual signed-in users.
  if auth.uid() is not null and not public.has_role_admin(auth.uid()) then
    NEW.role         := OLD.role;
    NEW.batch_id     := OLD.batch_id;
    NEW.student_type := OLD.student_type;
    NEW.email        := OLD.email;
  end if;
  return NEW;
end;
$function$;