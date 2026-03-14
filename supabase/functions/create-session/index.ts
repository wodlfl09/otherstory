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

async function fetchAI(apiKey: string, body: any, timeoutMs = 60000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`AI ${resp.status}: ${await resp.text()}`);
    return await resp.json();
  } finally {
    clearTimeout(id);
  }
}

function extractToolArgs(aiData: any): any | null {
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  try { return JSON.parse(toolCall.function.arguments); } catch { return null; }
}

async function updateJobStage(supabase: any, jobId: string, stage: string, progressPercent: number, etaSeconds?: number) {
  await supabase.from("generation_jobs").update({
    current_stage: stage,
    progress_percent: progressPercent,
    ...(etaSeconds !== undefined ? { eta_seconds: etaSeconds } : {}),
  }).eq("id", jobId);
}

/* ══════════════════════════════════════════════
   AGENT 1: Plot Agent — 장면 텍스트 생성
   ══════════════════════════════════════════════ */
async function runPlotAgent(
  apiKey: string, graph: GraphNodeDef[], genre: string,
  name: string, gender: string, protagonist: string, keywords: string, customStory: string
): Promise<Map<string, { scene_text: string }>> {
  const genreDescMap: Record<string, string> = {
    horror: "심리 공포/서바이벌 호러", mystery: "하드보일드 미스터리/추리",
    action: "극한 스릴러/서스펜스", romance: "감성 로맨스", sf: "SF/과학 판타지",
  };
  const genreDesc = genreDescMap[genre] || "다크 스릴러";

  const nodeDescs = graph.map(n => {
    if (n.is_ending) return `"${n.node_id}": ${n.variant_desc} (엔딩)`;
    return `"${n.node_id}": ${n.variant_desc}`;
  }).join("\n");

  const systemPrompt = `당신은 ${genreDesc} 장르의 시네마틱 게임 시나리오 작가입니다.
아래 노드 목록의 각 장면 텍스트(scene_text)만 생성하세요.

주인공: ${name} (${gender === "male" ? "남성" : "여성"})
${protagonist ? `설정: ${protagonist}` : ""}
${keywords ? `키워드: ${keywords}` : ""}
${customStory ? `세계관: ${customStory}` : ""}

노드 목록 (${graph.length}개):
${nodeDescs}

[장면 텍스트 규칙]
1. 한국어 220~350자 (3~5문장)
2. 카메라가 비추는 듯 시각적 묘사
3. 과거형 서술체
4. 매 장면 마지막은 선택의 갈림길 (엔딩 제외)
5. 감각 묘사 최소 1가지
6. 엔딩 노드는 200~300자, 여운 있는 결말`;

  const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
  for (const model of models) {
    try {
      const aiData = await fetchAI(apiKey, {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${graph.length}개 노드의 scene_text를 생성하세요.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_plot",
            description: "Generate scene texts for all nodes",
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
                    },
                    required: ["node_id", "scene_text"],
                  },
                },
              },
              required: ["nodes"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_plot" } },
      });

      const args = extractToolArgs(aiData);
      if (args?.nodes?.length > 0) {
        console.log(`PlotAgent: ${args.nodes.length} scenes via ${model}`);
        return new Map(args.nodes.map((n: any) => [n.node_id, { scene_text: n.scene_text }]));
      }
    } catch (err) { console.error(`PlotAgent ${model} failed:`, err); }
  }
  return new Map();
}

/* ══════════════════════════════════════════════
   AGENT 2: Choice Agent — 선택지 생성
   ══════════════════════════════════════════════ */
async function runChoiceAgent(
  apiKey: string, graph: GraphNodeDef[], plotMap: Map<string, { scene_text: string }>,
  choicesCount: number, genre: string
): Promise<Map<string, any[]>> {
  const nonEnding = graph.filter(n => !n.is_ending);
  const nodeContext = nonEnding.map(n => {
    const scene = plotMap.get(n.node_id)?.scene_text || "";
    const conns = n.next_node_ids.map((nid, i) => `선택${i + 1}→"${nid}"`).join(", ");
    return `"${n.node_id}" (장면: ${scene.slice(0, 60)}...) [${conns}]`;
  }).join("\n");

  const systemPrompt = `각 노드에 대해 ${choicesCount}개의 선택지를 생성하세요.
장르: ${genre}

노드 목록:
${nodeContext}

[선택지 규칙]
1. ${choicesCount}개, 한국어 8~20자
2. 구체적 행동 동사로 시작
3. 태도: positive, negative, avoidance
4. 각 선택지에 feedback (clue/danger/trust/time/sanity 중 1~2개, delta는 -2~+2)
5. next_node_id는 반드시 위 [연결] 정보를 따라야 함`;

  const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
  for (const model of models) {
    try {
      const aiData = await fetchAI(apiKey, {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${nonEnding.length}개 노드의 선택지를 생성하세요.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_choices",
            description: "Generate choices for each non-ending node",
            parameters: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      node_id: { type: "string" },
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
                    required: ["node_id", "choices"],
                  },
                },
              },
              required: ["nodes"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_choices" } },
      });

      const args = extractToolArgs(aiData);
      if (args?.nodes?.length > 0) {
        console.log(`ChoiceAgent: ${args.nodes.length} nodes via ${model}`);
        return new Map(args.nodes.map((n: any) => [n.node_id, n.choices]));
      }
    } catch (err) { console.error(`ChoiceAgent ${model} failed:`, err); }
  }
  return new Map();
}

