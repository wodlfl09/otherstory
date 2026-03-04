import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle } from "lucide-react";

const TERMS = [
  { id: "age", label: "본인은 만 19세 이상임을 확인합니다." },
  { id: "content", label: "성인 콘텐츠의 특성을 이해하며, 자발적으로 열람을 요청합니다." },
  { id: "responsibility", label: "본 콘텐츠의 열람에 대한 책임은 본인에게 있음을 동의합니다." },
  { id: "policy", label: "성인 콘텐츠 이용약관 및 개인정보 처리방침에 동의합니다." },
];

export default function AdultVerify() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const allChecked = TERMS.every((t) => checked[t.id]);

  const handleSubmit = async () => {
    if (!user || !allChecked) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ adult_verified: true })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("성인 인증이 완료되었습니다.");
      navigate("/home");
    } catch {
      toast.error("인증 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-lg px-4 pt-24 pb-16">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="rounded-full bg-destructive/10 p-4">
            <ShieldCheck className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">성인 인증</h1>
          <p className="text-center text-sm text-muted-foreground">
            성인 콘텐츠에 접근하려면 아래 약관에 모두 동의해야 합니다.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">
              허위로 성인 인증을 진행할 경우 관련 법률에 따라 불이익을 받을 수 있습니다.
            </p>
          </div>

          <div className="space-y-4">
            {TERMS.map((term) => (
              <label
                key={term.id}
                className="flex items-start gap-3 cursor-pointer group"
              >
                <Checkbox
                  checked={!!checked[term.id]}
                  onCheckedChange={(v) =>
                    setChecked((prev) => ({ ...prev, [term.id]: !!v }))
                  }
                  className="mt-0.5"
                />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  {term.label}
                </span>
              </label>
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <Checkbox
                checked={allChecked}
                onCheckedChange={(v) => {
                  const val = !!v;
                  setChecked(Object.fromEntries(TERMS.map((t) => [t.id, val])));
                }}
                className="mt-0.5"
              />
              <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                전체 동의
              </span>
            </label>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!allChecked || loading}
          className="mt-6 w-full py-6 text-lg font-bold"
        >
          {loading ? "처리 중..." : "인증 완료"}
        </Button>
      </div>
    </div>
  );
}
