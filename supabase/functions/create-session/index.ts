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
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  try {
    const styleHints: Record<string, string> = {
      sf: "cinematic sci-fi cyberpunk lighting, neon glow, futuristic city",
      fantasy: "epic fantasy painting, dramatic lighting, magical atmosphere",
      mystery: "noir atmosphere, dark shadows, moody detective scene",
      action: "dynamic action shot, motion blur, intense cinematic",
      horror: "dark horror atmosphere, eerie shadows, unsettling mood",
      romance: "soft warm lighting, dreamy bokeh, emotional scene",
      comic: "vibrant colorful scene, comedic expression, lively atmosphere",
      martial: "wuxia ink wash style, martial arts pose, flowing robes",
      adult: "mature dramatic scene, cinematic noir lighting, sophisticated",
    };
    const styleHint = styleHints[genre] || "cinematic scene";
    const prompt = `Generate a 16:9 widescreen illustration: ${styleHint}. ${imageBrief}. High quality, detailed, no text or watermarks.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error("Image gen failed:", response.status);
      return null;
    }

    const data = await response.json();
    const imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageDataUrl) return null;

    // Extract base64 and upload to storage
    const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) return null;

    const imageBytes = Uint8Array.from(atob(base64Match[2]), c => c.charCodeAt(0));
    const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
    const fileName = `${sessionId}/step_${step}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("story-images")
      .upload(fileName, imageBytes, { contentType: `image/${base64Match[1]}`, upsert: true });

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

        const systemPrompt = `당신은 ${genreDesc} 장르의 베스트셀러 웹소설 작가입니다.

[필수 규칙]
- 한국어 800~1200자, 3문단 구성 (도입-전개-갈림길)
- 첫 문장부터 독자를 사로잡는 강렬한 훅(hook)으로 시작
- 오감 묘사를 자연스럽게 삽입 (최소 3가지 감각)
- 인물의 감정/내면을 행동과 대사로 보여주기 (직접 설명 금지)
- 마지막 문단은 반드시 긴박한 선택의 순간으로 끝내기
- 과거형 서술체 ("~했다", "~였다")
- 금지: "갑자기", "심장이 뛰었다", "눈을 떴다" 등 진부한 표현

주인공: ${name} (${gender === "male" ? "남성" : "여성"})
${protagonist ? `캐릭터 설정: ${protagonist}` : ""}
${keywords ? `분위기 키워드: ${keywords}` : ""}
${customStory ? `세계관: ${customStory}` : ""}`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `${genreDesc} 장르의 첫 장면을 생성하세요. 독자가 단숨에 몰입할 수 있는 강렬한 도입부와 ${choices_count}개의 선택지를 만드세요.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "generate_scene",
                description: "Generate story scene with text, image brief, and choices",
                parameters: {
                  type: "object",
                  properties: {
                    scene_text: { type: "string", description: "800-1200자 한국어 장면 텍스트" },
                    image_brief: { type: "string", description: "16:9 삽화를 위한 영어 프롬프트, 50단어 이내. 구체적인 장면/인물/분위기 묘사" },
                    choices: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string", description: "한국어 선택지 (15-30자, 구체적 행동 묘사)" },
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

    // Generate image via Lovable AI (Gemini Image)
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
