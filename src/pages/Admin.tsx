import { useState } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Users, Coins, UserCog } from "lucide-react";

export default function Admin() {
  const { user, profile } = useAuth();
  const role = (profile as any)?.role || "user";

  if (role !== "admin" && role !== "subadmin") {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto max-w-lg px-4 pt-24 text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="font-display text-2xl font-bold">접근 권한 없음</h1>
          <p className="mt-2 text-muted-foreground">관리자 권한이 필요합니다.</p>
          <BootstrapSection />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <h1 className="font-display text-2xl font-bold mb-6">관리자 패널</h1>

        <Tabs defaultValue="users">
          <TabsList className="bg-secondary mb-6">
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" />유저 관리</TabsTrigger>
            <TabsTrigger value="credits" className="gap-2"><Coins className="h-4 w-4" />크레딧</TabsTrigger>
            {role === "admin" && (
              <TabsTrigger value="roles" className="gap-2"><UserCog className="h-4 w-4" />역할</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="users"><UserManagement /></TabsContent>
          <TabsContent value="credits"><CreditManagement role={role} /></TabsContent>
          {role === "admin" && <TabsContent value="roles"><RoleManagement /></TabsContent>}
        </Tabs>
      </div>
    </div>
  );
}

function BootstrapSection() {
  const { user, refreshProfile } = useAuth();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

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

  if (!user?.email?.includes("berryckor")) return null;

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-6">
      <h3 className="font-display text-sm font-bold mb-3">관리자 부트스트랩</h3>
      <div className="flex gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="부트스트랩 토큰"
          className="bg-secondary"
        />
        <Button onClick={handleBootstrap} disabled={loading}>
          {loading ? "..." : "승격"}
        </Button>
      </div>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("admin-manage", {
      body: { action: "list_users", search: search || undefined },
    });
    setUsers(data?.users || []);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 또는 user_id 검색"
          className="bg-secondary"
          onKeyDown={(e) => e.key === "Enter" && loadUsers()}
        />
        <Button onClick={loadUsers} disabled={loading}>검색</Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="p-3 text-left">이름</th>
              <th className="p-3 text-left">역할</th>
              <th className="p-3 text-left">플랜</th>
              <th className="p-3 text-right">크레딧</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-3 text-foreground">{u.display_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{u.role || "user"}</td>
                <td className="p-3 text-muted-foreground">{u.plan}</td>
                <td className="p-3 text-right text-accent">{u.credits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreditManagement({ role }: { role: string }) {
  const [targetId, setTargetId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdjust = async () => {
    if (!targetId || !delta) return;
    const d = parseInt(delta);
    if (isNaN(d)) return;
    if (role === "subadmin" && d < 0) {
      toast.error("부관리자는 크레딧 지급만 가능합니다.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage", {
        body: { action: "adjust_credits", target_user_id: targetId, delta: d, reason },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`크레딧 조정 완료: ${data.new_credits}`);
      setTargetId("");
      setDelta("");
      setReason("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4 max-w-lg">
      <h3 className="font-display text-sm font-bold">크레딧 {role === "subadmin" ? "지급" : "조정"}</h3>
      <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="대상 user_id" className="bg-secondary" />
      <Input value={delta} onChange={(e) => setDelta(e.target.value)} type="number" placeholder={role === "subadmin" ? "지급할 크레딧 (양수)" : "크레딧 (+/-)"} className="bg-secondary" />
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 (선택)" className="bg-secondary" />
      <Button onClick={handleAdjust} disabled={loading}>{loading ? "처리 중..." : "적용"}</Button>
    </div>
  );
}

function RoleManagement() {
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
    <div className="rounded-xl border border-border bg-card p-6 space-y-4 max-w-lg">
      <h3 className="font-display text-sm font-bold">역할 변경 (admin 전용)</h3>
      <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="대상 user_id" className="bg-secondary" />
      <select
        value={newRole}
        onChange={(e) => setNewRole(e.target.value)}
        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
      >
        <option value="user">user</option>
        <option value="subadmin">subadmin</option>
        <option value="admin">admin</option>
      </select>
      <Button onClick={handleSetRole} disabled={loading}>{loading ? "..." : "역할 변경"}</Button>
    </div>
  );
}
