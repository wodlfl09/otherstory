import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { story_id, idempotency_key } = await req.json();
    if (!story_id || !idempotency_key) throw new Error("Missing story_id or idempotency_key");

    // Idempotency check
    const { data: existingTx } = await supabase.from("credit_tx").select("idempotency_key").eq("idempotency_key", idempotency_key).maybeSingle();
    if (existingTx) {
      const { data: sessions } = await supabase.from("story_sessions").select("id")
        .eq("story_id", story_id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
      return new Response(JSON.stringify({ session_id: sessions?.[0]?.id, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Daily replay limit
    const today = new Date().toISOString().split("T")[0];
    const { data: dailyLimit } = await supabase.from("replay_daily_limits").select("count").eq("user_id", user.id).eq("day", today).maybeSingle();
    const currentCount = dailyLimit?.count ?? 0;
    if (currentCount >= 3) throw new Error("일일 재진행 제한(3회)에 도달했습니다.");

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    const plan = profile.plan || "free";

    // For paid plans, deduct credits. No ad gate for replay anymore.
    if (plan !== "free") {
      if (profile.credits >= 10) {
        await supabase.from("profiles").update({ credits: profile.credits - 10 }).eq("user_id", user.id);
        await supabase.from("credit_tx").insert({ idempotency_key, user_id: user.id, kind: "replay_story", delta: -10, ref: { story_id } });
        await supabase.from("credits_ledger").insert({ user_id: user.id, delta: -10, reason: "replay_story", meta: { story_id } });
      }
      // If not enough credits, allow free replay for paid users
    }
    // Free plan: no credits needed, no ad for replay

    // Get story config
    const { data: story } = await supabase.from("stories").select("*").eq("id", story_id).single();
    if (!story) throw new Error("Story not found");
    const config = (story.config as any) || {};

    // Create new session pointing to existing nodes
    const { data: session, error: sessErr } = await supabase.from("story_sessions").insert({
      story_id: story.id,
      user_id: user.id,
      duration_min: config.duration_min || 10,
      choices_count: config.choices_count || 2,
      endings_count: config.endings_count || 2,
      step: 0,
      current_node_id: "n0",
      state: { genre: story.genre, visited_nodes: [], chosen_choices: [] },
      ad_required: false,
      ad_shown: false,
    }).select().single();
    if (sessErr) throw sessErr;

    // Update daily replay count
    if (dailyLimit) {
      await supabase.from("replay_daily_limits").update({ count: currentCount + 1 }).eq("user_id", user.id).eq("day", today);
    } else {
      await supabase.from("replay_daily_limits").insert({ user_id: user.id, day: today, count: 1 });
    }

    return new Response(JSON.stringify({ session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("replay error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
