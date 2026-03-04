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

    const { session_id, choice_id } = await req.json();

    // Get session
    const { data: session } = await supabase
      .from("story_sessions")
      .select("*")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    if (!session) throw new Error("Session not found");
    if (session.finished) throw new Error("Session already finished");

    const state = session.state as any;
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

    // Update history in state
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
    const newChoices: any[] = [];

    if (LOVABLE_API_KEY) {
      try {
        const genre = state.genre || "fantasy";
        const recentHistory = history.slice(-5).map((h: any) => `[${h.attitude}] ${h.choice_label}`).join("\n");

        const systemPrompt = `당신은 ${genre} 장르의 몰입형 소설 작가입니다. 한국어로 750~1200자의 장면 텍스트를 생성하세요.
주인공: ${state.name} (${state.gender})
${state.protagonist ? `설정: ${state.protagonist}` : ""}
이전 선택 히스토리:
${recentHistory}

플레이어의 마지막 선택: "${selectedChoice?.label || choice_id}" (태도: ${selectedChoice?.attitude || "neutral"})

${isEnding ? "이것은 엔딩 장면입니다. 스토리를 감동적으로 마무리해주세요. 선택지를 제공하지 마세요." : `다음 장면을 생성하고 ${session.choices_count}개의 선택지를 제공하세요. 선택지는 서로 상반되는 태도(긍정/부정/회피)여야 합니다.`}`;

        const toolDef = isEnding ? undefined : [{
          type: "function" as const,
          function: {
            name: "generate_scene",
            description: "Generate next story scene",
            parameters: {
              type: "object",
              properties: {
                scene_text: { type: "string" },
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
              required: ["scene_text", "choices"],
            },
          },
        }];

        const aiBody: any = {
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: isEnding ? "엔딩 장면을 생성해주세요." : "다음 장면과 선택지를 생성해주세요." },
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
              if (args.choices) {
                args.choices.slice(0, session.choices_count).forEach((c: any, i: number) => {
                  newChoices.push({ id: c.id || `c${i}`, label: c.label, attitude: c.attitude });
                });
              }
            }
          }
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

      if (!isEnding && newChoices.length === 0) {
        for (let i = 0; i < session.choices_count; i++) {
          newChoices.push({ id: `c${i}`, label: `선택지 ${i + 1}`, attitude: "neutral" });
        }
      }
    }

    // Insert new node
    await supabase.from("story_nodes").insert({
      session_id,
      step: nextStep,
      variant: "main",
      scene_text: sceneText,
      image_prompt: `scene step ${nextStep}`,
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
