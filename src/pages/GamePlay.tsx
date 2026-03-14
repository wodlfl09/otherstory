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
import { Film, ImageIcon, AlertTriangle, Shield, Clock, Brain, Search, ArrowLeft, Home, Swords } from "lucide-react";

const GENRE_LABELS: Record<string, string> = {
  sf: "SF", fantasy: "판타지", mystery: "추리", action: "액션",
  horror: "공포", romance: "로맨스", comic: "코믹", martial: "무협",
};
import MotionComic from "@/components/MotionComic";
import ShareCard from "@/components/game/ShareCard";
import { cn } from "@/lib/utils";

interface ChoiceFeedback {
  type: "clue" | "danger" | "trust" | "time" | "sanity";
  label: string;
  delta: number;
}

interface Choice {
  id: string;
  label: string;
  attitude: string;
  next_node_id: string;
  feedback?: ChoiceFeedback[];
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

/** Truncate scene_text to ~350 chars at sentence boundary for game view */
function truncateSceneText(text: string, maxLen = 350): string {
  if (!text || text.length <= maxLen) return text;
  // Find last sentence-ending punctuation before maxLen
  const cut = text.slice(0, maxLen);
  const lastPeriod = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('。'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf('다.'), cut.lastIndexOf('요.'));
  if (lastPeriod > maxLen * 0.5) return text.slice(0, lastPeriod + 1);
  // If no good break, cut at last space
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) return text.slice(0, lastSpace) + '…';
  return cut + '…';
}

