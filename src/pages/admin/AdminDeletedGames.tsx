import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

interface DeletedStory {
  id: string;
  title: string;
  genre: string;
  protagonist_name: string | null;
  deleted_at: string;
  user_id: string;
  created_at: string;
}

export default function AdminDeletedGames() {
  const [stories, setStories] = useState<DeletedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    loadDeleted();
  }, []);

  const loadDeleted = async () => {
    const { data, error } = await supabase.functions.invoke("admin-manage", {
      body: { action: "list_deleted_games" },
    });
    if (error) {
      toast.error("삭제된 게임 목록을 불러오지 못했습니다.");
    } else {
      setStories(data?.stories || []);
    }
    setLoading(false);
  };

  const handleRestore = async (storyId: string) => {
    setRestoringId(storyId);
    try {
      const { error } = await supabase.functions.invoke("admin-manage", {
        body: { action: "restore_game", story_id: storyId },
      });
      if (error) throw error;
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      toast.success("게임이 복구되었습니다.");
    } catch {
      toast.error("복구 실패");
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">삭제된 게임 ({stories.length})</h2>
      {stories.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">삭제된 게임이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {stories.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{s.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">{s.genre}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    삭제: {new Date(s.deleted_at).toLocaleDateString("ko-KR")}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                    {s.user_id.slice(0, 8)}...
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(s.id)}
                disabled={restoringId === s.id}
                className="gap-1 shrink-0"
              >
                {restoringId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                복구
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
