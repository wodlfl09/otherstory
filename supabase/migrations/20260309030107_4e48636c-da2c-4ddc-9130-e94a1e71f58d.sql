
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Update RLS: owners can still see their deleted stories
-- Admin can see all deleted stories (handled via edge function)
