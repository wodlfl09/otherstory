import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GraphNodeDef {
  node_id: string;
  step: number;
  is_ending: boolean;
  variant_desc: string;
  next_node_ids: string[];
}

function buildGraph(totalSteps: number, choicesCount: number, endingsCount: number): GraphNodeDef[] {
  const nodes: GraphNodeDef[] = [];
  const rootNexts = Array.from({ length: choicesCount }, (_, i) => `n1_${i}`);
  nodes.push({ node_id: "n0", step: 0, is_ending: false, variant_desc: "오프닝 장면", next_node_ids: rootNexts });

  const attitudes = ["긍정적 선택", "부정적/강경한 선택", "회피적 선택"];
  for (let s = 1; s <= totalSteps - 2; s++) {
    for (let v = 0; v < choicesCount; v++) {
      let nexts: string[];
      if (s === totalSteps - 2) {
        nexts = Array.from({ length: choicesCount }, (_, i) => {
          const endIdx = i % endingsCount;
          return endingsCount > 1 ? `n${totalSteps - 1}_${endIdx}` : `n${totalSteps - 1}`;
        });
      } else {
        nexts = Array.from({ length: choicesCount }, (_, i) => `n${s + 1}_${i}`);
      }
      nodes.push({
        node_id: `n${s}_${v}`,
        step: s,
        is_ending: false,
        variant_desc: `장면 ${s + 1}, ${attitudes[v] || "중립적 선택"} 결과`,
        next_node_ids: nexts,
      });
    }
  }

  if (endingsCount > 1) {
    for (let e = 0; e < endingsCount; e++) {
      nodes.push({ node_id: `n${totalSteps - 1}_${e}`, step: totalSteps - 1, is_ending: true, variant_desc: `엔딩 ${e + 1}`, next_node_ids: [] });
    }
  } else {
    nodes.push({ node_id: `n${totalSteps - 1}`, step: totalSteps - 1, is_ending: true, variant_desc: "엔딩", next_node_ids: [] });
  }
  return nodes;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { genre, name, gender, protagonist, keywords, customStory, duration_min, choices_count, endings_count, idempotency_key } = body;

    if (!genre) throw new Error("장르를 선택해주세요.");

    if (idempotency_key) {
      const { data: existingTx } = await supabase.from("credit_tx").select("idempotency_key, ref").eq("idempotency_key", idempotency_key).maybeSingle();
      if (existingTx) {
        const ref = existingTx.ref as any;
        return new Response(JSON.stringify({ session_id: ref?.session_id, job_id: ref?.job_id, duplicate: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    const planRank: Record<string, number> = { free: 0, basic: 1, pro: 2 };
    const rank = planRank[profile.plan] ?? 0;
    if (duration_min > 10 && rank < 1) throw new Error("Basic 이상 플랜이 필요합니다 (20분).");
    if (duration_min > 20 && rank < 2) throw new Error("Pro 플랜이 필요합니다 (30분).");
    if (choices_count > 2 && rank < 1) throw new Error("Basic 이상 플랜이 필요합니다 (선택지 3개).");
    if (endings_count > 2 && rank < 1) throw new Error("Basic 이상 플랜이 필요합니다 (결말 3개).");
    if (profile.credits < 10) throw new Error("크레딧이 부족합니다. (10 크레딧 필요)");

    await supabase.from("profiles").update({ credits: profile.credits - 10 }).eq("user_id", user.id);
    await supabase.from("credits_ledger").insert({ user_id: user.id, delta: -10, reason: "create_session", meta: { genre } });

    const totalStepsMap: Record<number, number> = { 10: 7, 20: 13, 30: 19 };
    const totalSteps = totalStepsMap[duration_min] ?? 7;

    const storyConfig = { name, gender, protagonist, keywords, customStory, duration_min, choices_count, endings_count, total_steps: totalSteps };
    const { data: story, error: storyErr } = await supabase.from("stories").insert({
      user_id: user.id, title: `${genre} 모험 - ${name}`, genre,
      source_type: customStory ? "custom" : "simple", config: storyConfig, protagonist_name: name,
    }).select().single();
    if (storyErr) throw storyErr;

    const { count: libCount } = await supabase.from("library_items").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const maxLib = profile.plan === "pro" ? Infinity : profile.plan === "basic" ? 9 : 3;
    if ((libCount ?? 0) < maxLib) await supabase.from("library_items").insert({ user_id: user.id, story_id: story.id });

    const adRequired = profile.plan === "free";
    const { data: session, error: sessErr } = await supabase.from("story_sessions").insert({
      story_id: story.id, user_id: user.id, duration_min, choices_count, endings_count, step: 0,
      current_node_id: "n0",
      state: { genre, visited_nodes: [], chosen_choices: [] },
      ad_required: adRequired,
    }).select().single();
    if (sessErr) throw sessErr;

    // Build graph structure
    const graph = buildGraph(totalSteps, choices_count, endings_count);

    // Estimate ETA: ~25s text + ~12s per batch of 3 images
    const imageBatches = Math.ceil(graph.length / 3);
    const etaSeconds = 25 + imageBatches * 12;

    // Create generation job
    const { data: job, error: jobErr } = await supabase.from("generation_jobs").insert({
      user_id: user.id,
      story_id: story.id,
      session_id: session.id,
      status: "generating_text",
      progress_percent: 0,
      current_stage: "스토리 구조 생성 중",
      eta_seconds: etaSeconds,
      total_nodes: graph.length,
      completed_nodes: 0,
    }).select().single();
    if (jobErr) throw jobErr;

    if (idempotency_key) {
      await supabase.from("credit_tx").insert({ idempotency_key, user_id: user.id, kind: "create_session", delta: -10, ref: { story_id: story.id, session_id: session.id, job_id: job.id } });
    }

    // Generate text for all nodes via AI
    let generatedNodes: any[] = [];
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY) {
      try {
        const genreDescMap: Record<string, string> = {
          horror: "심리 공포/서바이벌 호러",
          mystery: "하드보일드 미스터리/추리",
          action: "극한 스릴러/서스펜스",
        };
        const genreDesc = genreDescMap[genre] || "다크 스릴러";

        const nodeDescs = graph.map(n => {
          if (n.is_ending) return `"${n.node_id}": ${n.variant_desc} (선택지 없음)`;
          const conns = n.next_node_ids.map((nid, i) => `선택${i + 1}→"${nid}"`).join(", ");
          return `"${n.node_id}": ${n.variant_desc} [${conns}]`;
        }).join("\n");

        const systemPrompt = `당신은 ${genreDesc} 장르의 시네마틱 게임 시나리오 작가입니다.
선택형 시네마 스토리 게임의 모든 장면을 생성하세요.

[핵심 원칙]
- 이것은 "읽는 소설"이 아니라 "판단하는 게임"입니다
- 장면은 짧고 강렬하게. 긴장감과 선택의 무게감이 핵심

주인공: ${name} (${gender === "male" ? "남성" : "여성"})
${protagonist ? `설정: ${protagonist}` : ""}
${keywords ? `키워드: ${keywords}` : ""}
${customStory ? `세계관: ${customStory}` : ""}

스토리 구조 (총 ${graph.length}개 노드):
${nodeDescs}

[장면 텍스트 규칙]
1. 한국어 220~350자 (3~5문장)
2. 카메라가 비추는 것처럼 장면을 보여주세요
3. 과거형 서술체
4. 매 장면 마지막은 선택의 갈림길
5. 필수: 감각 묘사 최소 1가지

[선택지 규칙]
1. ${choices_count}개, 한국어 8~20자
2. 구체적 행동 동사로 시작
3. 태도: positive, negative, avoidance
4. 각 선택지에 feedback 추가 (clue/danger/trust/time/sanity 중 1~2개)

[이미지 규칙]
1. image_brief: 영어 25단어 이내
2. 다크 시네마틱 반실사 톤

[엔딩 규칙]
1. 선택지 없음
2. 짧고 여운 있는 결말 (200~300자)`;

        const aiRequestBody = JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `위 구조에 맞는 전체 ${graph.length}개 노드를 생성하세요. 각 노드의 node_id, scene_text, image_brief, choices를 빠짐없이 포함하세요.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "generate_story_graph",
                description: "Generate all story nodes",
                parameters: {
                  type: "object",
                  properties: {
                    nodes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          node_id: { type: "string" },
                          scene_text: { type: "string" },
                          image_brief: { type: "string" },
                          choices: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string" },
                                label: { type: "string" },
                                attitude: { type: "string", enum: ["positive", "negative", "avoidance"] },
                                next_node_id: { type: "string" },
                                feedback: {
                                  type: "array",
                                  items: {
                                    type: "object",
                                    properties: {
                                      type: { type: "string", enum: ["clue", "danger", "trust", "time", "sanity"] },
                                      label: { type: "string" },
                                      delta: { type: "number" },
                                    },
                                    required: ["type", "label", "delta"],
                                  },
                                },
                              },
                              required: ["id", "label", "attitude", "next_node_id"],
                            },
                          },
                        },
                        required: ["node_id", "scene_text", "image_brief"],
                      },
                    },
                  },
                  required: ["nodes"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "generate_story_graph" } },
          });

        // Try up to 2 times with different models
        const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
        for (let attempt = 0; attempt < models.length; attempt++) {
          try {
            const bodyWithModel = JSON.parse(aiRequestBody);
            bodyWithModel.model = models[attempt];
            console.log(`AI attempt ${attempt + 1} with model ${models[attempt]}`);

            const aiResponse = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify(bodyWithModel),
            }, 60000);

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall) {
                const args = JSON.parse(toolCall.function.arguments);
                if (args.nodes && Array.isArray(args.nodes) && args.nodes.length > 0) {
                  generatedNodes = args.nodes;
                  console.log(`AI generated ${generatedNodes.length} nodes on attempt ${attempt + 1}`);
                  break;
                }
              }
              console.error(`AI attempt ${attempt + 1}: no valid nodes in response`);
            } else {
              const errText = await aiResponse.text();
              console.error(`AI attempt ${attempt + 1} failed: ${aiResponse.status} - ${errText}`);
            }
          } catch (retryErr) {
            console.error(`AI attempt ${attempt + 1} error:`, retryErr);
          }
        }
      } catch (aiErr) {
        console.error("AI generation error:", aiErr);
      }
    }

    // Map generated content to graph nodes
    const generatedMap = new Map(generatedNodes.map((n: any) => [n.node_id, n]));
    const nodesToInsert = graph.map(gn => {
      const gen = generatedMap.get(gn.node_id);
      const sceneText = gen?.scene_text || `${name}의 이야기가 계속됩니다...`;
      const imageBrief = gen?.image_brief || `dark cinematic ${genre} scene, dramatic lighting`;

      let choices = null;
      if (!gn.is_ending) {
        if (gen?.choices && gen.choices.length >= choices_count) {
          choices = gen.choices.slice(0, choices_count).map((c: any, i: number) => ({
            id: c.id || `c${i}`, label: c.label || `선택지 ${i + 1}`,
            attitude: c.attitude || "neutral", next_node_id: gn.next_node_ids[i] || gn.next_node_ids[0],
            feedback: c.feedback || [],
          }));
        } else {
          choices = gn.next_node_ids.map((nid, i) => ({
            id: `c${i}`, label: gen?.choices?.[i]?.label || `선택지 ${i + 1}`,
            attitude: ["positive", "negative", "avoidance"][i] || "neutral", next_node_id: nid,
            feedback: [],
          }));
        }
      }

      return {
        story_id: story.id, node_id: gn.node_id, step: gn.step, variant: "main",
        scene_text: sceneText, image_prompt: imageBrief, image_url: null, choices,
      };
    });

    await supabase.from("story_nodes").insert(nodesToInsert);

    // Update job: text done, start images phase
    const imageEta = graph.length * 12;
    await supabase.from("generation_jobs").update({
      status: "generating_images",
      progress_percent: 20,
      current_stage: "삽화 생성 중",
      eta_seconds: imageEta,
    }).eq("id", job.id);

    return new Response(JSON.stringify({ session_id: session.id, job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-session error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
