import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { session_id, choice_id } = await req.json();

    const { data: session } = await supabase.from("story_sessions").select("*").eq("id", session_id).eq("user_id", user.id).single();
    if (!session) throw new Error("Session not found");
    if (session.finished) throw new Error("Session already finished");

    const currentNodeId = (session as any).current_node_id || "n0";

    const { data: currentNode } = await supabase.from("story_nodes").select("*")
      .eq("story_id", session.story_id).eq("node_id", currentNodeId).single();
    if (!currentNode) throw new Error("Current node not found");

    const choices = (currentNode.choices as any[]) || [];
    const selectedChoice = choices.find((c: any) => c.id === choice_id);
    if (!selectedChoice) throw new Error("Invalid choice");

    const nextNodeId = selectedChoice.next_node_id;
    if (!nextNodeId) throw new Error("No next node");

    const { data: nextNode } = await supabase.from("story_nodes").select("*")
      .eq("story_id", session.story_id).eq("node_id", nextNodeId).single();
    if (!nextNode) throw new Error("Next node not found");

    const isEnding = !nextNode.choices || (nextNode.choices as any[]).length === 0;

    const state = session.state as any;
    const visitedNodes = state.visited_nodes || [];
    const chosenChoices = state.chosen_choices || [];
    visitedNodes.push(currentNodeId);
    chosenChoices.push({ node_id: currentNodeId, choice_id, choice_label: selectedChoice.label, attitude: selectedChoice.attitude || "neutral" });

    await supabase.from("story_sessions").update({
      current_node_id: nextNodeId,
      step: session.step + 1,
      state: { ...state, visited_nodes: visitedNodes, chosen_choices: chosenChoices },
      finished: isEnding,
    }).eq("id", session_id);

    return new Response(JSON.stringify({
      success: true,
      node: {
        node_id: nextNode.node_id,
        step: nextNode.step,
        scene_text: nextNode.scene_text,
        image_url: nextNode.image_url,
        image_prompt: nextNode.image_prompt,
        choices: nextNode.choices,
      },
      finished: isEnding,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("navigate-choice error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
