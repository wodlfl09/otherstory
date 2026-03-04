
-- Enum types
CREATE TYPE public.app_plan AS ENUM ('free', 'basic', 'pro');
CREATE TYPE public.source_type AS ENUM ('simple', 'custom', 'external');
CREATE TYPE public.refund_status AS ENUM ('pending', 'approved', 'rejected');

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  gender TEXT,
  adult_verified BOOLEAN NOT NULL DEFAULT false,
  plan app_plan NOT NULL DEFAULT 'free',
  credits INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Credits ledger
CREATE TABLE public.credits_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credits_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ledger" ON public.credits_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert ledger" ON public.credits_ledger FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Stories
CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  source_type source_type NOT NULL DEFAULT 'simple',
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own stories" ON public.stories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own stories" ON public.stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stories" ON public.stories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own stories" ON public.stories FOR DELETE USING (auth.uid() = user_id);

-- Story sessions
CREATE TABLE public.story_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  duration_min INTEGER NOT NULL DEFAULT 10,
  choices_count INTEGER NOT NULL DEFAULT 2,
  endings_count INTEGER NOT NULL DEFAULT 2,
  step INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}',
  ad_required BOOLEAN NOT NULL DEFAULT false,
  ad_shown BOOLEAN NOT NULL DEFAULT false,
  finished BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.story_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions" ON public.story_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sessions" ON public.story_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.story_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.story_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Story nodes
CREATE TABLE public.story_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.story_sessions(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  variant TEXT NOT NULL DEFAULT 'main',
  scene_text TEXT NOT NULL,
  image_url TEXT,
  image_prompt TEXT,
  choices JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.story_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own nodes" ON public.story_nodes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.story_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "System can insert nodes" ON public.story_nodes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.story_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- Library items
CREATE TABLE public.library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, story_id)
);
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own library" ON public.library_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own library" ON public.library_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own library" ON public.library_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own library" ON public.library_items FOR DELETE USING (auth.uid() = user_id);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan app_plan NOT NULL DEFAULT 'free',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscription" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Refund requests
CREATE TABLE public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_ref TEXT NOT NULL,
  reason TEXT,
  status refund_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own refunds" ON public.refund_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create refund" ON public.refund_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Image style profiles
CREATE TABLE public.image_style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  genres TEXT[] NOT NULL DEFAULT '{}',
  model_id TEXT NOT NULL,
  prompt_prefix TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL DEFAULT 1024,
  height INTEGER NOT NULL DEFAULT 1024,
  steps INTEGER NOT NULL DEFAULT 4,
  cfg NUMERIC NOT NULL DEFAULT 1,
  upscale BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.image_style_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read style profiles" ON public.image_style_profiles FOR SELECT USING (true);

-- Storage bucket for story images
INSERT INTO storage.buckets (id, name, public) VALUES ('story-images', 'story-images', true);
CREATE POLICY "Anyone can view story images" ON storage.objects FOR SELECT USING (bucket_id = 'story-images');
CREATE POLICY "Authenticated users can upload story images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'story-images' AND auth.role() = 'authenticated');
