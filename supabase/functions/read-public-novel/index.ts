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

    const { novel_id, idempotency_key } = await req.json();
    if (!novel_id || !idempotency_key) throw new Error("Missing params");

    // Check active access_pass
    const { data: activePass } = await supabase
      .from("access_passes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", "novel")
      .eq("target_id", novel_id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (activePass) {
      return new Response(JSON.stringify({ access: true, has_pass: true }), {
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
      return new Response(JSON.stringify({ access: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (!profile) throw new Error("Profile not found");
    if (profile.credits < 10) throw new Error("크레딧이 부족합니다. (10 크레딧 필요)");

    // Get novel
    const { data: novel } = await supabase
      .from("public_novels")
      .select("*")
      .eq("id", novel_id)
      .single();
    if (!novel) throw new Error("Novel not found");

    // Deduct 10 from reader
    await supabase.from("profiles").update({ credits: profile.credits - 10 }).eq("user_id", user.id);

    // Credit creator +1
    const { data: creatorProfile } = await supabase
      .from("profiles")
      .select("credits, user_id")
      .eq("user_id", novel.creator_id)
      .single();
    if (creatorProfile) {
      await supabase.from("profiles").update({ credits: creatorProfile.credits + 1 }).eq("user_id", novel.creator_id);
      await supabase.from("credits_ledger").insert({
        user_id: novel.creator_id,
        delta: 1,
        reason: "read_public_novel_royalty",
        meta: { novel_id, reader_id: user.id },
      });
    }

    // Record tx
    await supabase.from("credit_tx").insert({
      idempotency_key,
      user_id: user.id,
      kind: "read_public_novel",
      delta: -10,
      ref: { novel_id },
    });
    await supabase.from("credits_ledger").insert({
      user_id: user.id,
      delta: -10,
      reason: "read_public_novel",
      meta: { novel_id },
    });

    // Increment view_count
    await supabase.from("public_novels").update({ view_count: (novel.view_count || 0) + 1 }).eq("id", novel_id);

    // Issue 30-min access_pass
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await supabase.from("access_passes").insert({
      user_id: user.id,
      target_type: "novel",
      target_id: novel_id,
      expires_at: expiresAt,
    });

    return new Response(JSON.stringify({ access: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("read-public-novel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
