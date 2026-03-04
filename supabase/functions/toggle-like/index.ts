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

    const { target_type, target_id } = await req.json();
    if (!target_type || !target_id) throw new Error("Missing params");
    if (!["game", "novel"].includes(target_type)) throw new Error("Invalid target_type");

    // Check if already liked
    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", target_type)
      .eq("target_id", target_id)
      .maybeSingle();

    if (existing) {
      // Unlike
      await supabase.from("likes").delete().eq("id", existing.id);

      // Decrement like_count
      if (target_type === "game") {
        const { data: g } = await supabase.from("public_games").select("like_count").eq("story_id", target_id).single();
        if (g) await supabase.from("public_games").update({ like_count: Math.max(0, (g.like_count || 0) - 1) }).eq("story_id", target_id);
      } else {
        const { data: n } = await supabase.from("public_novels").select("like_count").eq("id", target_id).single();
        if (n) await supabase.from("public_novels").update({ like_count: Math.max(0, (n.like_count || 0) - 1) }).eq("id", target_id);
      }

      return new Response(JSON.stringify({ liked: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Like
      await supabase.from("likes").insert({
        user_id: user.id,
        target_type,
        target_id,
      });

      if (target_type === "game") {
        const { data: g } = await supabase.from("public_games").select("like_count").eq("story_id", target_id).single();
        if (g) await supabase.from("public_games").update({ like_count: (g.like_count || 0) + 1 }).eq("story_id", target_id);
      } else {
        const { data: n } = await supabase.from("public_novels").select("like_count").eq("id", target_id).single();
        if (n) await supabase.from("public_novels").update({ like_count: (n.like_count || 0) + 1 }).eq("id", target_id);
      }

      return new Response(JSON.stringify({ liked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("toggle-like error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