/* ══════════════════════════════════════════════
   AGENT 3: Visual Agent — 캐릭터 바이블 + 이미지 브리프
   ══════════════════════════════════════════════ */
async function runVisualAgent(
  apiKey: string, graph: GraphNodeDef[], plotMap: Map<string, { scene_text: string }>,
  name: string, gender: string, genre: string
): Promise<{ characterBible: any; imageBriefs: Map<string, string> }> {
  const scenesSummary = graph.slice(0, 5).map(n => {
    const t = plotMap.get(n.node_id)?.scene_text || "";
    return `"${n.node_id}": ${t.slice(0, 80)}`;
  }).join("\n");

  const allNodeIds = graph.map(n => `"${n.node_id}"`).join(", ");

  const systemPrompt = `당신은 시네마틱 게임의 비주얼 디렉터입니다.

주인공: ${name} (${gender === "male" ? "남성" : "여성"})
장르: ${genre}

장면 요약:
${scenesSummary}

1. character_bible을 생성하세요 (영어):
   - name, appearance (hair, eyes, build, clothing, distinctive_features)
2. 모든 노드(${graph.length}개: ${allNodeIds})에 대해 image_brief를 생성하세요:
   - 영어 25단어 이내
   - 다크 시네마틱 반실사 톤`;

  const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
  for (const model of models) {
    try {
      const aiData = await fetchAI(apiKey, {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `character_bible과 ${graph.length}개 노드의 image_brief를 생성하세요.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_visuals",
            description: "Generate character bible and image briefs",
            parameters: {
              type: "object",
              properties: {
                character_bible: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    appearance: {
                      type: "object",
                      properties: {
                        hair: { type: "string" }, eyes: { type: "string" },
                        build: { type: "string" }, clothing: { type: "string" },
                        distinctive_features: { type: "string" },
                      },
                    },
                  },
                },
                image_briefs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      node_id: { type: "string" },
                      image_brief: { type: "string" },
                    },
                    required: ["node_id", "image_brief"],
                  },
                },
              },
              required: ["character_bible", "image_briefs"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_visuals" } },
      });

      const args = extractToolArgs(aiData);
      if (args?.image_briefs?.length > 0) {
        console.log(`VisualAgent: bible + ${args.image_briefs.length} briefs via ${model}`);
        return {
          characterBible: args.character_bible || null,
          imageBriefs: new Map(args.image_briefs.map((b: any) => [b.node_id, b.image_brief])),
        };
      }
    } catch (err) { console.error(`VisualAgent ${model} failed:`, err); }
  }
  return { characterBible: null, imageBriefs: new Map() };
}

/* ══════════════════════════════════════════════
   AGENT 4: QA Agent — 톤/길이/일관성/금지어 검사
   ══════════════════════════════════════════════ */
async function runQAAgent(
  apiKey: string,
  nodes: Array<{ node_id: string; scene_text: string; choices: any[] | null }>,
  genre: string
): Promise<Map<string, { scene_text?: string; choices?: any[] }>> {
  const nodesForReview = nodes.slice(0, 30).map(n => ({
    node_id: n.node_id,
    scene_text: n.scene_text,
    choices_count: n.choices?.length || 0,
    scene_length: n.scene_text.length,
  }));

  const systemPrompt = `당신은 시네마틱 게임 시나리오의 품질 검수 담당자입니다.
장르: ${genre}

아래 노드들을 검사하고, 문제가 있는 노드만 수정된 scene_text를 반환하세요.

[검사 항목]
1. 톤: ${genre} 장르에 맞는 분위기인지
2. 길이: scene_text가 150~400자 범위인지 (너무 짧거나 긴 것 수정)
3. 일관성: 서술체가 과거형인지, 문체가 통일되어 있는지
4. 금지어: 현실 브랜드명, 부적절한 표현, 메타적 표현("이 게임에서" 등) 제거
5. 감각 묘사: 최소 1가지 포함되어 있는지

문제 없는 노드는 반환하지 마세요. 수정이 필요한 노드만 반환하세요.`;

  try {
    const aiData = await fetchAI(apiKey, {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `다음 ${nodesForReview.length}개 노드를 검사하세요:\n${JSON.stringify(nodesForReview)}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "qa_review",
          description: "Return only nodes that need corrections",
          parameters: {
            type: "object",
            properties: {
              corrections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    node_id: { type: "string" },
                    scene_text: { type: "string" },
                    issue: { type: "string" },
                  },
                  required: ["node_id", "scene_text", "issue"],
                },
              },
              passed: { type: "boolean" },
            },
            required: ["corrections", "passed"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "qa_review" } },
    });

    const args = extractToolArgs(aiData);
    if (args) {
      const corrections = args.corrections || [];
      console.log(`QAAgent: ${corrections.length} corrections, passed=${args.passed}`);
      return new Map(corrections.map((c: any) => [c.node_id, { scene_text: c.scene_text }]));
    }
  } catch (err) { console.error("QAAgent failed:", err); }
  return new Map();
}

