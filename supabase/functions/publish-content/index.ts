import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { type, story_id, session_id, title, synopsis } = await req.json();

    if (type === "game") {
      // Verify ownership
      const { data: story } = await supabase
        .from("stories")
        .select("*")
        .eq("id", story_id)
        .eq("user_id", user.id)
        .single();
      if (!story) throw new Error("Story not found or not owned");

      // Check if already published
      const { data: existing } = await supabase
        .from("public_games")
        .select("story_id")
        .eq("story_id", story_id)
        .maybeSingle();
      if (existing) throw new Error("이미 공개된 게임입니다.");

      // Mark story as public
      await supabase.from("stories").update({
        is_public: true,
        synopsis: synopsis || story.synopsis,
      }).eq("id", story_id);

      // Insert public_game
      await supabase.from("public_games").insert({
        story_id,
        creator_id: user.id,
      });

      return new Response(JSON.stringify({ success: true, type: "game" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "novel") {
      if (!session_id) throw new Error("session_id required for novel");

      // Verify session is finished
      const { data: session } = await supabase
        .from("story_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user.id)
        .single();
      if (!session) throw new Error("Session not found");
      if (!session.finished) throw new Error("완료된 세션만 소설로 공개할 수 있습니다.");

      // Get story
      const { data: story } = await supabase
        .from("stories")
        .select("*")
        .eq("id", session.story_id)
        .single();
      if (!story) throw new Error("Story not found");

      // Get cover from first node
      const { data: firstNode } = await supabase
        .from("story_nodes")
        .select("image_url")
        .eq("session_id", session_id)
        .eq("step", 0)
        .maybeSingle();

      await supabase.from("public_novels").insert({
        session_id,
        story_id: session.story_id,
        creator_id: user.id,
        title: title || story.title,
        synopsis: synopsis || story.synopsis,
        cover_url: firstNode?.image_url || story.cover_url,
      });

      await supabase.from("stories").update({ is_public: true }).eq("id", session.story_id);

      return new Response(JSON.stringify({ success: true, type: "novel" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid type. Use 'game' or 'novel'.");
  } catch (e) {
    console.error("publish error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
