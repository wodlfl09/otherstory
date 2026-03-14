import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  BookOpen,
  Clock,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Users,
  Image,
  Mic,
  ShieldCheck,
  Gamepad2,
} from "lucide-react";
import DeleteGameDialog from "@/components/DeleteGameDialog";
import { cn } from "@/lib/utils";

/* ── Stage definitions ── */
const STAGES = [
  { key: "스토리 구조 생성 중", icon: BookOpen, label: "스토리 구조 생성 중" },
  { key: "선택지 분기 설계 중", icon: Gamepad2, label: "선택지 분기 설계 중" },
  { key: "등장인물 설정 정리 중", icon: Users, label: "등장인물 설정 정리 중" },
  { key: "장면 삽화 준비 중", icon: Image, label: "장면 삽화 준비 중" },
  { key: "삽화 생성 중", icon: Image, label: "장면 삽화 생성 중" },
  { key: "음성 연출 준비 중", icon: Mic, label: "음성 연출 준비 중" },
  { key: "최종 검수 중", icon: ShieldCheck, label: "최종 검수 중" },
  { key: "완료", icon: CheckCircle2, label: "완료" },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/* ── Rotating ambient messages ── */
const AMBIENT_MESSAGES = [
  "당신의 이야기를 만들고 있습니다",
  "장면과 선택지를 설계하는 중입니다",
  "등장인물의 운명을 정리하는 중입니다",
  "결말로 향하는 길을 만들고 있습니다",
  "몰입할 수 있는 분위기를 준비하고 있습니다",
  "삽화에 생명을 불어넣고 있습니다",
];

/* ── ETA formatter ── */
function formatEta(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "곧 완료됩니다";
  if (seconds < 30) return "곧 완료됩니다";
  if (seconds < 60) return "약 1분 이내";
  const min = Math.round(seconds / 60);
  if (min <= 1) return "약 1분";
  if (min <= 3) return "약 2~3분";
  if (min <= 5) return "약 3~5분";
  return `약 ${min}분`;
}

/* ── Stage icon resolver ── */
function resolveStage(raw: string | null) {
  if (!raw) return { icon: Sparkles, label: "준비 중" };
  // Check if the stage matches generating_images status
  if (raw.includes("/")) return { icon: Image, label: raw };
  const found = STAGE_MAP[raw];
  if (found) return { icon: found.icon, label: found.label };
  return { icon: Sparkles, label: raw };
}

export default function GenerationWait() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completeModal, setCompleteModal] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ambientIdx, setAmbientIdx] = useState(0);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const completedOnceRef = useRef(false);

  /* ── Rotate ambient messages every 4s ── */
  useEffect(() => {
    const timer = setInterval(() => {
      setAmbientIdx((prev) => (prev + 1) % AMBIENT_MESSAGES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  /* ── Request browser notification permission on mount ── */
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  /* ── Poll job status every 2s ── */
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
        if (data.status === "completed" && !completedOnceRef.current) {
          completedOnceRef.current = true;
          setCompleteModal(true);
          sendBrowserNotification();
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

  /* ── Drive image generation pipeline ── */
  const processNextImage = useCallback(async () => {
    if (processingRef.current || !jobId || !mountedRef.current) return;
    processingRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke(
        "process-generation-images",
        { body: { job_id: jobId } }
      );
      if (error) throw error;

      processingRef.current = false;
      if (!data?.done && mountedRef.current) {
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

  useEffect(() => {
    if (job?.status === "generating_images" && !processingRef.current) {
      processNextImage();
    }
  }, [job?.status, processNextImage]);

  /* ── Browser notification ── */
  const sendBrowserNotification = () => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("게임 생성 완료! 🎮", {
        body: "게임이 준비되었습니다. 지금 시작하세요!",
        icon: "/favicon.ico",
      });
    }
  };

  /* ── Delete / cancel ── */
  const handleDeleteGame = async () => {
    if (!job) return;
    setDeleting(true);
    try {
      await supabase
        .from("stories")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", job.story_id);
      await supabase
        .from("generation_jobs")
        .update({
          status: "failed",
          current_stage: "사용자에 의해 취소됨",
        } as any)
        .eq("id", jobId);
      toast.success("게임이 삭제되었습니다.");
      navigate("/home");
    } catch (err: any) {
      toast.error(err.message || "삭제 실패");
    } finally {
      setDeleting(false);
    }
  };

  /* ── Retry on failure ── */
  const handleRetry = () => {
    // Navigate back to create to try again
    navigate("/create");
  };

  /* ── Stage progress indicator ── */
  const stageProgress = useMemo(() => {
    if (!job) return [];
    const currentKey = job.current_stage;
    const currentIdx = STAGES.findIndex((s) => s.key === currentKey);
    // For generating_images, map to 삽화 stage
    const effectiveIdx =
      job.status === "generating_images"
        ? STAGES.findIndex((s) => s.key === "삽화 생성 중")
        : currentIdx >= 0
        ? currentIdx
        : 0;

    return STAGES.filter((s) => s.key !== "완료").map((s, i) => ({
      ...s,
      status:
        i < effectiveIdx ? "done" : i === effectiveIdx ? "active" : "pending",
    }));
  }, [job]);

  /* ── Render states ── */
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
          <p className="text-muted-foreground">
            생성 작업을 찾을 수 없습니다.
          </p>
          <Button onClick={() => navigate("/home")}>홈으로</Button>
        </div>
      </div>
    );
  }

  const progress = job.progress_percent || 0;
  const { icon: StageIcon, label: stageLabel } = resolveStage(
    job.current_stage
  );
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* ── Animated hero icon ── */}
        <div className="flex justify-center">
          <div className="relative">
            <div
              className={cn(
                "h-28 w-28 rounded-full flex items-center justify-center transition-colors duration-500",
                isFailed
                  ? "bg-destructive/10"
                  : isCompleted
                  ? "bg-primary/20"
                  : "bg-primary/10"
              )}
            >
              {isFailed ? (
                <AlertTriangle className="h-12 w-12 text-destructive" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-12 w-12 text-primary" />
              ) : (
                <StageIcon className="h-12 w-12 text-primary animate-pulse" />
              )}
            </div>
            {!isCompleted && !isFailed && (
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
            )}
          </div>
        </div>

        {/* ── Title ── */}
        <div className="text-center space-y-2">
          <h1 className="font-display text-xl font-bold text-foreground">
            {isFailed
              ? "생성에 실패했습니다"
              : isCompleted
              ? "게임 준비 완료! 🎮"
              : "게임을 만들고 있어요"}
          </h1>

          {/* Rotating ambient message */}
          {!isCompleted && !isFailed && (
            <p
              key={ambientIdx}
              className="text-sm text-muted-foreground animate-fade-in"
            >
              {AMBIENT_MESSAGES[ambientIdx]}
            </p>
          )}

          {isFailed && (
            <p className="text-sm text-muted-foreground">
              {job.current_stage === "사용자에 의해 취소됨"
                ? "사용자가 생성을 취소했습니다."
                : "문제가 발생했습니다. 다시 시도해주세요."}
            </p>
          )}
        </div>

        {/* ── Progress bar (not shown when failed) ── */}
        {!isFailed && (
          <div className="space-y-2">
            <Progress value={progress} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="font-medium">{progress}%</span>
              {!isCompleted && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatEta(job.eta_seconds)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Current stage label ── */}
        {!isFailed && !isCompleted && (
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-4 space-y-3">
            <div className="flex items-center gap-2">
              <StageIcon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {stageLabel}
              </span>
            </div>

            {/* Stage step dots */}
            <div className="flex items-center gap-1.5">
              {stageProgress.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full transition-all duration-500",
                      s.status === "done" && "bg-primary",
                      s.status === "active" &&
                        "bg-primary ring-2 ring-primary/30 scale-125",
                      s.status === "pending" && "bg-secondary"
                    )}
                    title={s.label}
                  />
                  {i < stageProgress.length - 1 && (
                    <div
                      className={cn(
                        "h-px w-3 transition-colors duration-500",
                        s.status === "done" ? "bg-primary/50" : "bg-secondary"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Image node progress when generating_images */}
            {job.status === "generating_images" && job.total_nodes > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">삽화 생성</span>
                  <span className="font-medium text-foreground">
                    {job.completed_nodes}/{job.total_nodes}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from(
                    { length: Math.min(job.total_nodes, 21) },
                    (_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 rounded-full transition-colors duration-500",
                          i < job.completed_nodes
                            ? "bg-primary"
                            : "bg-secondary"
                        )}
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tip text ── */}
        {!isCompleted && !isFailed && (
          <p className="text-center text-xs text-muted-foreground/60">
            이 페이지를 떠나도 괜찮아요. 돌아오면 이어서 진행됩니다.
          </p>
        )}

        {/* ── Action buttons ── */}
        {isFailed && (
          <div className="flex flex-col gap-2">
            <Button onClick={handleRetry} className="w-full">
              <RefreshCw className="h-4 w-4 mr-1.5" />
              다시 시도
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/home")}
              className="w-full"
            >
              홈으로
            </Button>
          </div>
        )}

        {!isCompleted && !isFailed && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/home")}
            >
              나중에 보기
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              생성 중지
            </Button>
          </div>
        )}

        {isCompleted && !completeModal && (
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => navigate(`/game/${job.session_id}`)}
              className="w-full"
            >
              🚀 지금 시작하기
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/library")}
              className="w-full"
            >
              나중에 보기
            </Button>
          </div>
        )}
      </div>

      {/* ── Completion dialog ── */}
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
              onClick={() => {
                setCompleteModal(false);
                navigate("/library");
              }}
              className="w-full"
            >
              나중에 보기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <DeleteGameDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteGame}
        loading={deleting}
      />
    </div>
  );
}
