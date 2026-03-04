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

    const { story_id, idempotency_key } = await req.json();
    if (!story_id || !idempotency_key) throw new Error("Missing params");

    // Check active access_pass
    const { data: activePass } = await supabase
      .from("access_passes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", "game")
      .eq("target_id", story_id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (activePass) {
      // Already has valid pass, find latest session
      const { data: sessions } = await supabase
        .from("story_sessions")
        .select("id")
        .eq("story_id", story_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      return new Response(JSON.stringify({ session_id: sessions?.[0]?.id, has_pass: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check
    const { data: existingTx } = await supabase
      .from("credit_tx")
      .select("idempotency_key")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existingTx) {
      return new Response(JSON.stringify({ error: "Already processed", duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get player profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (!profile) throw new Error("Profile not found");
    if (profile.credits < 10) throw new Error("크레딧이 부족합니다. (10 크레딧 필요)");

    // Get public game
    const { data: game } = await supabase
      .from("public_games")
      .select("*, story:stories(*)")
      .eq("story_id", story_id)
      .single();
    if (!game) throw new Error("Public game not found");

    // Deduct 10 credits from player
    await supabase.from("profiles").update({ credits: profile.credits - 10 }).eq("user_id", user.id);

    // Credit creator +1
    const { data: creatorProfile } = await supabase
      .from("profiles")
      .select("credits, user_id")
      .eq("user_id", game.creator_id)
      .single();
    if (creatorProfile) {
      await supabase.from("profiles").update({ credits: creatorProfile.credits + 1 }).eq("user_id", game.creator_id);
      await supabase.from("credits_ledger").insert({
        user_id: game.creator_id,
        delta: 1,
        reason: "play_public_game_royalty",
        meta: { story_id, player_id: user.id },
      });
    }

    // Record transaction
    await supabase.from("credit_tx").insert({
      idempotency_key,
      user_id: user.id,
      kind: "play_public_game",
      delta: -10,
      ref: { story_id },
    });
    await supabase.from("credits_ledger").insert({
      user_id: user.id,
      delta: -10,
      reason: "play_public_game",
      meta: { story_id },
    });

    // Increment play_count
    await supabase.rpc("increment_play_count_not_exists_so_raw", {}).catch(() => {});
    await supabase.from("public_games").update({ play_count: (game.play_count || 0) + 1 }).eq("story_id", story_id);

    // Issue 30-min access_pass
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await supabase.from("access_passes").insert({
      user_id: user.id,
      target_type: "game",
      target_id: story_id,
      expires_at: expiresAt,
    });

    // Create new session from the story config
    const storyData = game.story as any;
    const config = storyData?.config || {};
    
    const { data: session, error: sessErr } = await supabase.from("story_sessions").insert({
      story_id,
      user_id: user.id,
      duration_min: config.duration_min || 10,
      choices_count: config.choices_count || 2,
      endings_count: config.endings_count || 2,
      step: 0,
      state: {
        total_steps: config.total_steps || 7,
        name: config.name || "플레이어",
        gender: config.gender || "male",
        protagonist: config.protagonist,
        keywords: config.keywords,
        genre: storyData.genre,
        character_bible: config.character_bible,
        history: [],
      },
      ad_required: false,
    }).select().single();

    if (sessErr) throw sessErr;

    // Generate first scene
    const sceneText = `${config.name || "주인공"}의 공개 게임이 시작됩니다...`;
    const choices = [];
    const choicesCount = config.choices_count || 2;
    for (let i = 0; i < choicesCount; i++) {
      choices.push({ id: `c${i}`, label: `선택지 ${i + 1}`, attitude: "neutral" });
    }

    await supabase.from("story_nodes").insert({
      session_id: session.id,
      step: 0,
      variant: "main",
      scene_text: sceneText,
      choices,
    });

    return new Response(JSON.stringify({ session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("play-public-game error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
