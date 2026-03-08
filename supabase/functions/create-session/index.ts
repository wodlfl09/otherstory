import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    if (idempotency_key) {
      const { data: existingTx } = await supabase.from("credit_tx").select("idempotency_key, ref").eq("idempotency_key", idempotency_key).maybeSingle();
      if (existingTx) {
        const ref = existingTx.ref as any;
        return new Response(JSON.stringify({ session_id: ref?.session_id, duplicate: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // Generate character_bible
    let characterBible: any = null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const bibleResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Generate a character bible for consistent image generation. Output JSON only." },
              { role: "user", content: `Genre: ${genre}. Character: ${name} (${gender}). ${protagonist ? `Description: ${protagonist}` : ""}. Create a visual character bible.` },
            ],
            tools: [{ type: "function", function: { name: "create_character_bible", description: "Create character visual description", parameters: { type: "object", properties: { name: { type: "string" }, gender: { type: "string" }, appearance: { type: "object", properties: { hair: { type: "string" }, eyes: { type: "string" }, build: { type: "string" }, clothing: { type: "string" }, distinctive_features: { type: "string" } } } }, required: ["name", "gender", "appearance"] } } }],
            tool_choice: { type: "function", function: { name: "create_character_bible" } },
          }),
        });
        if (bibleResp.ok) {
          const bd = await bibleResp.json();
          const tc = bd.choices?.[0]?.message?.tool_calls?.[0];
          if (tc) characterBible = JSON.parse(tc.function.arguments);
        }
      } catch (err) { console.error("Character bible error:", err); }
    }

    // Create story with character_bible in config
    const storyConfig = { name, gender, protagonist, keywords, customStory, duration_min, choices_count, endings_count, total_steps: totalSteps, character_bible: characterBible };
    const { data: story, error: storyErr } = await supabase.from("stories").insert({
      user_id: user.id, title: `${genre} 모험 - ${name}`, genre,
      source_type: customStory ? "custom" : "simple", config: storyConfig, protagonist_name: name,
    }).select().single();
    if (storyErr) throw storyErr;

    // Auto-save to library
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

    if (idempotency_key) {
      await supabase.from("credit_tx").insert({ idempotency_key, user_id: user.id, kind: "create_session", delta: -10, ref: { story_id: story.id, session_id: session.id } });
    }

    // Build graph and generate all content via AI
    const graph = buildGraph(totalSteps, choices_count, endings_count);
    let generatedNodes: any[] = [];

    if (LOVABLE_API_KEY) {
      try {
        const genreDescMap: Record<string, string> = {
          sf: "사이버펑크/우주 SF", fantasy: "하이 판타지", mystery: "하드보일드 추리",
          action: "고속 액션 스릴러", horror: "심리 공포", romance: "감성 로맨스",
          comic: "유쾌한 코미디", martial: "무협/검협", adult: "성인 드라마",
        };
        const genreDesc = genreDescMap[genre] || genre;

        const nodeDescs = graph.map(n => {
          if (n.is_ending) return `"${n.node_id}": ${n.variant_desc} (선택지 없음)`;
          const conns = n.next_node_ids.map((nid, i) => `선택${i + 1}→"${nid}"`).join(", ");
          return `"${n.node_id}": ${n.variant_desc} [${conns}]`;
        }).join("\n");

        const systemPrompt = `당신은 ${genreDesc} 장르의 베스트셀러 웹소설 작가입니다.
완전한 분기형 인터랙티브 스토리의 모든 장면을 한번에 생성하세요.

주인공: ${name} (${gender === "male" ? "남성" : "여성"})
${protagonist ? `설정: ${protagonist}` : ""}
${keywords ? `키워드: ${keywords}` : ""}
${customStory ? `세계관: ${customStory}` : ""}

스토리 구조 (총 ${graph.length}개 노드):
${nodeDescs}

규칙:
1. 각 장면 scene_text: 한국어 400~800자, 과거형 서술, 오감 묘사
2. 비엔딩 노드에 ${choices_count}개 선택지 (15-30자, 구체적 행동)
3. 선택지 태도: positive(적극적), negative(강경한), avoidance(회피), neutral
4. 변형 장면은 이전 선택의 결과를 반영한 다른 내용으로 작성
5. 엔딩은 여운 있는 결말
6. image_brief: 영어 30단어 이내 삽화 묘사
7. next_node_id는 위 구조대로 정확히 지정
8. 첫 문장부터 강렬한 훅`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `위 구조에 맞는 전체 ${graph.length}개 노드를 생성하세요.` },
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
                          scene_text: { type: "string", description: "400-800자 한국어 장면" },
                          image_brief: { type: "string", description: "영어 30단어 이내" },
                          choices: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: { type: "string" },
                                label: { type: "string", description: "한국어 15-30자" },
                                attitude: { type: "string", enum: ["positive", "negative", "avoidance", "neutral"] },
                                next_node_id: { type: "string" },
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
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const args = JSON.parse(toolCall.function.arguments);
            if (args.nodes && Array.isArray(args.nodes)) generatedNodes = args.nodes;
          }
        } else {
          console.error("AI graph generation failed:", aiResponse.status);
        }
      } catch (aiErr) { console.error("AI graph error:", aiErr); }
    }

    // Build node map from AI output
    const generatedMap = new Map(generatedNodes.map((n: any) => [n.node_id, n]));

    // Prepare all nodes for batch insert
    const nodesToInsert = graph.map(gn => {
      const gen = generatedMap.get(gn.node_id);
      const sceneText = gen?.scene_text || `${name}의 이야기가 계속됩니다...`;
      const imageBrief = gen?.image_brief || `${genre} scene`;

      let choices = null;
      if (!gn.is_ending) {
        if (gen?.choices && gen.choices.length >= choices_count) {
          choices = gen.choices.slice(0, choices_count).map((c: any, i: number) => ({
            id: c.id || `c${i}`,
            label: c.label || `선택지 ${i + 1}`,
            attitude: c.attitude || "neutral",
            next_node_id: gn.next_node_ids[i] || gn.next_node_ids[0],
          }));
        } else {
          choices = gn.next_node_ids.map((nid, i) => ({
            id: `c${i}`,
            label: gen?.choices?.[i]?.label || `선택지 ${i + 1}`,
            attitude: ["positive", "negative", "avoidance"][i] || "neutral",
            next_node_id: nid,
          }));
        }
      }

      return {
        story_id: story.id,
        node_id: gn.node_id,
        step: gn.step,
        variant: "main",
        scene_text: sceneText,
        image_prompt: imageBrief,
        image_url: null,
        choices,
      };
    });

    await supabase.from("story_nodes").insert(nodesToInsert);

    return new Response(JSON.stringify({ session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-session error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
