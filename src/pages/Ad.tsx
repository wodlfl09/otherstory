import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

export default function Ad() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const type = searchParams.get("type"); // "replay"
  const storyId = searchParams.get("story_id");
  const idempotencyKey = searchParams.get("key");
  const [timer, setTimer] = useState(7);
  const [canSkip, setCanSkip] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storyId || !idempotencyKey) {
      toast.error("잘못된 접근입니다.");
      navigate("/library");
      return;
    }

    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(interval);
          setCanSkip(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleContinue = async () => {
    if (!storyId || !idempotencyKey) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-replay-after-ad", {
        body: { story_id: storyId, idempotency_key: idempotencyKey },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.session_id) {
        navigate(`/game/${data.session_id}`, { replace: true });
      } else {
        throw new Error("세션 생성에 실패했습니다.");
      }
    } catch (err: any) {
      toast.error(err.message || "재진행 실패");
      navigate("/library", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4 rounded-2xl border border-border bg-card p-8 text-center space-y-6">
        <div>
          <p className="text-lg font-bold text-foreground">광고 시청</p>
          <p className="text-sm text-muted-foreground mt-1">광고를 시청하면 재진행할 수 있습니다</p>
        </div>

        {/* Ad placeholder */}
        <div className="flex h-52 items-center justify-center rounded-xl bg-secondary border border-border text-muted-foreground">
          <div className="text-center space-y-2">
            <Play className="h-10 w-10 mx-auto opacity-50" />
            <p className="text-sm">광고 영역</p>
          </div>
        </div>

        {/* Timer / Continue */}
        <div className="space-y-3">
          {!canSkip && (
            <div className="flex items-center justify-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${((7 - timer) / 7) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium text-muted-foreground w-8">{timer}초</span>
            </div>
          )}

          <Button onClick={handleContinue} disabled={!canSkip || loading} className="w-full gap-2" size="lg">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : canSkip ? (
              "계속하기"
            ) : (
              `${timer}초 후 계속하기`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
