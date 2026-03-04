import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toast } from "sonner";

interface Choice {
  id: string;
  label: string;
  attitude: string;
}

interface StoryNode {
  step: number;
  scene_text: string;
  image_url: string | null;
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
        step: n.step,
        scene_text: n.scene_text,
        image_url: n.image_url,
        choices: Array.isArray(choices) ? (choices as Choice[]) : null,
      });
    }
    setLoading(false);
  };

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
      const { data, error } = await supabase.functions.invoke("choose-and-generate-next", {
        body: { session_id: sessionId, choice_id: choiceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await loadCurrentScene();
    } catch (err: any) {
      toast.error(err.message || "다음 장면 생성에 실패했습니다.");
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
                style={{
                  width: `${Math.min(100, ((session.step || 0) / (session.duration_min === 10 ? 7 : session.duration_min === 20 ? 13 : 19)) * 100)}%`,
                }}
              />
            </div>
            <span>{session.duration_min}분</span>
          </div>
        )}

        {/* Scene */}
        {node && (
          <div className="space-y-6 opacity-0 animate-fade-in">
            {/* 16:9 Scene Image */}
            {node.image_url && (
              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-lg">
                <img
                  src={node.image_url}
                  alt={`장면 ${node.step + 1} 삽화`}
                  className="h-full w-full object-cover"
                />
              </AspectRatio>
            )}

            {/* Scene Text */}
            <div className="rounded-xl border border-border bg-card p-6 md:p-8">
              <p className="whitespace-pre-wrap leading-[1.9] text-foreground text-[15px]">
                {node.scene_text}
              </p>
            </div>

            {/* Choices */}
            {node.choices && node.choices.length > 0 && (
              <div className="space-y-3">
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
                <p className="text-sm">다음 장면을 생성하는 중...</p>
                <p className="text-xs text-muted-foreground/60">AI가 삽화와 텍스트를 만들고 있습니다</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
