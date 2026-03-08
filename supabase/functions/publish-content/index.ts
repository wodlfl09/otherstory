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

    const { type, story_id, session_id, title, synopsis, cover_url, protagonist_name } = await req.json();

    if (type === "game") {
      if (!story_id) throw new Error("story_id required");

      const { data: story } = await supabase
        .from("stories")
        .select("*")
        .eq("id", story_id)
        .eq("user_id", user.id)
        .single();
      if (!story) throw new Error("Story not found or not owned");

      // Auto cover from first scene if not provided
      let finalCover = cover_url || story.cover_url;
      if (!finalCover) {
        const { data: sessions } = await supabase
          .from("story_sessions")
          .select("id")
          .eq("story_id", story_id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (sessions?.length) {
          const { data: node } = await supabase
            .from("story_nodes")
            .select("image_url")
            .eq("session_id", sessions[0].id)
            .eq("step", 0)
            .maybeSingle();
          finalCover = node?.image_url || null;
        }
      }

      // Update story metadata
      await supabase.from("stories").update({
        is_public: true,
        synopsis: synopsis || story.synopsis,
        cover_url: finalCover || story.cover_url,
        protagonist_name: protagonist_name || story.protagonist_name,
      }).eq("id", story_id);

      // Upsert public_game
      const { data: existing } = await supabase
        .from("public_games")
        .select("story_id")
        .eq("story_id", story_id)
        .maybeSingle();

      if (existing) {
        // Already published — update is fine
        return new Response(JSON.stringify({ success: true, type: "game", updated: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

      const { data: session } = await supabase
        .from("story_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user.id)
        .single();
      if (!session) throw new Error("Session not found");
      if (!session.finished) throw new Error("완료된 세션만 소설로 공개할 수 있습니다.");

      const { data: story } = await supabase
        .from("stories")
        .select("*")
        .eq("id", session.story_id)
        .single();
      if (!story) throw new Error("Story not found");

      // Check duplicate
      const { data: existingNovel } = await supabase
        .from("public_novels")
        .select("id")
        .eq("session_id", session_id)
        .maybeSingle();
      if (existingNovel) throw new Error("이미 공개된 소설입니다.");

      // Auto cover
      let finalCover = cover_url || story.cover_url;
      if (!finalCover) {
        const { data: firstNode } = await supabase
          .from("story_nodes")
          .select("image_url")
          .eq("session_id", session_id)
          .eq("step", 0)
          .maybeSingle();
        finalCover = firstNode?.image_url || null;
      }

      const { data: novel } = await supabase.from("public_novels").insert({
        session_id,
        story_id: session.story_id,
        creator_id: user.id,
        title: title || story.title,
        synopsis: synopsis || story.synopsis,
        cover_url: finalCover,
      }).select("id").single();

      await supabase.from("stories").update({ is_public: true }).eq("id", session.story_id);

      return new Response(JSON.stringify({ success: true, type: "novel", novel_id: novel?.id }), {
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
