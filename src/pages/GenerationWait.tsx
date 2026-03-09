import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Sparkles, BookOpen, Clock, CheckCircle2, Trash2 } from "lucide-react";
import DeleteGameDialog from "@/components/DeleteGameDialog";
import { cn } from "@/lib/utils";

const STAGE_ICONS: Record<string, typeof Loader2> = {
  "스토리 구조 생성 중": BookOpen,
  "삽화 생성 중": Sparkles,
  "완료": CheckCircle2,
};

export default function GenerationWait() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completeModal, setCompleteModal] = useState(false);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  // Poll job status every 2 seconds
  useEffect(() => {
    if (!jobId) return;
    mountedRef.current = true;

    const pollJob = async () => {
      const { data } = await supabase
        .from("generation_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (!mountedRef.current) return;
      if (data) {
        setJob(data);
        if (data.status === "completed" && !completeModal) {
          setCompleteModal(true);
          requestBrowserNotification();
        }
      }
      setLoading(false);
    };

    pollJob();
    const interval = setInterval(pollJob, 2000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [jobId]);

  // Drive image generation
  const processNextImage = useCallback(async () => {
    if (processingRef.current || !jobId || !mountedRef.current) return;
    processingRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke("process-generation-images", {
        body: { job_id: jobId },
      });
      if (error) throw error;

      if (data?.done) {
        processingRef.current = false;
        return;
      }

      processingRef.current = false;
      if (mountedRef.current && !data?.done) {
        setTimeout(() => processNextImage(), 500);
      }
    } catch (err) {
      console.error("Image processing error:", err);
      processingRef.current = false;
      if (mountedRef.current) {
        setTimeout(() => processNextImage(), 3000);
      }
    }
  }, [jobId]);

  // Start image generation once job is in generating_images state
  useEffect(() => {
    if (job?.status === "generating_images" && !processingRef.current) {
      processNextImage();
    }
  }, [job?.status, processNextImage]);

  const requestBrowserNotification = () => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("게임 생성 완료!", { body: "게임이 준비되었습니다. 지금 시작하세요!", icon: "/favicon.ico" });
    }
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const formatEta = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return "거의 완료";
    if (seconds < 60) return `약 ${seconds}초`;
    const min = Math.ceil(seconds / 60);
    return `약 ${min}분`;
  };

  const getStageLabel = (stage: string) => {
    if (stage?.includes("/")) return stage;
    return stage || "준비 중";
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">생성 작업을 찾을 수 없습니다.</p>
          <Button onClick={() => navigate("/home")}>홈으로</Button>
        </div>
      </div>
    );
  }

  const progress = job.progress_percent || 0;
  const stage = getStageLabel(job.current_stage);
  const StageIcon = STAGE_ICONS[job.current_stage] || Sparkles;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Animated icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
              <StageIcon className={cn(
                "h-10 w-10 text-primary",
                job.status !== "completed" && "animate-pulse"
              )} />
            </div>
            {job.status !== "completed" && (
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
            )}
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="font-display text-xl font-bold text-foreground">
            {job.status === "completed" ? "게임 준비 완료!" : "게임을 만들고 있어요"}
          </h1>
          <p className="text-sm text-muted-foreground">{stage}</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-3">
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress}%</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatEta(job.eta_seconds)}
            </span>
          </div>
        </div>

        {/* Stage details */}
        {job.status === "generating_images" && job.total_nodes > 0 && (
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">삽화 생성</span>
              <span className="font-medium text-foreground">{job.completed_nodes}/{job.total_nodes}</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: Math.min(job.total_nodes, 21) }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-2 rounded-full transition-colors duration-500",
                    i < job.completed_nodes ? "bg-primary" : "bg-secondary"
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tip text */}
        {job.status !== "completed" && (
          <p className="text-center text-xs text-muted-foreground/60">
            이 페이지에서 생성이 진행됩니다. 페이지를 떠나면 돌아올 때 이어서 생성합니다.
          </p>
        )}

        {/* Actions when not complete */}
        {job.status !== "completed" && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate("/home")}
          >
            나중에 보기
          </Button>
        )}
      </div>

      {/* Completion dialog */}
      <Dialog open={completeModal} onOpenChange={setCompleteModal}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              게임 생성이 완료되었습니다
            </DialogTitle>
            <DialogDescription>
              모든 장면과 삽화가 준비되었습니다. 지금 바로 플레이할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => navigate(`/game/${job.session_id}`)}
              className="w-full"
            >
              🚀 지금 시작하기
            </Button>
            <Button
              variant="outline"
              onClick={() => { setCompleteModal(false); navigate("/home"); }}
              className="w-full"
            >
              나중에 보기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
