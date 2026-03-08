
-- Add story_id and node_id to story_nodes for graph-based structure
ALTER TABLE story_nodes ADD COLUMN IF NOT EXISTS story_id uuid REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE story_nodes ADD COLUMN IF NOT EXISTS node_id text;
ALTER TABLE story_nodes ALTER COLUMN session_id DROP NOT NULL;

-- Add current_node_id to story_sessions
ALTER TABLE story_sessions ADD COLUMN IF NOT EXISTS current_node_id text DEFAULT 'n0';

-- RLS: Users with sessions can view story nodes
CREATE POLICY "View nodes via session"
ON story_nodes FOR SELECT TO authenticated
USING (
  story_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM story_sessions ss 
    WHERE ss.story_id = story_nodes.story_id AND ss.user_id = auth.uid()
  )
);

-- RLS: Anyone can view public story nodes
CREATE POLICY "View public story nodes"
ON story_nodes FOR SELECT TO authenticated
USING (
  story_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM stories s WHERE s.id = story_nodes.story_id AND s.is_public = true
  )
);
