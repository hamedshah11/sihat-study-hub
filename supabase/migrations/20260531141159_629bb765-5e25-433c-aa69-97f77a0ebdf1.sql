CREATE OR REPLACE FUNCTION public.batch_weekly_leaderboard()
RETURNS TABLE(user_id uuid, first_name text, weekly_xp bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_batch uuid;
  week_start timestamptz;
BEGIN
  IF caller IS NULL THEN
    RETURN;
  END IF;

  SELECT batch_id INTO caller_batch FROM public.profiles WHERE id = caller;
  IF caller_batch IS NULL THEN
    RETURN;
  END IF;

  -- Most recent Monday 00:00 in Pakistan time (UTC+5, no DST), expressed as a UTC timestamptz.
  week_start := (date_trunc('week', (now() AT TIME ZONE 'Asia/Karachi'))) AT TIME ZONE 'Asia/Karachi';

  RETURN QUERY
  SELECT
    p.id AS user_id,
    NULLIF(split_part(COALESCE(p.display_name, ''), ' ', 1), '') AS first_name,
    COALESCE(SUM(x.amount), 0)::bigint AS weekly_xp
  FROM public.profiles p
  LEFT JOIN public.xp_events x
    ON x.user_id = p.id
   AND x.occurred_at >= week_start
  WHERE p.batch_id = caller_batch
  GROUP BY p.id, p.display_name
  ORDER BY weekly_xp DESC, p.display_name ASC NULLS LAST
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_weekly_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_weekly_leaderboard() TO authenticated;