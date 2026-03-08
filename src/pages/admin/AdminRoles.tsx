import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function AdminRoles() {
  const { profile } = useAuth();
  const role = (profile as any)?.role || "user";

  if (role !== "admin") return <Navigate to="/admin/users" replace />;

  const [targetId, setTargetId] = useState("");
  const [newRole, setNewRole] = useState("subadmin");
  const [loading, setLoading] = useState(false);

  const handleSetRole = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage", {
        body: { action: "set_role", target_user_id: targetId, role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("역할 변경 완료");
      setTargetId("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5 max-w-lg">
      <h2 className="font-display text-lg font-bold">역할 변경</h2>
      <p className="text-sm text-muted-foreground">대상 유저의 역할을 변경합니다. admin 전용 기능입니다.</p>

      <div className="space-y-3">
        <div>
          <Label>대상 User ID</Label>
          <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="UUID" className="bg-secondary mt-1" />
        </div>
        <div>
          <Label>새 역할</Label>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger className="bg-secondary mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="subadmin">subadmin</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={handleSetRole} disabled={loading || !targetId} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {loading ? "처리 중..." : "역할 변경"}
      </Button>
    </div>
  );
}
