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

    const { story_id, node_id } = await req.json();

    const { data: node } = await supabase.from("story_nodes").select("*")
      .eq("story_id", story_id).eq("node_id", node_id).single();
    if (!node) throw new Error("Node not found");

    if (node.image_url) {
      return new Response(JSON.stringify({ image_url: node.image_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: story } = await supabase.from("stories").select("*").eq("id", story_id).single();
    if (!story) throw new Error("Story not found");

    const config = (story.config as any) || {};
    const characterBible = config.character_bible;
    const genre = story.genre;
    const imageBrief = node.image_prompt || `dark cinematic ${genre} scene`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("No API key");

    // Unified dark cinematic semi-realistic style for all genres
    const styleHint = "dark cinematic semi-realistic, dramatic chiaroscuro lighting, moody atmosphere, film grain, desaturated color palette, deep shadows, volumetric lighting";

    let charDesc = "";
    if (characterBible) {
      const a = characterBible.appearance || {};
      charDesc = `Main character: ${characterBible.name || ""}, ${a.hair || ""} hair, ${a.eyes || ""} eyes, ${a.build || ""} build, wearing ${a.clothing || ""}. ${a.distinctive_features || ""}. `;
    }

    const prompt = `Generate a 16:9 widescreen illustration in ${styleHint} style. ${charDesc}${imageBrief}. High quality, photorealistic, no text or watermarks, no anime style.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) throw new Error("Image generation failed");

    const data = await response.json();
    const imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageDataUrl) throw new Error("No image in response");

    const base64Match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) throw new Error("Invalid image format");

    const imageBytes = Uint8Array.from(atob(base64Match[2]), (c) => c.charCodeAt(0));
    const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
    const fileName = `${story_id}/${node_id}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("story-images")
      .upload(fileName, imageBytes, { contentType: `image/${base64Match[1]}`, upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage.from("story-images").getPublicUrl(fileName);
    const imageUrl = urlData?.publicUrl || null;

    await supabase.from("story_nodes").update({ image_url: imageUrl })
      .eq("story_id", story_id).eq("node_id", node_id);

    if (node_id === "n0") {
      await supabase.from("stories").update({ cover_url: imageUrl }).eq("id", story_id);
    }

    return new Response(JSON.stringify({ image_url: imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-node-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
