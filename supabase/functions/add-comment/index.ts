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

    const { action, target_type, target_id, body: commentBody, comment_id } = await req.json();

    if (action === "list") {
      if (!target_type || !target_id) throw new Error("Missing params");
      const { data: comments } = await supabase
        .from("comments")
        .select("*")
        .eq("target_type", target_type)
        .eq("target_id", target_id)
        .order("created_at", { ascending: true });

      // Fetch display names
      const userIds = [...new Set((comments || []).map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.user_id] = p.display_name || "익명"; });

      const enriched = (comments || []).map((c: any) => ({
        ...c,
        display_name: nameMap[c.user_id] || "익명",
      }));

      return new Response(JSON.stringify({ comments: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add") {
      if (!target_type || !target_id || !commentBody) throw new Error("Missing params");
      if (!["game", "novel"].includes(target_type)) throw new Error("Invalid target_type");

      const { data: comment, error } = await supabase.from("comments").insert({
        user_id: user.id,
        target_type,
        target_id,
        body: commentBody,
      }).select().single();
      if (error) throw error;

      return new Response(JSON.stringify({ comment }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!comment_id) throw new Error("Missing comment_id");
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", comment_id)
        .eq("user_id", user.id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action. Use 'list', 'add', or 'delete'.");
  } catch (e) {
    console.error("add-comment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