export default function GamePlay() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [node, setNode] = useState<StoryNode | null>(null);
  const [session, setSession] = useState<any>(null);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyGenre, setStoryGenre] = useState("sf");
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [adTimer, setAdTimer] = useState(5);
  const [exitTarget, setExitTarget] = useState<"back" | "home" | null>(null);
  const [feedback, setFeedback] = useState<ChoiceFeedback[] | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [totalNodes, setTotalNodes] = useState(7);
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

    // Check if generation is still in progress for this story
    const { data: pendingJob } = await supabase.from("generation_jobs")
      .select("id, status")
      .eq("story_id", sess.story_id)
      .not("status", "eq", "completed")
      .not("status", "eq", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingJob) {
      toast.info("아직 게임 생성이 완료되지 않았습니다.");
      navigate(`/generating/${pendingJob.id}`);
      return;
    }

    const { data: storyData } = await supabase.from("stories").select("title, genre").eq("id", sess.story_id).single();
    if (storyData) { setStoryTitle(storyData.title); setStoryGenre(storyData.genre); }

    // Count total unique nodes for this story to show accurate progress
    const { count } = await supabase.from("story_nodes")
      .select("id", { count: "exact", head: true })
      .eq("story_id", sess.story_id);
    if (count) setTotalNodes(count);

    const currentNodeId = (sess as any).current_node_id || "n0";
    const { data: graphNode } = await supabase.from("story_nodes").select("*")
      .eq("story_id", sess.story_id).eq("node_id", currentNodeId).single();

    if (graphNode) {
      const choices = graphNode.choices as unknown;
      setNode({
        node_id: graphNode.node_id || currentNodeId,
        step: graphNode.step,
        scene_text: graphNode.scene_text,
        image_url: graphNode.image_url,
        image_prompt: graphNode.image_prompt,
        choices: Array.isArray(choices) ? (choices as Choice[]) : null,
      });
    }
    setLoading(false);
  };

  const checkEndingAdGate = async (choiceId: string): Promise<boolean> => {
    if (!session || !node) return false;
    if (session.ad_shown) return false;

    const selectedChoice = node.choices?.find(c => c.id === choiceId);
    if (!selectedChoice?.next_node_id) return false;

    const { data: nextNode } = await supabase.from("story_nodes")
      .select("choices")
      .eq("story_id", session.story_id)
      .eq("node_id", selectedChoice.next_node_id)
      .single();

    const isEnding = !nextNode?.choices || (nextNode.choices as any[]).length === 0;
    if (!isEnding) return false;

    const { data: profile } = await supabase.from("profiles")
      .select("plan")
      .eq("user_id", session.user_id)
      .single();

    return profile?.plan === "free";
  };

  const getFeedbackFromChoice = (choice: Choice): ChoiceFeedback[] => {
    if (choice.feedback && choice.feedback.length > 0) return choice.feedback;
    const map: Record<string, ChoiceFeedback[]> = {
      positive: [{ type: "clue", label: "단서 획득", delta: 1 }, { type: "danger", label: "위험 상승", delta: 1 }],
      negative: [{ type: "danger", label: "위험 급상승", delta: 2 }, { type: "sanity", label: "정신력 감소", delta: -1 }],
      avoidance: [{ type: "time", label: "시간 경과", delta: -1 }, { type: "trust", label: "신뢰 하락", delta: -1 }],
      neutral: [{ type: "clue", label: "단서 획득", delta: 1 }, { type: "time", label: "시간 경과", delta: -1 }],
    };
    return map[choice.attitude] || map.neutral;
  };

  const pendingChoiceRef = useRef<string | null>(null);

  const handleChoice = async (choiceId: string) => {
    const needsAd = await checkEndingAdGate(choiceId);
    if (needsAd) {
      pendingChoiceRef.current = choiceId;
      setShowAd(true);
      startAdTimer();
      return;
    }

    const selectedChoice = node?.choices?.find(c => c.id === choiceId);
    setChoosing(true);

    if (selectedChoice) {
      const fb = getFeedbackFromChoice(selectedChoice);
      setFeedback(fb);
      setFeedbackVisible(true);
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 1200));

      const { data, error } = await supabase.functions.invoke("navigate-choice", {
        body: { session_id: sessionId, choice_id: choiceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setFeedbackVisible(false);
      setFeedback(null);

      const nextNode: StoryNode = {
        node_id: data.node.node_id,
        step: data.node.step,
        scene_text: data.node.scene_text,
        image_url: data.node.image_url,
        image_prompt: data.node.image_prompt,
        choices: data.node.choices,
      };
      setNode(nextNode);
      setSession((s: any) => s ? { ...s, step: s.step + 1, current_node_id: data.node.node_id, finished: data.finished } : s);
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
    if (pendingChoiceRef.current) {
      const choiceId = pendingChoiceRef.current;
      pendingChoiceRef.current = null;
      handleChoice(choiceId);
    }
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

  // Progress based on actual node count
  const currentStep = (session?.step || 0) + 1;
  const progressPct = Math.min(100, ((session?.step || 0) / Math.max(totalNodes - 1, 1)) * 100);

  // ─── Ending Screen ───
  if (session?.finished) {
    const elapsed = session.created_at && session.updated_at
      ? Math.round((new Date(session.updated_at).getTime() - new Date(session.created_at).getTime()) / 60000)
      : null;

    const chosenChoices = (session.state as any)?.chosen_choices || [];
    const attitudeCounts = chosenChoices.reduce((acc: Record<string, number>, c: any) => {
      const att = c.attitude || "neutral";
      acc[att] = (acc[att] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const total = chosenChoices.length || 1;
    const tendencies = [
      { key: "positive", label: "공격적", icon: "⚔️", color: "bg-green-500" },
      { key: "negative", label: "방어적", icon: "🛡️", color: "bg-destructive" },
      { key: "avoidance", label: "회피적", icon: "🚪", color: "bg-yellow-500" },
      { key: "neutral", label: "신중함", icon: "🤔", color: "bg-primary" },
    ].filter(t => (attitudeCounts[t.key] || 0) > 0);

    const dominant = tendencies.reduce((a, b) =>
      (attitudeCounts[a.key] || 0) >= (attitudeCounts[b.key] || 0) ? a : b,
      tendencies[0]
    );
    const tendencyMessages: Record<string, string> = {
      positive: "당신은 두려움에 맞서 싸웠습니다. 용기가 이 결말을 이끌었습니다.",
      negative: "당신은 신중하게 방어하며 생존을 택했습니다. 경계심이 당신을 지켰습니다.",
      avoidance: "당신은 위험을 피해 다른 길을 찾았습니다. 때로는 도망이 최선입니다.",
      neutral: "당신은 매 순간 깊이 고민하며 선택했습니다. 침착함이 빛났습니다.",
    };
    const endingMessage = dominant ? tendencyMessages[dominant.key] : "당신의 선택이 이 결말을 만들었습니다";

    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-16">
          <div className="text-center mb-8">
            <h1 className="font-display text-2xl font-bold text-primary">🎬 END</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{endingMessage}</p>
          </div>
          {node?.image_url && (
            <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-2xl mb-6">
              <img src={node.image_url} alt="엔딩" className="h-full w-full object-cover" />
            </AspectRatio>
          )}
          <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-6 mb-6">
            <p className="whitespace-pre-wrap leading-relaxed text-foreground text-sm">{node?.scene_text}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-4 text-center">
              <p className="text-lg font-bold text-primary">{session.step || 0}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">총 선택</p>
            </div>
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-4 text-center">
              <p className="text-lg font-bold text-primary">{totalNodes}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">총 장면</p>
            </div>
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-4 text-center">
              <p className="text-lg font-bold text-primary">{elapsed !== null ? `${elapsed}분` : "-"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">소요 시간</p>
            </div>
          </div>

          {tendencies.length > 0 && (
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border p-5 mb-8">
              <p className="text-xs font-bold text-foreground mb-3">
                당신의 플레이 성향: <span className="text-primary">{dominant?.icon} {dominant?.label}</span>
              </p>
              <div className="space-y-2.5">
                {tendencies.map(t => {
                  const count = attitudeCounts[t.key] || 0;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={t.key} className="flex items-center gap-2">
                      <span className="text-sm w-5 shrink-0">{t.icon}</span>
                      <span className="text-[11px] text-muted-foreground w-14 shrink-0">{t.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-700", t.color)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-foreground w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <ShareCard
            storyTitle={storyTitle || "토리게임"}
            endingMessage={endingMessage}
            dominantIcon={dominant?.icon || "🤔"}
            dominantLabel={dominant?.label || "신중함"}
            stats={{ choices: session.step || 0, scenes: totalNodes, elapsed: elapsed !== null ? `${elapsed}분` : "-" }}
            tendencies={tendencies.map(t => ({ key: t.key, label: t.label, icon: t.icon, pct: Math.round(((attitudeCounts[t.key] || 0) / total) * 100) }))}
            imageUrl={node?.image_url}
          />

          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/home")}>
              <Home className="h-4 w-4 mr-2" />홈으로
            </Button>
            <Button className="flex-1" onClick={() => {
              const idempotency_key = crypto.randomUUID();
              supabase.functions.invoke("replay-story", { body: { story_id: session.story_id, idempotency_key } })
                .then(({ data, error }) => {
                  if (error) { toast.error("다시 플레이에 실패했습니다."); return; }
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

  // ─── Active Game Play ───
  const isEnding = node && (!node.choices || node.choices.length === 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Compact Top Bar ── */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-lg border-b border-border/40">
        <div className="max-w-4xl mx-auto px-3 sm:px-4">
          <div className="flex items-center gap-2 h-11">
            {/* Back button */}
            <button onClick={() => setExitTarget("back")}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label="뒤로가기">
              <ArrowLeft className="h-4 w-4" />
            </button>

            {/* Progress pill */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="shrink-0 font-display text-xs font-bold text-primary">
                {currentStep}<span className="text-muted-foreground font-normal">/{totalNodes}</span>
              </span>
              <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            {/* Status chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { const next = !motionComic; setMotionComic(next); localStorage.setItem("motion-comic", String(next)); }}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  motionComic ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Film className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setExitTarget("home")}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label="홈으로">
                <Home className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
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

      {/* ── Choice Feedback Overlay ── */}
      {feedbackVisible && feedback && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex gap-3 sm:gap-4">
            {feedback.map((fb, i) => {
              const meta = FEEDBACK_ICONS[fb.type];
              const Icon = meta?.icon || Search;
              return (
                <div key={i}
                  className="flex flex-col items-center gap-1.5 rounded-2xl bg-card/90 backdrop-blur-xl border border-border/50 px-5 py-4 sm:px-6 sm:py-5 opacity-0 animate-fade-in"
                  style={{ animationDelay: `${i * 150}ms` }}>
                  <Icon className={cn("h-7 w-7 sm:h-8 sm:w-8", meta?.color || "text-foreground")} />
                  <span className="text-[11px] font-bold text-foreground">{fb.label}</span>
                  <span className={cn("text-base font-black", fb.delta > 0 ? "text-green-400" : "text-destructive")}>
                    {fb.delta > 0 ? `+${fb.delta}` : fb.delta}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Scene ── */}
      <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col">
        {node && (
          <div className="flex-1 flex flex-col opacity-0 animate-fade-in">
            {/* Image - hero, full width, cinematic */}
            <div className="w-full relative">
              {node.image_url ? (
                motionComic ? (
                  <MotionComic imageUrl={node.image_url} genre={(session?.state as any)?.genre || "horror"} step={node.step} />
                ) : (
                  <AspectRatio ratio={16 / 9} className="overflow-hidden">
                    <img src={node.image_url} alt={`장면 ${currentStep}`} className="h-full w-full object-cover" />
                  </AspectRatio>
                )
              ) : (
                <AspectRatio ratio={16 / 9} className="overflow-hidden bg-secondary">
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                    <ImageIcon className="h-12 w-12" />
                  </div>
                </AspectRatio>
              )}
              {/* Gradient fade into text area */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            </div>

            {/* Scene text - short & punchy */}
            <div className="px-4 pt-2 pb-3 sm:px-6 sm:pt-3 sm:pb-4">
              <p className="whitespace-pre-wrap leading-[1.85] text-foreground text-[15px] sm:text-base" style={{ wordBreak: "keep-all" }}>
                {truncateSceneText(node.scene_text)}
              </p>
            </div>

            {/* ── Choices ── */}
            {node.choices && node.choices.length > 0 && !choosing && (
              <div className="px-4 pb-6 sm:px-6 sm:pb-8 mt-auto space-y-2.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mb-1">선택하세요</p>
                {node.choices.map((choice, i) => {
                  const style = attitudeStyles[choice.attitude] || attitudeStyles.neutral;
                  return (
                    <button
                      key={choice.id}
                      disabled={choosing}
                      onClick={() => handleChoice(choice.id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl border-2 bg-card/60 backdrop-blur-sm text-left transition-all duration-200",
                        "min-h-[56px] px-4 py-3.5",
                        "disabled:opacity-50 opacity-0 animate-fade-in active:scale-[0.97]",
                        style.border, style.glow
                      )}
                      style={{ animationDelay: `${150 + i * 80}ms` }}
                    >
                      <span className="text-lg shrink-0">{style.icon}</span>
                      <span className="flex-1 text-sm font-medium text-foreground leading-snug line-clamp-2">{choice.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {choosing && !feedbackVisible && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground mt-auto">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-xs">다음 장면으로 이동 중...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Exit confirmation */}
      <AlertDialog open={!!exitTarget} onOpenChange={(open) => !open && setExitTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>게임을 나가시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>현재 진행 상황은 저장되지만, 이 장면에서 다시 시작됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 플레이</AlertDialogCancel>
            <AlertDialogAction onClick={() => exitTarget === "home" ? navigate("/home") : navigate(-1)}>나가기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