/* ══════════════════════════════════════════════
   Main Handler
   ══════════════════════════════════════════════ */
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
      user_id: user.id, title: name, genre,
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

    const graph = buildGraph(totalSteps, choices_count, endings_count);
    const imageBatches = Math.ceil(graph.length / 3);
    const etaSeconds = 60 + imageBatches * 12; // ~60s for 4 agents + image time

    const { data: job, error: jobErr } = await supabase.from("generation_jobs").insert({
      user_id: user.id, story_id: story.id, session_id: session.id,
      status: "generating_text", progress_percent: 0,
      current_stage: "스토리 구조 생성 중", eta_seconds: etaSeconds,
      total_nodes: graph.length, completed_nodes: 0,
    }).select().single();
    if (jobErr) throw jobErr;

    if (idempotency_key) {
      await supabase.from("credit_tx").insert({ idempotency_key, user_id: user.id, kind: "create_session", delta: -10, ref: { story_id: story.id, session_id: session.id, job_id: job.id } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("No API key configured");

    /* ── STAGE 1: Plot Agent ── */
    await updateJobStage(supabase, job.id, "스토리 구조 생성 중", 2, etaSeconds);
    const plotMap = await runPlotAgent(LOVABLE_API_KEY, graph, genre, name, gender, protagonist || "", keywords || "", customStory || "");

    /* ── STAGE 2: Choice Agent ── */
    await updateJobStage(supabase, job.id, "선택지 분기 설계 중", 8, Math.round(etaSeconds * 0.7));
    const choiceMap = await runChoiceAgent(LOVABLE_API_KEY, graph, plotMap, choices_count, genre);

    /* ── STAGE 3: Visual Agent ── */
    await updateJobStage(supabase, job.id, "등장인물 설정 정리 중", 14, Math.round(etaSeconds * 0.5));
    const { characterBible, imageBriefs } = await runVisualAgent(LOVABLE_API_KEY, graph, plotMap, name, gender, genre);

    // Save character_bible to story config
    if (characterBible) {
      const updatedConfig = { ...storyConfig, character_bible: characterBible };
      await supabase.from("stories").update({ config: updatedConfig }).eq("id", story.id);
    }

    /* ── STAGE 4: QA Agent ── */
    await updateJobStage(supabase, job.id, "최종 검수 중", 17, Math.round(etaSeconds * 0.35));
    const preQANodes = graph.map(gn => {
      const sceneText = plotMap.get(gn.node_id)?.scene_text || `${name}의 이야기가 계속됩니다...`;
      let choices = null;
      if (!gn.is_ending) {
        const aiChoices = choiceMap.get(gn.node_id);
        if (aiChoices && aiChoices.length >= choices_count) {
          choices = aiChoices.slice(0, choices_count).map((c: any, i: number) => ({
            id: c.id || `c${i}`, label: c.label || `선택지 ${i + 1}`,
            attitude: c.attitude || "neutral", next_node_id: gn.next_node_ids[i] || gn.next_node_ids[0],
            feedback: c.feedback || [],
          }));
        } else {
          choices = gn.next_node_ids.map((nid, i) => ({
            id: `c${i}`, label: aiChoices?.[i]?.label || `선택지 ${i + 1}`,
            attitude: ["positive", "negative", "avoidance"][i] || "neutral", next_node_id: nid,
            feedback: [],
          }));
        }
      }
      return { node_id: gn.node_id, scene_text: sceneText, choices };
    });

    const qaCorrections = await runQAAgent(LOVABLE_API_KEY, preQANodes, genre);

    /* ── Build final nodes ── */
    const nodesToInsert = graph.map(gn => {
      const preNode = preQANodes.find(n => n.node_id === gn.node_id)!;
      const qaFix = qaCorrections.get(gn.node_id);
      const sceneText = qaFix?.scene_text || preNode.scene_text;
      const imageBrief = imageBriefs.get(gn.node_id) || `dark cinematic ${genre} scene, dramatic lighting`;

      return {
        story_id: story.id, node_id: gn.node_id, step: gn.step, variant: "main",
        scene_text: sceneText, image_prompt: imageBrief, image_url: null,
        choices: preNode.choices,
      };
    });

    await supabase.from("story_nodes").insert(nodesToInsert);

    /* ── Update job: text done, start images phase ── */
    const imageEta = graph.length * 12;
    await supabase.from("generation_jobs").update({
      status: "generating_images",
      progress_percent: 20,
      current_stage: "장면 삽화 준비 중",
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
