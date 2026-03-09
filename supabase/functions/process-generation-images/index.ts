import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PARALLEL_COUNT = 3;

async function generateSingleImage(
  supabase: any,
  storyId: string,
  nodeId: string,
  imageBrief: string,
  genre: string,
  config: any,
  apiKey: string
): Promise<{ nodeId: string; imageUrl: string | null }> {
  try {
    const styleHint = "dark cinematic semi-realistic, dramatic chiaroscuro lighting, moody atmosphere, film grain, desaturated color palette, deep shadows, volumetric lighting";

    let charDesc = "";
    if (config?.character_bible) {
      const a = config.character_bible.appearance || {};
      charDesc = `Main character: ${config.character_bible.name || ""}, ${a.hair || ""} hair, ${a.eyes || ""} eyes, ${a.build || ""} build, wearing ${a.clothing || ""}. `;
    }

    const prompt = `Generate a 16:9 widescreen illustration in ${styleHint} style. ${charDesc}${imageBrief}. High quality, photorealistic, no text or watermarks, no anime style.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error(`Image gen failed for ${nodeId}:`, response.status);
      return { nodeId, imageUrl: null };
    }

    const data = await response.json();
    const imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageDataUrl) return { nodeId, imageUrl: null };

    const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) return { nodeId, imageUrl: null };

    const imageBytes = Uint8Array.from(atob(base64Match[2]), (c) => c.charCodeAt(0));
    const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
    const fileName = `${storyId}/${nodeId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("story-images")
      .upload(fileName, imageBytes, { contentType: `image/${base64Match[1]}`, upsert: true });

    if (uploadErr) {
      console.error(`Upload error for ${nodeId}:`, uploadErr);
      return { nodeId, imageUrl: null };
    }

    const { data: urlData } = supabase.storage.from("story-images").getPublicUrl(fileName);
    return { nodeId, imageUrl: urlData?.publicUrl || null };
  } catch (err) {
    console.error(`Image gen error for ${nodeId}:`, err);
    return { nodeId, imageUrl: null };
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

    const { job_id } = await req.json();
    if (!job_id) throw new Error("Missing job_id");

    // Get job
    const { data: job } = await supabase.from("generation_jobs").select("*")
      .eq("id", job_id).eq("user_id", user.id).single();
    if (!job) throw new Error("Job not found");
    if (job.status === "completed" || job.status === "failed") {
      return new Response(JSON.stringify({ done: job.status === "completed", status: job.status, progress_percent: job.progress_percent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storyId = job.story_id;

    // Find next batch of nodes without images
    const { data: pendingNodes } = await supabase.from("story_nodes").select("node_id, image_prompt, step")
      .eq("story_id", storyId).is("image_url", null)
      .order("step", { ascending: true }).limit(PARALLEL_COUNT);

    if (!pendingNodes || pendingNodes.length === 0) {
      // All images done
      await supabase.from("generation_jobs").update({
        status: "completed",
        progress_percent: 100,
        current_stage: "완료",
        eta_seconds: 0,
        completed_nodes: job.total_nodes,
        completed_at: new Date().toISOString(),
      }).eq("id", job_id);

      return new Response(JSON.stringify({ done: true, status: "completed", progress_percent: 100 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("No API key configured");

    // Get story for genre context
    const { data: story } = await supabase.from("stories").select("genre, config").eq("id", storyId).single();
    const genre = story?.genre || "horror";
    const config = (story?.config as any) || {};

    // Generate images in parallel
    const results = await Promise.all(
      pendingNodes.map((node: any) =>
        generateSingleImage(
          supabase,
          storyId,
          node.node_id,
          node.image_prompt || `dark cinematic ${genre} scene`,
          genre,
          config,
          LOVABLE_API_KEY
        )
      )
    );

    // Update nodes with images
    let successCount = 0;
    const PLACEHOLDER_IMAGE = "https://placehold.co/1280x720/1a1a2e/ffffff?text=Scene";
    for (const result of results) {
      const finalUrl = result.imageUrl || PLACEHOLDER_IMAGE;
      await supabase.from("story_nodes").update({ image_url: finalUrl })
        .eq("story_id", storyId).eq("node_id", result.nodeId);

      // Set cover for first node
      if (result.nodeId === "n0" && result.imageUrl) {
        await supabase.from("stories").update({ cover_url: result.imageUrl }).eq("id", storyId);
      }
      if (result.imageUrl) successCount++;
    }

    // Update job progress
    const completedNodes = (job.completed_nodes || 0) + successCount;
    const totalNodes = job.total_nodes || 1;
    const imageProgress = Math.round((completedNodes / totalNodes) * 80);
    const progressPercent = Math.min(99, 20 + imageProgress);
    const remainingNodes = totalNodes - completedNodes;
    const etaSeconds = Math.ceil(remainingNodes / PARALLEL_COUNT) * 12;
    const allDone = completedNodes >= totalNodes;

    await supabase.from("generation_jobs").update({
      status: allDone ? "completed" : "generating_images",
      progress_percent: allDone ? 100 : progressPercent,
      current_stage: allDone ? "완료" : `삽화 생성 중 (${completedNodes}/${totalNodes})`,
      eta_seconds: allDone ? 0 : etaSeconds,
      completed_nodes: completedNodes,
      ...(allDone ? { completed_at: new Date().toISOString() } : {}),
    }).eq("id", job_id);

    return new Response(JSON.stringify({
      done: allDone,
      status: allDone ? "completed" : "generating_images",
      progress_percent: allDone ? 100 : progressPercent,
      completed_nodes: completedNodes,
      total_nodes: totalNodes,
      batch_size: pendingNodes.length,
      success_count: successCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-generation-images error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
