import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { BookOpen, Trash2, RotateCcw, Share2 } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toast } from "sonner";

interface LibraryEntry {
  id: string;
  pinned: boolean;
  created_at: string;
  story: {
    id: string;
    title: string;
    genre: string;
    cover_url: string | null;
    protagonist_name: string | null;
    created_at: string;
  };
}

export default function Library() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const maxItems = profile?.plan === "pro" ? Infinity : profile?.plan === "basic" ? 9 : 3;

  useEffect(() => {
    if (!user) return;
    loadLibrary();
  }, [user]);

  const loadLibrary = async () => {
    const { data } = await supabase
      .from("library_items")
      .select("id, pinned, created_at, story:stories(id, title, genre, cover_url, protagonist_name, created_at)")
      .eq("user_id", user!.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    setItems((data as any) || []);
    setLoading(false);
  };

  const removeItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await supabase.from("library_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("삭제되었습니다.");
  };

  const handleReplay = async (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
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
      toast.error(err.message || "재진행 실패");
    }
  };

  const handlePublishGame = async (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
    try {
      const { data, error } = await supabase.functions.invoke("publish-content", {
        body: { type: "game", story_id: storyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("게임이 공개되었습니다!");
    } catch (err: any) {
      toast.error(err.message || "공개 실패");
    }
  };

  // Try to get cover from first scene if story has no cover
  const getCoverUrl = async (storyId: string): Promise<string | null> => {
    const { data: sessions } = await supabase
      .from("story_sessions")
      .select("id")
      .eq("story_id", storyId)
      .limit(1);
    if (!sessions?.length) return null;
    const { data: nodes } = await supabase
      .from("story_nodes")
      .select("image_url")
      .eq("session_id", sessions[0].id)
      .eq("step", 0)
      .limit(1);
    return nodes?.[0]?.image_url || null;
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">내 스토리 라이브러리</h1>
          <span className="text-sm text-muted-foreground">
            {items.length} / {maxItems === Infinity ? "∞" : maxItems}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12" />
            <p>아직 저장된 스토리가 없습니다.</p>
            <Button onClick={() => navigate("/home")}>새 스토리 시작하기</Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => navigate(`/story/${item.story?.id}`)}
                className="card-glow cursor-pointer rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/50"
              >
                <AspectRatio ratio={16 / 9}>
                  {item.story?.cover_url ? (
                    <img src={item.story.cover_url} alt={item.story.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-secondary flex items-center justify-center">
                      <BookOpen className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </AspectRatio>
                <div className="p-4">
                  <h3 className="font-medium text-foreground line-clamp-1">{item.story?.title || "제목 없음"}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize">{item.story?.genre}</span>
                    {item.story?.protagonist_name && (
                      <>
                        <span className="text-border">·</span>
                        <span className="text-xs text-muted-foreground">{item.story.protagonist_name}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={(e) => handleReplay(e, item.story?.id)} className="gap-1 text-xs">
                      <RotateCcw className="h-3.5 w-3.5" />재진행
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => handlePublishGame(e, item.story?.id)} className="gap-1 text-xs">
                      <Share2 className="h-3.5 w-3.5" />공개
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => removeItem(e, item.id)} className="ml-auto text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
