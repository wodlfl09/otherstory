
CREATE TABLE public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.story_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'generating_text',
  progress_percent integer NOT NULL DEFAULT 0,
  current_stage text NOT NULL DEFAULT '스토리 구조 생성 중',
  eta_seconds integer DEFAULT 120,
  total_nodes integer NOT NULL DEFAULT 0,
  completed_nodes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON public.generation_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert jobs" ON public.generation_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "System can update jobs" ON public.generation_jobs FOR UPDATE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
