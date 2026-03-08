import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toast } from "sonner";
import { Film, ImageIcon, AlertTriangle, Shield, Clock, Brain, Search, ArrowLeft, Home } from "lucide-react";
import MotionComic from "@/components/MotionComic";
import { cn } from "@/lib/utils";

interface Choice {
  id: string;
  label: string;
  attitude: string;
  next_node_id: string;
}

interface ChoiceFeedback {
  type: "clue" | "danger" | "trust" | "time" | "sanity";
  label: string;
  delta: number; // positive = good, negative = bad
}

interface StoryNode {
  node_id: string;
  step: number;
  scene_text: string;
  image_url: string | null;
  image_prompt: string | null;
  choices: Choice[] | null;
}

const FEEDBACK_ICONS: Record<string, { icon: typeof Search; color: string; label: string }> = {
  clue: { icon: Search, color: "text-accent", label: "단서" },
  danger: { icon: AlertTriangle, color: "text-destructive", label: "위험" },
  trust: { icon: Shield, color: "text-green-400", label: "신뢰" },
  time: { icon: Clock, color: "text-yellow-400", label: "시간" },
  sanity: { icon: Brain, color: "text-purple-400", label: "정신력" },
};

export default function GamePlay() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [node, setNode] = useState<StoryNode | null>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [adTimer, setAdTimer] = useState(5);
  const [imageLoading, setImageLoading] = useState(false);
  const [exitTarget, setExitTarget] = useState<"back" | "home" | null>(null);
  const [feedback, setFeedback] = useState<ChoiceFeedback[] | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [motionComic, setMotionComic] = useState(() => {
    const saved = localStorage.getItem("motion-comic");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => { loadCurrentScene(); }, [sessionId]);

  const loadCurrentScene = async () => {
    if (!sessionId) return;
    setLoading(true);
    const { data: sess } = await supabase.from("story_sessions").select("*").eq("id", sessionId).single();
    if (!sess) { toast.error("세션을 찾을 수 없습니다."); return; }
    setSession(sess);

    const currentNodeId = (sess as any).current_node_id || "n0";
    const { data: graphNode } = await supabase.from("story_nodes").select("*")
      .eq("story_id", sess.story_id).eq("node_id", currentNodeId).limit(1).single();

    if (graphNode) {
      const choices = graphNode.choices as unknown;
      const nodeData: StoryNode = {
        node_id: graphNode.node_id || currentNodeId,
        step: graphNode.step,
        scene_text: graphNode.scene_text,
        image_url: graphNode.image_url,
        image_prompt: graphNode.image_prompt,
        choices: Array.isArray(choices) ? (choices as Choice[]) : null,
      };
      setNode(nodeData);
      if (!graphNode.image_url && graphNode.image_prompt) generateNodeImage(sess.story_id, currentNodeId);
    } else {
      const { data: nodes } = await supabase.from("story_nodes").select("*")
        .eq("session_id", sessionId).eq("step", sess.step).limit(1);
      if (nodes && nodes.length > 0) {
        const n = nodes[0];
        const choices = n.choices as unknown;
        setNode({
          node_id: n.node_id || `step_${n.step}`, step: n.step, scene_text: n.scene_text,
          image_url: n.image_url, image_prompt: n.image_prompt,
          choices: Array.isArray(choices) ? (choices as Choice[]) : null,
        });
      }
    }
    setLoading(false);
  };

  const generateNodeImage = useCallback(async (storyId: string, nodeId: string) => {
    setImageLoading(true);
    try {
      const { data } = await supabase.functions.invoke("generate-node-image", { body: { story_id: storyId, node_id: nodeId } });
      if (data?.image_url) setNode(prev => prev && prev.node_id === nodeId ? { ...prev, image_url: data.image_url } : prev);
    } catch (err) { console.error("Image gen error:", err); }
    finally { setImageLoading(false); }
  }, []);

  const checkAdGate = () => {
    if (!session) return false;
    if (session.ad_shown || !session.ad_required) return false;
    const midpoints: Record<number, number> = { 10: 3, 20: 6, 30: 9 };
    return session.step === (midpoints[session.duration_min as number] ?? 999);
  };

  // Generate feedback based on attitude
  const generateFeedback = (attitude: string): ChoiceFeedback[] => {
    const feedbackMap: Record<string, ChoiceFeedback[]> = {
      positive: [
        { type: "clue", label: "단서 획득", delta: 1 },
        { type: "danger", label: "위험 상승", delta: 1 },
      ],
      negative: [
        { type: "danger", label: "위험 급상승", delta: 2 },
        { type: "sanity", label: "정신력 감소", delta: -1 },
      ],
      avoidance: [
        { type: "time", label: "시간 경과", delta: -1 },
        { type: "trust", label: "신뢰 하락", delta: -1 },
      ],
      neutral: [
        { type: "clue", label: "단서 획득", delta: 1 },
        { type: "time", label: "시간 경과", delta: -1 },
      ],
    };
    return feedbackMap[attitude] || feedbackMap.neutral;
  };

  const handleChoice = async (choiceId: string) => {
    if (checkAdGate()) { setShowAd(true); startAdTimer(); return; }

    const selectedChoice = node?.choices?.find(c => c.id === choiceId);
    setChoosing(true);

    // Show feedback immediately
    if (selectedChoice) {
      const fb = generateFeedback(selectedChoice.attitude);
      setFeedback(fb);
      setFeedbackVisible(true);
    }

    try {
      const isGraphBased = node?.choices?.some(c => c.next_node_id);

      // Wait a moment for feedback to be seen
      await new Promise(resolve => setTimeout(resolve, 1200));

      if (isGraphBased) {
        const { data, error } = await supabase.functions.invoke("navigate-choice", { body: { session_id: sessionId, choice_id: choiceId } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setFeedbackVisible(false);
        setFeedback(null);

        const nextNode: StoryNode = {
          node_id: data.node.node_id, step: data.node.step, scene_text: data.node.scene_text,
          image_url: data.node.image_url, image_prompt: data.node.image_prompt, choices: data.node.choices,
        };
        setNode(nextNode);
        setSession((s: any) => s ? { ...s, step: s.step + 1, current_node_id: data.node.node_id, finished: data.finished } : s);
        if (!nextNode.image_url && nextNode.image_prompt) generateNodeImage(session.story_id, nextNode.node_id);
      } else {
        const { data, error } = await supabase.functions.invoke("choose-and-generate-next", { body: { session_id: sessionId, choice_id: choiceId } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setFeedbackVisible(false);
        setFeedback(null);
        await loadCurrentScene();
      }
    } catch (err: any) {
      toast.error(err.message || "다음 장면 이동에 실패했습니다.");
      setFeedbackVisible(false);
      setFeedback(null);
    } finally {
      setChoosing(false);
    }
  };

  const startAdTimer = () => {
    setAdTimer(5);
    const interval = setInterval(() => {
      setAdTimer((t) => { if (t <= 1) { clearInterval(interval); return 0; } return t - 1; });
    }, 1000);
  };

  const handleAdDismiss = async () => {
    await supabase.functions.invoke("mark-ad-shown", { body: { session_id: sessionId } });
    setShowAd(false);
    setSession((s: any) => s ? { ...s, ad_shown: true } : s);
  };

  const attitudeStyles: Record<string, { border: string; icon: string; glow: string }> = {
    positive: { border: "border-green-500/40 hover:border-green-500/80", icon: "⚔️", glow: "hover:shadow-[0_0_20px_hsl(120_60%_50%/0.2)]" },
    negative: { border: "border-red-500/40 hover:border-red-500/80", icon: "🛡️", glow: "hover:shadow-[0_0_20px_hsl(0_72%_51%/0.2)]" },
    avoidance: { border: "border-yellow-500/40 hover:border-yellow-500/80", icon: "🚪", glow: "hover:shadow-[0_0_20px_hsl(45_100%_55%/0.2)]" },
    neutral: { border: "border-border hover:border-primary/60", icon: "🤔", glow: "hover:shadow-[0_0_20px_hsl(265_90%_60%/0.2)]" },
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">장면을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const totalSteps = session?.duration_min === 10 ? 7 : session?.duration_min === 20 ? 13 : 19;
  const progressPct = Math.min(100, ((session?.step || 0) / (totalSteps - 1)) * 100);

  if (session?.finished) {
    const elapsed = session.created_at && session.updated_at
      ? Math.round((new Date(session.updated_at).getTime() - new Date(session.created_at).getTime()) / 60000)
      : null;

    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-16">
          {/* Ending */}
          <div className="text-center mb-8">
            <h1 className="font-display text-2xl font-bold text-primary">🎬 END</h1>
            <p className="text-sm text-muted-foreground mt-1">당신의 선택이 이 결말을 만들었습니다</p>
          </div>
          {node?.image_url && (
            <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-2xl mb-6">
              <img src={node.image_url} alt="엔딩" className="h-full w-full object-cover" />
            </AspectRatio>
          )}
          <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-6 mb-6">
            <p className="whitespace-pre-wrap leading-relaxed text-foreground text-sm">{node?.scene_text}</p>
          </div>

          {/* Play stats */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-4 text-center">
              <p className="text-lg font-bold text-primary">{session.step || 0}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">총 선택</p>
            </div>
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-4 text-center">
              <p className="text-lg font-bold text-primary">{totalSteps}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">총 장면</p>
            </div>
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-4 text-center">
              <p className="text-lg font-bold text-primary">{elapsed !== null ? `${elapsed}분` : "-"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">소요 시간</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/home")}>
              <Home className="h-4 w-4 mr-2" />홈으로
            </Button>
            <Button className="flex-1" onClick={() => {
              const idempotency_key = crypto.randomUUID();
              supabase.functions.invoke("replay-story", { body: { story_id: session.story_id, idempotency_key } })
                .then(({ data, error }) => {
                  if (error) { toast.error("다시 플레이에 실패했습니다."); return; }
                  if (data?.ad_required) { navigate(`/ad?type=replay&story_id=${session.story_id}&key=${idempotency_key}`); return; }
                  if (data?.error) { toast.error(data.error); return; }
                  if (data?.session_id) navigate(`/game/${data.session_id}`);
                })
                .catch(() => toast.error("다시 플레이에 실패했습니다."));
            }}>
              다시 플레이
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar — progress + status */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => session?.finished ? navigate(-1) : setExitTarget("back")}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="뒤로가기"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => session?.finished ? navigate("/home") : setExitTarget("home")}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="홈으로"
          >
            <Home className="h-4 w-4" />
          </button>
          <span className="font-display text-[10px] sm:text-xs text-muted-foreground tracking-wider">
            CH.{(session?.step || 0) + 1}
          </span>
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">{Math.round(progressPct)}%</span>
          <button
            onClick={() => { const next = !motionComic; setMotionComic(next); localStorage.setItem("motion-comic", String(next)); }}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors",
              motionComic ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Film className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Ad overlay */}
      {showAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
          <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-lg font-bold text-foreground">광고</p>
            <div className="my-8 flex h-40 items-center justify-center rounded-lg bg-secondary text-muted-foreground">광고 영역</div>
            <Button onClick={handleAdDismiss} disabled={adTimer > 0} className="w-full">
              {adTimer > 0 ? `${adTimer}초 후 계속하기` : "계속하기"}
            </Button>
          </div>
        </div>
      )}

      {/* Choice feedback overlay */}
      {feedbackVisible && feedback && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex gap-4 opacity-0 animate-fade-in">
            {feedback.map((fb, i) => {
              const meta = FEEDBACK_ICONS[fb.type];
              const Icon = meta?.icon || Search;
              return (
                <div key={i} className="flex flex-col items-center gap-1 rounded-xl bg-card/80 backdrop-blur-xl border border-border/50 px-5 py-4 opacity-0 animate-fade-in"
                  style={{ animationDelay: `${i * 200}ms` }}>
                  <Icon className={cn("h-6 w-6", meta?.color || "text-foreground")} />
                  <span className="text-xs font-bold text-foreground">{fb.label}</span>
                  <span className={cn("text-sm font-bold", fb.delta > 0 ? "text-green-400" : "text-destructive")}>
                    {fb.delta > 0 ? `+${fb.delta}` : fb.delta}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 max-w-4xl mx-auto w-full">
        {node && (
          <div className="opacity-0 animate-fade-in">
            {/* 16:9 Scene Image — full width, immersive */}
            <div className="w-full">
              {node.image_url ? (
                motionComic ? (
                  <MotionComic imageUrl={node.image_url} genre={(session?.state as any)?.genre || "horror"} step={node.step} />
                ) : (
                  <AspectRatio ratio={16 / 9} className="overflow-hidden border-b border-border">
                    <img src={node.image_url} alt={`CH.${node.step + 1}`} className="h-full w-full object-cover" />
                  </AspectRatio>
                )
              ) : imageLoading ? (
                <AspectRatio ratio={16 / 9} className="overflow-hidden bg-secondary border-b border-border">
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <div className="flex items-center gap-1.5 text-xs"><ImageIcon className="h-3.5 w-3.5" />삽화 생성 중...</div>
                  </div>
                </AspectRatio>
              ) : (
                <AspectRatio ratio={16 / 9} className="overflow-hidden bg-secondary border-b border-border">
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                    <ImageIcon className="h-12 w-12" />
                  </div>
                </AspectRatio>
              )}
            </div>

            {/* Scene text — short, punchy */}
            <div className="px-4 py-5 sm:px-6">
              <p className="whitespace-pre-wrap leading-relaxed text-foreground text-sm sm:text-base">
                {node.scene_text}
              </p>
            </div>

            {/* Choices — bold, game-like */}
            {node.choices && node.choices.length > 0 && !choosing && (
              <div className="px-4 pb-8 sm:px-6 space-y-2.5">
                {node.choices.map((choice, i) => {
                  const style = attitudeStyles[choice.attitude] || attitudeStyles.neutral;
                  return (
                    <button
                      key={choice.id}
                      disabled={choosing}
                      onClick={() => handleChoice(choice.id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl border-2 bg-card/50 backdrop-blur-sm p-4 text-left transition-all duration-200",
                        "disabled:opacity-50 opacity-0 animate-fade-in active:scale-[0.98]",
                        style.border, style.glow
                      )}
                      style={{ animationDelay: `${200 + i * 100}ms` }}
                    >
                      <span className="text-lg shrink-0">{style.icon}</span>
                      <span className="flex-1 text-sm font-medium text-foreground leading-snug">{choice.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {choosing && !feedbackVisible && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-xs">다음 장면으로 이동 중...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Exit confirmation dialog */}
      <AlertDialog open={!!exitTarget} onOpenChange={(open) => !open && setExitTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>게임을 나가시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              현재 진행 상황은 저장되지만, 이 장면에서 다시 시작됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 플레이</AlertDialogCancel>
            <AlertDialogAction onClick={() => exitTarget === "home" ? navigate("/home") : navigate(-1)}>
              나가기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
