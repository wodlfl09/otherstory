import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AdminCredits() {
  const { profile } = useAuth();
  const role = (profile as any)?.role || "user";
  const isSubadmin = role === "subadmin";

  const [targetId, setTargetId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdjust = async () => {
    if (!targetId || !delta) return;
    const d = parseInt(delta);
    if (isNaN(d)) return;
    if (isSubadmin && d < 0) {
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
    <div className="rounded-xl border border-border bg-card p-6 space-y-5 max-w-lg">
      <h2 className="font-display text-lg font-bold">크레딧 {isSubadmin ? "지급" : "조정"}</h2>
      <p className="text-sm text-muted-foreground">
        {isSubadmin ? "대상 유저에게 크레딧을 지급합니다." : "대상 유저의 크레딧을 지급하거나 차감합니다."}
      </p>

      <div className="space-y-3">
        <div>
          <Label>대상 User ID 또는 이메일</Label>
          <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="UUID 또는 이메일 주소" className="bg-secondary mt-1" />
        </div>
        <div>
          <Label>{isSubadmin ? "지급할 크레딧" : "크레딧 (+/-)"}</Label>
          <Input value={delta} onChange={(e) => setDelta(e.target.value)} type="number" placeholder={isSubadmin ? "양수만 입력" : "양수(지급) 또는 음수(차감)"} className="bg-secondary mt-1" />
        </div>
        <div>
          <Label>사유 (선택)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 이벤트 보상" className="bg-secondary mt-1" />
        </div>
      </div>

      <Button onClick={handleAdjust} disabled={loading || !targetId || !delta} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {loading ? "처리 중..." : "적용"}
      </Button>
    </div>
  );
}
