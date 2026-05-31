-- Badges reference table
CREATE TABLE public.badges (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text
);

GRANT SELECT ON public.badges TO anon, authenticated;
GRANT ALL ON public.badges TO service_role;

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Badges readable by anyone authed"
  ON public.badges FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.badges (id, name, description, icon) VALUES
  ('first_quiz',     'First Steps',     'Completed your first quiz',                          'footprints'),
  ('week_streak',    'On a Roll',       'Maintained a 7-day study streak',                    'flame'),
  ('perfect_quiz',   'Flawless',        'Scored 100% on a quiz',                              'sparkles'),
  ('early_bird',     'Early Bird',      'Studied before 7am',                                 'sunrise'),
  ('comeback',       'Comeback Kid',    'Passed a quiz you previously failed',                'rotate-ccw'),
  ('fifty_cards',    'Card Shark',      'Reviewed 50 flashcards',                             'layers'),
  ('subject_master', 'Subject Master',  'Completed every chapter in a subject',               'trophy'),
  ('curious',        'Curious Mind',    'Asked the tutor 10 questions',                       'message-circle');

-- User-earned badges
CREATE TABLE public.user_badges (
  user_id    uuid NOT NULL,
  badge_id   text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

GRANT SELECT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own badges"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies for authenticated → only service_role can write.

CREATE INDEX user_badges_user_id_idx ON public.user_badges(user_id);