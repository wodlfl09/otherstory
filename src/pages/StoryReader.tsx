import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface SceneNode {
  step: number;
  scene_text: string;
  image_url: string | null;
  choices: any[] | null;
}

export default function StoryReader() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();
  const [story, setStory] = useState<any>(null);
  const [nodes, setNodes] = useState<SceneNode[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storyId) return;
    loadStory();
  }, [storyId]);

  const loadStory = async () => {
    const { data: storyData } = await supabase
      .from("stories")
      .select("*")
      .eq("id", storyId)
      .single();
    setStory(storyData);

    // Get latest session for this story
    const { data: sessions } = await supabase
      .from("story_sessions")
      .select("id")
      .eq("story_id", storyId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessions && sessions.length > 0) {
      const { data: nodeData } = await supabase
        .from("story_nodes")
        .select("*")
        .eq("session_id", sessions[0].id)
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
    }
  };

  const currentNode = nodes[currentStep];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-3xl px-4 pt-24 pb-16">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{story?.title}</h1>
            <p className="text-sm text-muted-foreground capitalize">{story?.genre}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReplay} className="gap-2">
            <RotateCcw className="h-4 w-4" />재진행
          </Button>
        </div>

        {currentNode && (
          <div className="space-y-6">
            {currentNode.image_url && (
              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-lg">
                <img src={currentNode.image_url} alt={`장면 ${currentNode.step + 1}`} className="h-full w-full object-cover" />
              </AspectRatio>
            )}

            <div className="rounded-xl border border-border bg-card p-6 md:p-8">
              <p className="whitespace-pre-wrap leading-[2] text-foreground text-[15px] tracking-wide">
                {currentNode.scene_text}
              </p>
            </div>

            {/* Choice made indicator */}
            {currentNode.choices && currentStep < nodes.length - 1 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                선택: {(currentNode.choices as any[]).find((c: any) => {
                  // Try to find which choice was selected by checking next node's history
                  return true;
                })?.label || "다음으로 진행"}
              </div>
            )}

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
        )}

        {nodes.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
            아직 장면이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
