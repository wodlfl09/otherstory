
-- 1. Add columns to stories
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS synopsis text;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS protagonist_name text;

-- 2. Add role to profiles
DO $$ BEGIN
  CREATE TYPE public.app_role_v2 AS ENUM ('user', 'subadmin', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 3. Create new tables
CREATE TABLE IF NOT EXISTS public.public_games (
  story_id uuid PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL,
  published_at timestamptz DEFAULT now(),
  play_count int DEFAULT 0,
  like_count int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.public_novels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.story_sessions(id) ON DELETE CASCADE NOT NULL,
  story_id uuid REFERENCES public.stories(id) ON DELETE CASCADE NOT NULL,
  creator_id uuid NOT NULL,
  title text NOT NULL,
  synopsis text,
  cover_url text,
  published_at timestamptz DEFAULT now(),
  view_count int DEFAULT 0,
  like_count int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_tx (
  idempotency_key uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  delta int NOT NULL DEFAULT 0,
  ref jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.replay_daily_limits (
  user_id uuid NOT NULL,
  day date NOT NULL,
  count int DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- 4. Security definer function for role check
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role, 'user') FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- 5. RLS policies
ALTER TABLE public.public_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view public games" ON public.public_games FOR SELECT USING (true);
CREATE POLICY "Creators can insert games" ON public.public_games FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Creators or admins can update games" ON public.public_games FOR UPDATE USING (
  creator_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "Creators or admins can delete games" ON public.public_games FOR DELETE USING (
  creator_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin'
);

ALTER TABLE public.public_novels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view public novels" ON public.public_novels FOR SELECT USING (true);
CREATE POLICY "Creators can insert novels" ON public.public_novels FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Creators or admins can update novels" ON public.public_novels FOR UPDATE USING (
  creator_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "Creators or admins can delete novels" ON public.public_novels FOR DELETE USING (
  creator_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin'
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view likes" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Auth users can insert likes" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own likes" ON public.likes FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comments" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Auth users can insert comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.access_passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own passes" ON public.access_passes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert passes" ON public.access_passes FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.credit_tx ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tx" ON public.credit_tx FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert tx" ON public.credit_tx FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.replay_daily_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own replay limits" ON public.replay_daily_limits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can upsert replay limits" ON public.replay_daily_limits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "System can update replay limits" ON public.replay_daily_limits FOR UPDATE USING (auth.uid() = user_id);

-- Allow public stories to be viewed by anyone
CREATE POLICY "Anyone can view public stories" ON public.stories FOR SELECT USING (is_public = true);
