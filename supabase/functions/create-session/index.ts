import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateImage(
  supabase: any,
  genre: string,
  imageBrief: string,
  sessionId: string,
  step: number
): Promise<string | null> {
  const CF_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null;

  try {
    // Get style profile for genre
    const { data: styles } = await supabase
      .from("image_style_profiles")
      .select("*")
      .contains("genres", [genre]);

    const style = styles?.[0];
    if (!style) return null;

    const prompt = `${style.prompt_prefix}${imageBrief}`;

    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${style.model_id}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negative_prompt: style.negative_prompt,
          width: style.width,
          height: style.height,
          num_steps: style.steps,
          guidance: style.cfg,
        }),
      }
    );

    if (!cfResponse.ok) {
      console.error("CF image gen failed:", cfResponse.status, await cfResponse.text());
      // Retry once
      const retry = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${style.model_id}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            negative_prompt: style.negative_prompt,
            width: style.width,
            height: style.height,
            num_steps: style.steps,
            guidance: style.cfg,
          }),
        }
      );
      if (!retry.ok) return null;
      const retryData = await retry.arrayBuffer();
      const fileName = `${sessionId}/step_${step}.png`;
      const { error: uploadErr } = await supabase.storage.from("story-images").upload(fileName, retryData, { contentType: "image/png", upsert: true });
      if (uploadErr) return null;
      const { data: urlData } = supabase.storage.from("story-images").getPublicUrl(fileName);
      return urlData?.publicUrl || null;
    }

    const imageData = await cfResponse.arrayBuffer();
    const fileName = `${sessionId}/step_${step}.png`;
    const { error: uploadErr } = await supabase.storage.from("story-images").upload(fileName, imageData, { contentType: "image/png", upsert: true });
    if (uploadErr) { console.error("Upload error:", uploadErr); return null; }

    const { data: urlData } = supabase.storage.from("story-images").getPublicUrl(fileName);
    return urlData?.publicUrl || null;
  } catch (err) {
    console.error("Image gen error:", err);
    return null;
  }
}

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
      user_id: user.id, delta: -1, reason: "create_session", meta: { genre },
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

    // Auto-save to library (check plan limit)
    const { count: libCount } = await supabase
      .from("library_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const maxLib = profile.plan === "pro" ? Infinity : profile.plan === "basic" ? 9 : 3;
    if ((libCount ?? 0) < maxLib) {
      await supabase.from("library_items").insert({
        user_id: user.id,
        story_id: story.id,
      });
    }

    // Determine total steps
    const totalSteps: Record<number, number> = { 10: 7, 20: 13, 30: 19 };
    const steps = totalSteps[duration_min] ?? 7;
    const adRequired = profile.plan === "free";

    // Create session
    const { data: session, error: sessErr } = await supabase.from("story_sessions").insert({
      story_id: story.id,
      user_id: user.id,
      duration_min,
      choices_count,
      endings_count,
      step: 0,
      state: { total_steps: steps, name, gender, protagonist, keywords, customStory, genre, history: [] },
      ad_required: adRequired,
    }).select().single();

    if (sessErr) throw sessErr;

    // Generate first scene via AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let sceneText = "";
    let imageBrief = `${genre} opening scene, mysterious atmosphere, ${name}`;
    const choicesList: any[] = [];

    if (LOVABLE_API_KEY) {
      try {
        const genreDescMap: Record<string, string> = {
          sf: "사이버펑크/우주 SF", fantasy: "하이 판타지", mystery: "하드보일드 추리",
          action: "고속 액션 스릴러", horror: "심리 공포", romance: "감성 로맨스",
          comic: "유쾌한 코미디", martial: "무협/검협", adult: "성인 드라마",
        };
        const genreDesc = genreDescMap[genre] || genre;

        const systemPrompt = `당신은 ${genreDesc} 장르 전문 프리미엄 웹소설 작가입니다.
다음 규칙을 반드시 따르세요:
1. 한국어 750~1200자, 2~3문단으로 작성
2. 감각 묘사(시각/청각/촉각/후각)를 반드시 포함
3. 주인공의 내면(감정/사고)을 자연스럽게 녹여내기
4. 사건이 진전되는 긴장감 있는 전개
5. 마지막 문장은 선택을 유도하는 갈림길 상황으로 마무리
6. 클리셰(갑자기 눈을 떴다/심장이 빠르게 뛰었다 등) 사용 금지
7. "~했다", "~였다" 과거형 서술체 사용

주인공: ${name} (${gender === "male" ? "남성" : "여성"})
${protagonist ? `설정: ${protagonist}` : ""}
${keywords ? `핵심 키워드: ${keywords}` : ""}
${customStory ? `유저 스토리 배경: ${customStory}` : ""}`;

        // First generation
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
              { role: "user", content: `${genreDesc} 장르의 첫 번째 장면을 생성하세요. 도입부는 감각적이고 긴장감 있게, 마지막은 주인공이 선택해야 할 갈림길 상황으로 끝내세요.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "generate_scene",
                description: "Generate story scene with text, image brief, and choices",
                parameters: {
                  type: "object",
                  properties: {
                    scene_text: { type: "string", description: "750-1200자 한국어 장면 텍스트" },
                    image_brief: { type: "string", description: "16:9 삽화를 위한 영어 프롬프트, 50단어 이내" },
                    choices: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string", description: "한국어 선택지 라벨" },
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
            sceneText = args.scene_text || "";
            imageBrief = args.image_brief || imageBrief;
            if (args.choices?.length > 0) {
              args.choices.slice(0, choices_count).forEach((c: any, i: number) => {
                choicesList.push({ id: c.id || `c${i}`, label: c.label, attitude: c.attitude || "neutral" });
              });
            }
          }
        } else if (aiResponse.status === 429) {
          console.error("AI rate limited");
        } else if (aiResponse.status === 402) {
          console.error("AI payment required");
        }

        // Rewrite pass for quality
        if (sceneText && LOVABLE_API_KEY) {
          try {
            const rewriteResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: `당신은 프리미엄 웹소설 편집자입니다. 아래 텍스트를 더 문학적이고 몰입감 있게 리라이트하세요.
규칙: 750~1200자 유지, 클리셰 제거, 감각 묘사 강화, 문장 리듬 다양화(단문/복문 교차), 과거형 서술체 유지.
원문의 핵심 사건과 선택 유도 구조는 반드시 보존하세요.` },
                  { role: "user", content: sceneText },
                ],
              }),
            });
            if (rewriteResp.ok) {
              const rewriteData = await rewriteResp.json();
              const rewritten = rewriteData.choices?.[0]?.message?.content;
              if (rewritten && rewritten.length >= 500) sceneText = rewritten;
            }
          } catch (rwErr) { console.error("Rewrite error:", rwErr); }
        }
      } catch (aiErr) {
        console.error("AI generation error:", aiErr);
      }
    }

    // Fallback
    if (!sceneText) {
      sceneText = `[${genre}] ${name}의 이야기가 시작됩니다.\n\n어둠 속에서 눈을 뜬 ${name}. 낯선 공간, 낯선 냄새. 기억이 흐릿하지만, 한 가지는 확실했다. 이곳은 분명 현실이 아니라는 것.`;
    }
    if (choicesList.length === 0) {
      for (let i = 0; i < choices_count; i++) {
        const labels = ["조심스럽게 주변을 탐색한다.", "경계하며 무기가 될 것을 찾는다.", "일단 이곳을 벗어나기로 한다."];
        const attitudes = ["positive", "negative", "avoidance"];
        choicesList.push({ id: `c${i}`, label: labels[i] || `선택지 ${i + 1}`, attitude: attitudes[i] || "neutral" });
      }
    }

    // Generate image via Cloudflare Workers AI
    const imageUrl = await generateImage(supabase, genre, imageBrief, session.id, 0);

    // Insert first node
    await supabase.from("story_nodes").insert({
      session_id: session.id,
      step: 0,
      variant: "main",
      scene_text: sceneText,
      image_prompt: imageBrief,
      image_url: imageUrl,
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
