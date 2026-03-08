import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { RotateCcw, ChevronLeft, ChevronRight, BookOpen, Loader2, Globe } from "lucide-react";
import PublishModal from "@/components/PublishModal";

interface SceneNode {
  step: number;
  scene_text: string;
  image_url: string | null;
  choices: any[] | null;
}

const GENRE_LABELS: Record<string, string> = {
  sf: "SF", fantasy: "판타지", mystery: "추리", action: "액션",
  horror: "공포", romance: "로맨스", comic: "코믹", martial: "무협",
};

export default function StoryReader() {
  const { storyId } = useParams<{ storyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [story, setStory] = useState<any>(null);
  const [nodes, setNodes] = useState<SceneNode[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [replayLoading, setReplayLoading] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isGamePublished, setIsGamePublished] = useState(false);
  const [isNovelPublished, setIsNovelPublished] = useState(false);
  const [publishGameOpen, setPublishGameOpen] = useState(false);
  const [publishNovelOpen, setPublishNovelOpen] = useState(false);

  useEffect(() => {
    if (!storyId) return;
    loadStory();
  }, [storyId]);

  const loadStory = async () => {
    // Load story
    const { data: storyData } = await supabase
      .from("stories")
      .select("*")
      .eq("id", storyId)
      .single();
    setStory(storyData);

    // Prefer finished session, fallback to latest
    let loadedSessionId: string | null = null;
    const { data: finishedSessions } = await supabase
      .from("story_sessions")
      .select("id, finished")
      .eq("story_id", storyId!)
      .eq("finished", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (finishedSessions?.length) {
      loadedSessionId = finishedSessions[0].id;
      setSessionFinished(true);
    } else {
      const { data: latestSessions } = await supabase
        .from("story_sessions")
        .select("id, finished")
        .eq("story_id", storyId!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (latestSessions?.length) {
        loadedSessionId = latestSessions[0].id;
        setSessionFinished(latestSessions[0].finished);
      }
    }

    setSessionId(loadedSessionId);
    if (loadedSessionId) {
      const { data: nodeData } = await supabase
        .from("story_nodes")
        .select("*")
        .eq("session_id", loadedSessionId)
        .order("step", { ascending: true });

      if (nodeData) {
        setNodes(nodeData.map((n) => ({
          step: n.step,
          scene_text: n.scene_text,
          image_url: n.image_url,
          choices: n.choices as any,
        })));
      }
    }
    setLoading(false);
  };

  const handleReplay = async () => {
    if (!storyId) return;
    setReplayLoading(true);
    const idempotencyKey = crypto.randomUUID();
    try {
      const { data, error } = await supabase.functions.invoke("replay-story", {
        body: { story_id: storyId, idempotency_key: idempotencyKey },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.ad_required) {
        navigate(`/ad?type=replay&story_id=${storyId}&key=${idempotencyKey}`);
        return;
      }
      if (data?.session_id) navigate(`/game/${data.session_id}`);
    } catch (err: any) {
      toast.error(err.message || "재진행에 실패했습니다.");
    } finally {
      setReplayLoading(false);
    }
  };

  const currentNode = nodes[currentStep];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-3xl px-4 pt-24 pb-16">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-foreground">{story?.title}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{GENRE_LABELS[story?.genre] || story?.genre}</Badge>
              {story?.protagonist_name && (
                <span className="text-sm text-muted-foreground">{story.protagonist_name}</span>
              )}
              {sessionFinished && (
                <Badge className="bg-primary/20 text-primary border-primary/30">완주</Badge>
              )}
            </div>
            {story?.synopsis && (
              <p className="text-sm text-muted-foreground mt-2">{story.synopsis}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setPublishGameOpen(true)} className="gap-2">
              <Globe className="h-4 w-4" />게임 공개
            </Button>
            {sessionFinished && sessionId && (
              <Button variant="outline" size="sm" onClick={() => setPublishNovelOpen(true)} className="gap-2">
                <BookOpen className="h-4 w-4" />소설 공개
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleReplay} disabled={replayLoading} className="gap-2">
              {replayLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              재진행
            </Button>
          </div>
        </div>

        {/* Scene navigation sidebar + main content */}
        {nodes.length > 0 ? (
          <div className="flex flex-col md:flex-row gap-4">
            {/* Mobile scene selector */}
            <div className="md:hidden mb-4">
              <select
                value={currentStep}
                onChange={(e) => setCurrentStep(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
              >
                {nodes.map((node, i) => (
                  <option key={i} value={i}>
                    #{node.step + 1} — {node.scene_text.slice(0, 40)}...
                  </option>
                ))}
              </select>
            </div>

            {/* Scene list (sidebar - desktop) */}
            <div className="hidden md:block w-48 shrink-0">
              <p className="text-xs font-medium text-muted-foreground mb-2">장면 목록</p>
              <ScrollArea className="h-[calc(100vh-14rem)]">
                <div className="space-y-1 pr-2">
                  {nodes.map((node, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentStep(i)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-colors ${
                        i === currentStep
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <span className="font-medium">#{node.step + 1}</span>
                      <p className="line-clamp-2 mt-0.5">{node.scene_text.slice(0, 60)}...</p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Main reader */}
            <div className="flex-1 min-w-0 space-y-6">
              {currentNode?.image_url && (
                <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border">
                  <img src={currentNode.image_url} alt={`장면 ${currentNode.step + 1}`} className="h-full w-full object-cover" />
                </AspectRatio>
              )}

              <div className="rounded-xl border border-border bg-card p-6 md:p-8">
                <p className="whitespace-pre-wrap leading-[2] text-foreground text-[15px] tracking-wide font-body">
                  {currentNode?.scene_text}
                </p>
              </div>

              {/* Choices display */}
              {currentNode?.choices && Array.isArray(currentNode.choices) && currentNode.choices.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">선택지</p>
                  <div className="grid gap-2">
                    {(currentNode.choices as any[]).map((choice: any, ci: number) => (
                      <div
                        key={ci}
                        className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground"
                      >
                        <span className="text-primary font-medium mr-2">{ci + 1}.</span>
                        {choice.label || choice.text || `선택지 ${ci + 1}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentStep === 0}
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />이전
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentStep + 1} / {nodes.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentStep >= nodes.length - 1}
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="gap-2"
                >
                  다음<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-4">
            <BookOpen className="h-12 w-12" />
            <p>아직 장면이 없습니다.</p>
            <Button onClick={handleReplay} disabled={replayLoading} className="gap-2">
              {replayLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              새로 시작하기
            </Button>
          </div>
        )}
      </div>

      {/* Publish Modals */}
      {storyId && (
        <PublishModal
          open={publishGameOpen}
          onOpenChange={setPublishGameOpen}
          mode="game"
          storyId={storyId}
          defaults={{
            title: story?.title,
            synopsis: story?.synopsis,
            coverUrl: story?.cover_url,
            protagonistName: story?.protagonist_name,
          }}
        />
      )}
      {storyId && sessionId && (
        <PublishModal
          open={publishNovelOpen}
          onOpenChange={setPublishNovelOpen}
          mode="novel"
          storyId={storyId}
          sessionId={sessionId}
          defaults={{
            title: story?.title,
            synopsis: story?.synopsis,
            coverUrl: story?.cover_url,
          }}
        />
      )}
    </div>
  );
}
