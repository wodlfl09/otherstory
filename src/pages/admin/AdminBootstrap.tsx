import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield, KeyRound, Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function AdminBootstrap() {
  const { user, profile, refreshProfile } = useAuth();
  const role = (profile as any)?.role || "user";
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  // Already admin/subadmin → go to admin panel
  if (role === "admin" || role === "subadmin") {
    return <Navigate to="/admin/users" replace />;
  }

  // Only berryckor can bootstrap
  const canBootstrap = user?.email?.includes("berryckor");

  const handleBootstrap = async () => {
    if (!token.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage", {
        body: { action: "bootstrap", bootstrap_token: token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.message || "관리자 권한 부여 완료");
      await refreshProfile();
    } catch (err: any) {
      toast.error(err.message || "부트스트랩 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-lg px-4 pt-24 text-center">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="font-display text-2xl font-bold">접근 권한 없음</h1>
        <p className="mt-2 text-muted-foreground">관리자 권한이 필요합니다.</p>

        {canBootstrap && (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-left">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-bold">관리자 부트스트랩</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">부트스트랩 토큰을 입력하여 관리자 권한을 받으세요. 이미 admin인 경우 재실행이 차단됩니다.</p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="부트스트랩 토큰"
                className="bg-secondary"
                onKeyDown={(e) => e.key === "Enter" && handleBootstrap()}
              />
              <Button onClick={handleBootstrap} disabled={loading || !token.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "승격"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
