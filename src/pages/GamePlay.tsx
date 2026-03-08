import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toast } from "sonner";
import { Film, ImageIcon } from "lucide-react";
import MotionComic from "@/components/MotionComic";

interface Choice {
  id: string;
  label: string;
  attitude: string;
  next_node_id: string;
}

interface StoryNode {
  node_id: string;
  step: number;
  scene_text: string;
  image_url: string | null;
  image_prompt: string | null;
  choices: Choice[] | null;
}

export default function GamePlay() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [node, setNode] = useState<StoryNode | null>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [adTimer, setAdTimer] = useState(5);
  const [imageLoading, setImageLoading] = useState(false);
  const [motionComic, setMotionComic] = useState(() => {
    const saved = localStorage.getItem("motion-comic");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    loadCurrentScene();
  }, [sessionId]);

  const loadCurrentScene = async () => {
    if (!sessionId) return;
    setLoading(true);

    const { data: sess } = await supabase
      .from("story_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!sess) { toast.error("세션을 찾을 수 없습니다."); return; }
    setSession(sess);

    const currentNodeId = (sess as any).current_node_id || "n0";

    // Try graph-based query first
    const { data: graphNode } = await supabase
      .from("story_nodes")
      .select("*")
      .eq("story_id", sess.story_id)
      .eq("node_id", currentNodeId)
      .limit(1)
      .single();

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

      // Lazy image generation if no image
      if (!graphNode.image_url && graphNode.image_prompt) {
        generateNodeImage(sess.story_id, currentNodeId);
      }
    } else {
      // Fallback for old sessions (session_id based)
      const { data: nodes } = await supabase
        .from("story_nodes")
        .select("*")
        .eq("session_id", sessionId)
        .eq("step", sess.step)
        .limit(1);

      if (nodes && nodes.length > 0) {
        const n = nodes[0];
        const choices = n.choices as unknown;
        setNode({
          node_id: n.node_id || `step_${n.step}`,
          step: n.step,
          scene_text: n.scene_text,
          image_url: n.image_url,
          image_prompt: n.image_prompt,
          choices: Array.isArray(choices) ? (choices as Choice[]) : null,
        });
      }
    }
    setLoading(false);
  };

  const generateNodeImage = useCallback(async (storyId: string, nodeId: string) => {
    setImageLoading(true);
    try {
      const { data } = await supabase.functions.invoke("generate-node-image", {
        body: { story_id: storyId, node_id: nodeId },
      });
      if (data?.image_url) {
        setNode(prev => prev && prev.node_id === nodeId ? { ...prev, image_url: data.image_url } : prev);
      }
    } catch (err) {
      console.error("Image gen error:", err);
    } finally {
      setImageLoading(false);
    }
  }, []);

  const checkAdGate = () => {
    if (!session) return false;
    if (session.ad_shown || !session.ad_required) return false;
    const midpoints: Record<number, number> = { 10: 3, 20: 6, 30: 9 };
    const mid = midpoints[session.duration_min as number] ?? 999;
    return session.step === mid;
  };

  const handleChoice = async (choiceId: string) => {
    if (checkAdGate()) {
      setShowAd(true);
      startAdTimer();
      return;
    }

    setChoosing(true);
    try {
      // Check if this is a graph-based node (has next_node_id in choices)
      const isGraphBased = node?.choices?.some(c => c.next_node_id);

      if (isGraphBased) {
        // New graph-based navigation - no AI generation
        const { data, error } = await supabase.functions.invoke("navigate-choice", {
          body: { session_id: sessionId, choice_id: choiceId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const nextNode: StoryNode = {
          node_id: data.node.node_id,
          step: data.node.step,
          scene_text: data.node.scene_text,
          image_url: data.node.image_url,
          image_prompt: data.node.image_prompt,
          choices: data.node.choices,
        };
        setNode(nextNode);
        setSession((s: any) => s ? {
          ...s,
          step: s.step + 1,
          current_node_id: data.node.node_id,
          finished: data.finished,
        } : s);

        // Lazy image generation
        if (!nextNode.image_url && nextNode.image_prompt) {
          generateNodeImage(session.story_id, nextNode.node_id);
        }
      } else {
        // Legacy: AI-based generation for old sessions
        const { data, error } = await supabase.functions.invoke("choose-and-generate-next", {
          body: { session_id: sessionId, choice_id: choiceId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        await loadCurrentScene();
      }
    } catch (err: any) {
      toast.error(err.message || "다음 장면 이동에 실패했습니다.");
    } finally {
      setChoosing(false);
    }
  };

  const startAdTimer = () => {
    setAdTimer(5);
    const interval = setInterval(() => {
      setAdTimer((t) => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const handleAdDismiss = async () => {
    await supabase.functions.invoke("mark-ad-shown", {
      body: { session_id: sessionId },
    });
    setShowAd(false);
    setSession((s: any) => s ? { ...s, ad_shown: true } : s);
  };

  const attitudeColors: Record<string, string> = {
    positive: "border-green-500/30 hover:border-green-500/60 hover:bg-green-500/5",
    negative: "border-red-500/30 hover:border-red-500/60 hover:bg-red-500/5",
    avoidance: "border-yellow-500/30 hover:border-yellow-500/60 hover:bg-yellow-500/5",
    neutral: "border-border hover:border-primary hover:bg-primary/10",
  };

  const attitudeIcons: Record<string, string> = {
    positive: "⚔️",
    negative: "🛡️",
    avoidance: "🚪",
    neutral: "🤔",
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">장면을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (session?.finished) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto max-w-3xl px-4 pt-24 text-center">
          <h1 className="font-display text-3xl font-bold text-primary">🎬 이야기가 끝났습니다</h1>
          {node && (
            <div className="mt-8 space-y-6">
              {node.image_url && (
                <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-lg">
                  <img src={node.image_url} alt="엔딩 삽화" className="h-full w-full object-cover" />
                </AspectRatio>
              )}
              <div className="rounded-xl border border-border bg-card p-8">
                <p className="whitespace-pre-wrap text-left leading-[1.9] text-foreground text-[15px]">{node.scene_text}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalSteps = session?.duration_min === 10 ? 7 : session?.duration_min === 20 ? 13 : 19;

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Ad overlay */}
      {showAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md">
          <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-lg font-bold text-foreground">광고</p>
            <div className="my-8 flex h-40 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              광고 영역
            </div>
            <Button onClick={handleAdDismiss} disabled={adTimer > 0} className="w-full">
              {adTimer > 0 ? `${adTimer}초 후 계속하기` : "계속하기"}
            </Button>
          </div>
        </div>
      )}

      <div className="container mx-auto max-w-3xl px-4 pt-24 pb-16">
        {/* Progress */}
        {session && (
          <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
            <span>장면 {(session.step || 0) + 1}</span>
            <div className="h-1.5 flex-1 mx-4 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, ((session.step || 0) / (totalSteps - 1)) * 100)}%` }}
              />
            </div>
            <button
              onClick={() => {
                const next = !motionComic;
                setMotionComic(next);
                localStorage.setItem("motion-comic", String(next));
              }}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                motionComic ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              title={motionComic ? "Motion Comic OFF" : "Motion Comic ON"}
            >
              <Film className="h-3.5 w-3.5" />
              MC
            </button>
            <span className="ml-2">{session.duration_min}분</span>
          </div>
        )}

        {/* Scene */}
        {node && (
          <div className="space-y-6 opacity-0 animate-fade-in">
            {/* Image */}
            {node.image_url ? (
              motionComic ? (
                <MotionComic
                  imageUrl={node.image_url}
                  genre={(session?.state as any)?.genre || "sf"}
                  step={node.step}
                />
              ) : (
                <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-lg">
                  <img src={node.image_url} alt={`장면 ${node.step + 1} 삽화`} className="h-full w-full object-cover" />
                </AspectRatio>
              )
            ) : imageLoading ? (
              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-lg bg-secondary">
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <div className="flex items-center gap-1.5 text-xs">
                    <ImageIcon className="h-3.5 w-3.5" />
                    삽화 생성 중...
                  </div>
                </div>
              </AspectRatio>
            ) : null}

            {/* Scene Text */}
            <div className={`rounded-xl border border-border bg-card p-6 md:p-8 ${motionComic ? "motion-comic-text-reveal" : ""}`}>
              <p className="whitespace-pre-wrap leading-[1.9] text-foreground text-[15px]">
                {node.scene_text}
              </p>
            </div>

            {/* Choices */}
            {node.choices && node.choices.length > 0 && (
              <div className={`space-y-3 ${motionComic ? "motion-comic-text-reveal-delay" : ""}`}>
                {node.choices.map((choice, i) => {
                  const colorClass = attitudeColors[choice.attitude] || attitudeColors.neutral;
                  const icon = attitudeIcons[choice.attitude] || "🤔";
                  return (
                    <button
                      key={choice.id}
                      disabled={choosing}
                      onClick={() => handleChoice(choice.id)}
                      className={`w-full flex items-start gap-4 rounded-xl border bg-secondary/50 p-5 text-left text-sm transition-all duration-200 disabled:opacity-50 opacity-0 animate-fade-in ${colorClass}`}
                      style={{ animationDelay: `${300 + i * 100}ms` }}
                    >
                      <span className="mt-0.5 text-lg">{icon}</span>
                      <span className="flex-1 leading-relaxed text-foreground">{choice.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {choosing && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm">다음 장면으로 이동 중...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
