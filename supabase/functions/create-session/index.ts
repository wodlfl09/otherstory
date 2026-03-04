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

    const body = await req.json();
    const { genre, name, gender, protagonist, keywords, customStory, duration_min, choices_count, endings_count } = body;

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profile) throw new Error("Profile not found");

    // Plan validation
    const planRank: Record<string, number> = { free: 0, basic: 1, pro: 2 };
    const rank = planRank[profile.plan] ?? 0;

    if (duration_min > 10 && rank < 1) throw new Error("Basic 이상 플랜이 필요합니다 (20분).");
    if (duration_min > 20 && rank < 2) throw new Error("Pro 플랜이 필요합니다 (30분).");
    if (choices_count > 2 && rank < 1) throw new Error("Basic 이상 플랜이 필요합니다 (선택지 3개).");
    if (endings_count > 2 && rank < 1) throw new Error("Basic 이상 플랜이 필요합니다 (결말 3개).");

    // Credit check
    if (profile.credits < 1) throw new Error("크레딧이 부족합니다.");

    // Deduct credit
    await supabase.from("profiles").update({ credits: profile.credits - 1 }).eq("user_id", user.id);
    await supabase.from("credits_ledger").insert({
      user_id: user.id,
      delta: -1,
      reason: "create_session",
      meta: { genre },
    });

    // Create story
    const { data: story, error: storyErr } = await supabase.from("stories").insert({
      user_id: user.id,
      title: `${genre} 모험 - ${name}`,
      genre,
      source_type: customStory ? "custom" : "simple",
      config: { name, gender, protagonist, keywords, customStory },
    }).select().single();

    if (storyErr) throw storyErr;

    // Determine total steps
    const totalSteps: Record<number, number> = { 10: 7, 20: 13, 30: 19 };
    const steps = totalSteps[duration_min] ?? 7;

    // Ad required for free plan
    const adRequired = profile.plan === "free";

    // Create session
    const { data: session, error: sessErr } = await supabase.from("story_sessions").insert({
      story_id: story.id,
      user_id: user.id,
      duration_min,
      choices_count,
      endings_count,
      step: 0,
      state: { total_steps: steps, name, gender, protagonist, keywords, customStory, history: [] },
      ad_required: adRequired,
    }).select().single();

    if (sessErr) throw sessErr;

    // Generate first scene via AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let sceneText = `[${genre}] ${name}의 이야기가 시작됩니다.\n\n어둠 속에서 눈을 뜬 ${name}. 낯선 공간, 낯선 냄새. 기억이 흐릿하지만, 한 가지는 확실했다. 이곳은 분명 현실이 아니라는 것.\n\n주변을 둘러보니 ${genre === 'sf' ? '차가운 금속벽과 깜빡이는 홀로그램 패널이 보인다' : genre === 'fantasy' ? '고대 룬이 새겨진 석벽과 희미하게 빛나는 수정이 보인다' : genre === 'horror' ? '얼룩진 벽지와 삐걱거리는 낡은 가구가 보인다' : '미지의 풍경이 펼쳐져 있다'}.`;

    const choicesList = [];
    for (let i = 0; i < choices_count; i++) {
      const attitudes = ["탐색", "경계", "회피"];
      const labels = [
        `조심스럽게 주변을 탐색한다.`,
        `경계하며 무기가 될 것을 찾는다.`,
        `일단 이곳을 벗어나기로 한다.`,
      ];
      choicesList.push({
        id: `c${i}`,
        label: labels[i] || `선택지 ${i + 1}`,
        attitude: attitudes[i] || "neutral",
      });
    }

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `당신은 ${genre} 장르의 몰입형 소설 작가입니다. 한국어로 750~1200자의 장면 텍스트를 생성하세요. 주인공 이름은 "${name}", 성별은 "${gender}". ${protagonist ? `주인공 설정: ${protagonist}.` : ""} ${keywords ? `키워드: ${keywords}.` : ""} ${customStory ? `사용자 스토리: ${customStory}.` : ""} 문학적이고 감각적인 묘사로, 독자가 그 장면에 있는 것 같은 몰입감을 만들어주세요.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `${genre} 장르의 첫 번째 장면을 생성해주세요. 긴장감 있는 도입부로 시작하세요.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "generate_scene",
                description: "Generate a story scene with text and choices",
                parameters: {
                  type: "object",
                  properties: {
                    scene_text: { type: "string", description: "750-1200 character scene text in Korean" },
                    choices: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string", description: "Choice label in Korean" },
                          attitude: { type: "string", enum: ["positive", "negative", "avoidance", "neutral"] },
                        },
                        required: ["id", "label", "attitude"],
                      },
                    },
                  },
                  required: ["scene_text", "choices"],
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
            if (args.choices && args.choices.length > 0) {
              choicesList.length = 0;
              args.choices.slice(0, choices_count).forEach((c: any, i: number) => {
                choicesList.push({
                  id: c.id || `c${i}`,
                  label: c.label,
                  attitude: c.attitude || "neutral",
                });
              });
            }
          }
        }
      } catch (aiErr) {
        console.error("AI generation error:", aiErr);
        // Continue with fallback text
      }
    }

    // Insert first node
    await supabase.from("story_nodes").insert({
      session_id: session.id,
      step: 0,
      variant: "main",
      scene_text: sceneText,
      image_prompt: `${genre} scene, cinematic, ${name}`,
      choices: choicesList,
    });

    return new Response(JSON.stringify({ session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-session error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
