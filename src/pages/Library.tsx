import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { BookOpen, Trash2, RotateCcw, Share2, Loader2 } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toast } from "sonner";
import PublishModal from "@/components/PublishModal";

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
    synopsis: string | null;
    created_at: string;
  };
  fallbackCover?: string | null;
}

const GENRE_LABELS: Record<string, string> = {
  sf: "SF", fantasy: "판타지", mystery: "추리", action: "액션",
  horror: "공포", romance: "로맨스", comic: "코믹", martial: "무협",
};

export default function Library() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<{ storyId: string; title: string; synopsis: string; coverUrl: string; protagonistName: string } | null>(null);

  const maxItems = profile?.plan === "pro" ? Infinity : profile?.plan === "basic" ? 9 : 3;

  useEffect(() => {
    if (!user) return;
    loadLibrary();
  }, [user]);

  const loadLibrary = async () => {
    const { data } = await supabase
      .from("library_items")
      .select("id, pinned, created_at, story:stories(id, title, genre, cover_url, protagonist_name, synopsis, created_at)")
      .eq("user_id", user!.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    const entries = ((data as any) || []) as LibraryEntry[];

    // For items without cover_url, try to fetch scene1 image
    const needsCover = entries.filter((e) => !e.story?.cover_url);
    if (needsCover.length > 0) {
      const storyIds = needsCover.map((e) => e.story?.id).filter(Boolean);
      // Get first session per story
      const { data: sessions } = await supabase
        .from("story_sessions")
        .select("id, story_id")
        .in("story_id", storyIds)
        .order("created_at", { ascending: false });

      if (sessions && sessions.length > 0) {
        // Get one session per story
        const sessionMap: Record<string, string> = {};
        sessions.forEach((s) => {
          if (!sessionMap[s.story_id]) sessionMap[s.story_id] = s.id;
        });

        const sessionIds = Object.values(sessionMap);
        const { data: nodes } = await supabase
          .from("story_nodes")
          .select("session_id, image_url")
          .in("session_id", sessionIds)
          .eq("step", 0);

        const coverMap: Record<string, string> = {};
        nodes?.forEach((n) => {
          if (n.image_url) {
            // Find story_id for this session
            const sid = Object.entries(sessionMap).find(([, v]) => v === n.session_id)?.[0];
            if (sid) coverMap[sid] = n.image_url;
          }
        });

        entries.forEach((e) => {
          if (!e.story?.cover_url && e.story?.id && coverMap[e.story.id]) {
            e.fallbackCover = coverMap[e.story.id];
          }
        });
      }
    }

    setItems(entries);
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
    setReplayingId(storyId);
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
    } finally {
      setReplayingId(null);
    }
  };

  const openPublishModal = (e: React.MouseEvent, item: LibraryEntry) => {
    e.stopPropagation();
    setPublishTarget({
      storyId: item.story?.id,
      title: item.story?.title || "",
      synopsis: item.story?.synopsis || "",
      coverUrl: item.story?.cover_url || item.fallbackCover || "",
      protagonistName: item.story?.protagonist_name || "",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">내 스토리 라이브러리</h1>
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
            {items.map((item) => {
              const cover = item.story?.cover_url || item.fallbackCover;
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(`/story/${item.story?.id}`)}
                  className="group cursor-pointer rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-[var(--shadow-glow)]"
                >
                  <AspectRatio ratio={16 / 9}>
                    {cover ? (
                      <img src={cover} alt={item.story?.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="h-full w-full bg-secondary flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </AspectRatio>
                  <div className="p-4">
                    <h3 className="font-medium text-foreground line-clamp-1">{item.story?.title || "제목 없음"}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {GENRE_LABELS[item.story?.genre] || item.story?.genre}
                      </Badge>
                      {item.story?.protagonist_name && (
                        <span className="text-xs text-muted-foreground">{item.story.protagonist_name}</span>
                      )}
                    </div>
                    {item.story?.synopsis && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{item.story.synopsis}</p>
                    )}
                    <div className="mt-3 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleReplay(e, item.story?.id)}
                        disabled={replayingId === item.story?.id}
                        className="gap-1 text-xs"
                      >
                        {replayingId === item.story?.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        재진행
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => openPublishModal(e, item)} className="gap-1 text-xs">
                        <Share2 className="h-3.5 w-3.5" />공개
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => removeItem(e, item.id)} className="ml-auto text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
