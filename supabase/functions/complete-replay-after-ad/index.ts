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

    // Idempotency
    const { data: existingTx } = await supabase
      .from("credit_tx")
      .select("idempotency_key")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existingTx) {
      const { data: sessions } = await supabase
        .from("story_sessions")
        .select("id")
        .eq("story_id", story_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      return new Response(JSON.stringify({ session_id: sessions?.[0]?.id, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-check daily limit
    const today = new Date().toISOString().split("T")[0];
    const { data: dailyLimit } = await supabase
      .from("replay_daily_limits")
      .select("count")
      .eq("user_id", user.id)
      .eq("day", today)
      .maybeSingle();

    const currentCount = dailyLimit?.count ?? 0;
    if (currentCount >= 3) throw new Error("일일 재진행 제한(3회)에 도달했습니다.");

    // Record tx (0 delta, ad-based)
    await supabase.from("credit_tx").insert({
      idempotency_key,
      user_id: user.id,
      kind: "replay_story_ad",
      delta: 0,
      ref: { story_id },
    });
    await supabase.from("credits_ledger").insert({
      user_id: user.id,
      delta: 0,
      reason: "replay_story_ad",
      meta: { story_id },
    });

    // Get story
    const { data: story } = await supabase.from("stories").select("*").eq("id", story_id).single();
    if (!story) throw new Error("Story not found");
    const config = (story.config as any) || {};

    const { data: profile } = await supabase.from("profiles").select("plan").eq("user_id", user.id).single();

    // Create session (no credit deduction)
    const { data: session, error: sessErr } = await supabase.from("story_sessions").insert({
      story_id: story.id,
      user_id: user.id,
      duration_min: config.duration_min || 10,
      choices_count: config.choices_count || 2,
      endings_count: config.endings_count || 2,
      step: 0,
      state: {
        total_steps: config.total_steps || 7,
        name: config.name,
        gender: config.gender,
        protagonist: config.protagonist,
        keywords: config.keywords,
        customStory: config.customStory,
        genre: story.genre,
        character_bible: config.character_bible,
        history: [],
      },
      ad_required: profile?.plan === "free",
    }).select().single();
    if (sessErr) throw sessErr;

    // Increment daily count (session confirmed)
    if (dailyLimit) {
      await supabase.from("replay_daily_limits").update({ count: currentCount + 1 }).eq("user_id", user.id).eq("day", today);
    } else {
      await supabase.from("replay_daily_limits").insert({ user_id: user.id, day: today, count: 1 });
    }

    // Generate first scene
    const choicesCount = config.choices_count || 2;
    let sceneText = `${config.name || "주인공"}의 새로운 이야기가 시작됩니다...`;
    const choicesList: any[] = [];
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY) {
      try {
        const genreDescMap: Record<string, string> = {
          sf: "사이버펑크/우주 SF", fantasy: "하이 판타지", mystery: "하드보일드 추리",
          action: "고속 액션 스릴러", horror: "심리 공포", romance: "감성 로맨스",
          comic: "유쾌한 코미디", martial: "무협/검협", adult: "성인 드라마",
        };
        const genreDesc = genreDescMap[story.genre] || story.genre;
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: `당신은 ${genreDesc} 장르의 웹소설 작가입니다. 800~1200자 한국어 장면을 생성하세요. 주인공: ${config.name} (${config.gender === "male" ? "남성" : "여성"})` },
              { role: "user", content: `새로운 ${genreDesc} 첫 장면과 ${choicesCount}개 선택지를 생성하세요.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "generate_scene",
                description: "Generate scene",
                parameters: {
                  type: "object",
                  properties: {
                    scene_text: { type: "string" },
                    image_brief: { type: "string" },
                    choices: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string" },
                          attitude: { type: "string", enum: ["positive", "negative", "avoidance", "neutral"] },
                        },
                        required: ["id", "label", "attitude"],
                      },
                    },
                  },
                  required: ["scene_text", "image_brief", "choices"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "generate_scene" } },
          }),
        });
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const args = JSON.parse(toolCall.function.arguments);
            sceneText = args.scene_text || sceneText;
            if (args.choices) {
              args.choices.slice(0, choicesCount).forEach((c: any, i: number) => {
                choicesList.push({ id: c.id || `c${i}`, label: c.label, attitude: c.attitude || "neutral" });
              });
            }
          }
        }
      } catch (err) { console.error("AI error:", err); }
    }
    if (choicesList.length === 0) {
      for (let i = 0; i < choicesCount; i++) choicesList.push({ id: `c${i}`, label: `선택지 ${i + 1}`, attitude: "neutral" });
    }

    await supabase.from("story_nodes").insert({
      session_id: session.id, step: 0, variant: "main", scene_text: sceneText, choices: choicesList,
    });

    return new Response(JSON.stringify({ session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("complete-replay-after-ad error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
