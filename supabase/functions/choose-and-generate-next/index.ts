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
  step: number,
  characterBible?: any
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

    let charDesc = "";
    if (characterBible) {
      const a = characterBible.appearance || {};
      charDesc = `Main character: ${characterBible.name || ""}, ${a.hair || ""} hair, ${a.eyes || ""} eyes, ${a.build || ""} build, wearing ${a.clothing || ""}. ${a.distinctive_features || ""}. `;
    }

    const prompt = `Generate a 16:9 widescreen illustration: ${styleHint}. ${charDesc}${imageBrief}. High quality, detailed, no text or watermarks.`;

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

    const { session_id, choice_id } = await req.json();

    const { data: session } = await supabase
      .from("story_sessions")
      .select("*")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    if (!session) throw new Error("Session not found");
    if (session.finished) throw new Error("Session already finished");

    const state = session.state as any;
    const genre = state.genre || "fantasy";
    const totalSteps = state.total_steps || 7;
    const nextStep = session.step + 1;
    const isEnding = nextStep >= totalSteps - 1;

    // Get current node for context
    const { data: currentNodes } = await supabase
      .from("story_nodes")
      .select("*")
      .eq("session_id", session_id)
      .eq("step", session.step)
      .limit(1);

    const currentNode = currentNodes?.[0];
    const currentChoices = (currentNode?.choices as any[]) || [];
    const selectedChoice = currentChoices.find((c: any) => c.id === choice_id);

    // Update history
    const history = state.history || [];
    history.push({
      step: session.step,
      choice_id,
      choice_label: selectedChoice?.label || choice_id,
      attitude: selectedChoice?.attitude || "neutral",
    });

    // Generate next scene
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let sceneText = "";
    let imageBrief = `${genre} scene step ${nextStep}`;
    const newChoices: any[] = [];

    if (LOVABLE_API_KEY) {
      try {
        const genreDescMap: Record<string, string> = {
          sf: "사이버펑크/우주 SF", fantasy: "하이 판타지", mystery: "하드보일드 추리",
          action: "고속 액션 스릴러", horror: "심리 공포", romance: "감성 로맨스",
          comic: "유쾌한 코미디", martial: "무협/검협", adult: "성인 드라마",
        };
        const genreDesc = genreDescMap[genre] || genre;

        const recentHistory = history.slice(-5).map((h: any) =>
          `[${h.attitude}] ${h.choice_label}`
        ).join("\n");

        const attitudeEffect: Record<string, string> = {
          positive: "주인공이 적극적이고 용감하게 행동한 결과",
          negative: "주인공이 강경하고 공격적으로 대응한 결과",
          avoidance: "주인공이 상황을 피하거나 우회한 결과",
          neutral: "주인공이 신중하게 판단한 결과",
        };

        const effect = attitudeEffect[selectedChoice?.attitude || "neutral"];
        const prevSceneExcerpt = currentNode?.scene_text?.slice(-200) || "";

        const systemPrompt = `당신은 ${genreDesc} 장르의 베스트셀러 웹소설 작가입니다.

[필수 규칙]
1. 한국어 800~1200자, 3문단 구성
2. 이전 장면과 자연스럽게 이어지는 전개
3. 오감 묘사 최소 3가지 감각 포함
4. 인물의 감정을 행동/대사로 보여주기 (직접 설명 금지)
5. 사건이 확실히 진전되는 전개
6. 과거형 서술체 ("~했다", "~였다")
7. 금지: "갑자기", "심장이 뛰었다" 등 진부한 표현
${isEnding ? "8. 이것은 최종 엔딩입니다. 여운이 깊게 남는 결말로 마무리하세요. 선택지 없이 끝내세요." : "8. 마지막 문단은 새로운 갈림길 상황으로 끝내세요."}

주인공: ${state.name} (${state.gender === "male" ? "남성" : "여성"})
${state.protagonist ? `캐릭터 설정: ${state.protagonist}` : ""}

이전 선택 흐름:
${recentHistory}

직전 장면 끝부분: "${prevSceneExcerpt}"

플레이어의 선택: "${selectedChoice?.label || choice_id}"
→ ${effect}`;

        const toolDef = isEnding ? undefined : [{
          type: "function" as const,
          function: {
            name: "generate_scene",
            description: "Generate next story scene",
            parameters: {
              type: "object",
              properties: {
                scene_text: { type: "string", description: "800-1200자 한국어 장면" },
                image_brief: { type: "string", description: "16:9 삽화용 영어 프롬프트, 50단어 이내. 구체적 장면/인물/분위기" },
                choices: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      label: { type: "string", description: "한국어 선택지 (15-30자, 구체적 행동)" },
                      attitude: { type: "string", enum: ["positive", "negative", "avoidance", "neutral"] },
                    },
                    required: ["id", "label", "attitude"],
                  },
                },
              },
              required: ["scene_text", "image_brief", "choices"],
            },
          },
        }];

        const aiBody: any = {
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: isEnding
              ? "엔딩 장면을 생성하세요. 지금까지의 선택이 수렴하는 여운 깊은 결말을 써주세요."
              : `다음 장면과 ${session.choices_count}개의 선택지를 생성하세요. 선택지는 서로 다른 태도(긍정/부정/회피/중립)로 구성하세요.` },
          ],
        };

        if (toolDef) {
          aiBody.tools = toolDef;
          aiBody.tool_choice = { type: "function", function: { name: "generate_scene" } };
        }

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(aiBody),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          if (isEnding) {
            sceneText = aiData.choices?.[0]?.message?.content || "";
          } else {
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall) {
              const args = JSON.parse(toolCall.function.arguments);
              sceneText = args.scene_text || "";
              imageBrief = args.image_brief || imageBrief;
              if (args.choices) {
                args.choices.slice(0, session.choices_count).forEach((c: any, i: number) => {
                  newChoices.push({ id: c.id || `c${i}`, label: c.label, attitude: c.attitude });
                });
              }
            }
          }
        } else if (aiResponse.status === 429) {
          console.error("AI rate limited");
        } else if (aiResponse.status === 402) {
          console.error("AI payment required");
        }
      } catch (aiErr) {
        console.error("AI error:", aiErr);
      }
    }

    // Fallback
    if (!sceneText) {
      sceneText = isEnding
        ? `${state.name}의 여정이 마무리됩니다. 모든 선택이 하나의 결말로 이어졌습니다.`
        : `${state.name}은(는) "${selectedChoice?.label || "다음 행동"}"을 선택했다. 새로운 장면이 펼쳐진다.`;
    }
    if (!isEnding && newChoices.length === 0) {
      for (let i = 0; i < session.choices_count; i++) {
        newChoices.push({ id: `c${i}`, label: `선택지 ${i + 1}`, attitude: "neutral" });
      }
    }

    // Generate image via Lovable AI (Gemini Image) with character_bible
    const characterBible = state.character_bible;
    const imageUrl = await generateImage(supabase, genre, imageBrief, session_id, nextStep, characterBible);

    // Insert new node
    await supabase.from("story_nodes").insert({
      session_id,
      step: nextStep,
      variant: "main",
      scene_text: sceneText,
      image_prompt: imageBrief,
      image_url: imageUrl,
      choices: isEnding ? null : newChoices,
    });

    // Update session
    await supabase.from("story_sessions").update({
      step: nextStep,
      state: { ...state, history },
      finished: isEnding,
    }).eq("id", session_id);

    return new Response(JSON.stringify({ success: true, step: nextStep, finished: isEnding }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("choose error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
