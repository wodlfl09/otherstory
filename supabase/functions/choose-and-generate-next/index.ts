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
    const { data: styles } = await supabase
      .from("image_style_profiles")
      .select("*")
      .contains("genres", [genre]);

    const style = styles?.[0];
    if (!style) return null;

    const prompt = `${style.prompt_prefix}${imageBrief}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
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
          console.error(`CF attempt ${attempt} failed:`, cfResponse.status);
          continue;
        }

        const imageData = await cfResponse.arrayBuffer();
        const fileName = `${sessionId}/step_${step}.png`;
        const { error: uploadErr } = await supabase.storage
          .from("story-images")
          .upload(fileName, imageData, { contentType: "image/png", upsert: true });
        if (uploadErr) { console.error("Upload error:", uploadErr); continue; }

        const { data: urlData } = supabase.storage.from("story-images").getPublicUrl(fileName);
        return urlData?.publicUrl || null;
      } catch (err) {
        console.error(`CF attempt ${attempt} error:`, err);
      }
    }
    return null;
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

        const systemPrompt = `당신은 ${genreDesc} 장르 전문 프리미엄 웹소설 작가입니다.
규칙:
1. 한국어 750~1200자, 2~3문단
2. 감각 묘사(시각/청각/촉각/후각) 필수
3. 주인공 내면(감정/사고) 자연스럽게 표현
4. 사건 진전 + 긴장감
5. 클리셰 금지(갑자기 눈을 떴다/심장이 빠르게 뛰었다 등)
6. 과거형 서술체("~했다", "~였다")
${isEnding ? "7. 이것은 엔딩입니다. 감동적이고 여운 있게 마무리하세요. 선택지를 제공하지 마세요." : "7. 마지막 문장은 다음 선택을 유도하는 갈림길로 끝내세요."}

주인공: ${state.name} (${state.gender === "male" ? "남성" : "여성"})
${state.protagonist ? `설정: ${state.protagonist}` : ""}

이전 선택 히스토리:
${recentHistory}

플레이어의 마지막 선택: "${selectedChoice?.label || choice_id}"
→ ${effect}로 이야기가 전개됩니다.`;

        const toolDef = isEnding ? undefined : [{
          type: "function" as const,
          function: {
            name: "generate_scene",
            description: "Generate next story scene",
            parameters: {
              type: "object",
              properties: {
                scene_text: { type: "string", description: "750-1200자 한국어 장면" },
                image_brief: { type: "string", description: "16:9 삽화용 영어 프롬프트, 50단어 이내" },
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
        }];

        const aiBody: any = {
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: isEnding ? "엔딩 장면을 생성해주세요. 여운이 남는 결말로 마무리해주세요." : `다음 장면과 ${session.choices_count}개의 선택지를 생성해주세요. 선택지는 서로 상반되는 태도(긍정/부정/회피)로 구성하세요.` },
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

        // Rewrite pass
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
                  { role: "system", content: `프리미엄 웹소설 편집자로서 아래 텍스트를 리라이트하세요.
규칙: 750~1200자 유지, 클리셰 제거, 감각 묘사 강화, 문장 리듬 다양화, 과거형 서술체.
핵심 사건과 구조는 보존하세요.` },
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

    // Generate image
    const imageUrl = await generateImage(supabase, genre, imageBrief, session_id, nextStep);

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
