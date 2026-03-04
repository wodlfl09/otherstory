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

    const body = await req.json();
    const { action } = body;

    // Bootstrap action - special case
    if (action === "bootstrap") {
      const { bootstrap_token } = body;
      const expectedToken = Deno.env.get("ADMIN_BOOTSTRAP_TOKEN");
      if (!expectedToken) throw new Error("Bootstrap token not configured");
      if (bootstrap_token !== expectedToken) throw new Error("Invalid bootstrap token");

      // Check if user email contains "berryckor"
      if (!user.email?.includes("berryckor")) {
        throw new Error("Only berryckor can bootstrap admin");
      }

      // Check if already admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (profile?.role === "admin") {
        return new Response(JSON.stringify({ success: true, message: "Already admin" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("profiles").update({ role: "admin" }).eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true, message: "Admin role granted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require admin/subadmin role
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const callerRole = callerProfile?.role || "user";
    if (callerRole !== "admin" && callerRole !== "subadmin") {
      throw new Error("관리자 권한이 필요합니다.");
    }

    if (action === "list_users") {
      const { page = 0, search } = body;
      let query = supabase
        .from("profiles")
        .select("*")
        .range(page * 50, (page + 1) * 50 - 1)
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,user_id.eq.${search}`);
      }

      const { data: users } = await query;
      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "adjust_credits") {
      const { target_user_id, delta, reason } = body;
      if (!target_user_id || delta === undefined) throw new Error("Missing params");

      // Subadmin can only grant (positive delta)
      if (callerRole === "subadmin" && delta < 0) {
        throw new Error("부관리자는 크레딧 지급만 가능합니다.");
      }

      // Only admin can deduct
      if (delta < 0 && callerRole !== "admin") {
        throw new Error("크레딧 차감은 관리자만 가능합니다.");
      }

      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("user_id", target_user_id)
        .single();
      if (!targetProfile) throw new Error("Target user not found");

      await supabase.from("profiles").update({
        credits: targetProfile.credits + delta,
      }).eq("user_id", target_user_id);

      await supabase.from("credits_ledger").insert({
        user_id: target_user_id,
        delta,
        reason: reason || `admin_adjust_by_${callerRole}`,
        meta: { admin_id: user.id },
      });

      return new Response(JSON.stringify({ success: true, new_credits: targetProfile.credits + delta }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_role") {
      if (callerRole !== "admin") throw new Error("역할 변경은 관리자만 가능합니다.");

      const { target_user_id, role } = body;
      if (!target_user_id || !role) throw new Error("Missing params");
      if (!["user", "subadmin", "admin"].includes(role)) throw new Error("Invalid role");

      await supabase.from("profiles").update({ role }).eq("user_id", target_user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("admin error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
