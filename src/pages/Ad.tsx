import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Ad() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const type = searchParams.get("type"); // "replay"
  const storyId = searchParams.get("story_id");
  const idempotencyKey = searchParams.get("key");
  const [timer, setTimer] = useState(7);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
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
    if (type === "replay" && storyId && idempotencyKey) {
      try {
        const { data, error } = await supabase.functions.invoke("replay-story", {
          body: { story_id: storyId, idempotency_key: idempotencyKey, ad_watched: true },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.session_id) navigate(`/game/${data.session_id}`);
      } catch (err: any) {
        toast.error(err.message || "재진행 실패");
        navigate(-1);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-lg font-bold text-foreground mb-2">광고</p>
        <p className="text-sm text-muted-foreground mb-6">광고 시청 후 재진행할 수 있습니다</p>
        <div className="my-8 flex h-48 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          광고 영역
        </div>
        <Button onClick={handleContinue} disabled={!canSkip} className="w-full">
          {canSkip ? "계속하기" : `${timer}초 후 계속하기`}
        </Button>
      </div>
    </div>
  );
}
