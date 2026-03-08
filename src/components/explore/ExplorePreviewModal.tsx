import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Heart, Play, BookOpen, Eye, MessageCircle, Send, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string;
}

interface PreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "game" | "novel";
  id: string;
  title: string;
  genre?: string;
  coverUrl?: string | null;
  synopsis?: string | null;
  protagonistName?: string | null;
  likeCount: number;
  playOrViewCount: number;
  creatorId?: string;
  onLikeToggled?: () => void;
}

const GENRE_LABELS: Record<string, string> = {
  sf: "SF", fantasy: "판타지", mystery: "추리", action: "액션",
  horror: "공포", romance: "로맨스", comic: "코믹", martial: "무협",
};

export default function ExplorePreviewModal({
  open, onOpenChange, type, id, title, genre, coverUrl, synopsis,
  protagonistName, likeCount, playOrViewCount, creatorId, onLikeToggled,
}: PreviewModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);

  const loadLikeStatus = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", type)
      .eq("target_id", id)
      .maybeSingle();
    setLiked(!!data);
  }, [user, type, id]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-comment", {
        body: { action: "list", target_type: type, target_id: id },
      });
      if (error) throw error;
      setComments(data?.comments || []);
    } catch { /* ignore */ }
    setCommentsLoading(false);
  }, [type, id]);

  useEffect(() => {
    if (open) {
      loadLikeStatus();
      loadComments();
    }
  }, [open, loadLikeStatus, loadComments]);

  const handleToggleLike = async () => {
    if (!user) { navigate("/auth"); return; }
    setLikeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("toggle-like", {
        body: { target_type: type, target_id: id },
      });
      if (error) throw error;
      setLiked(data?.liked ?? !liked);
      onLikeToggled?.();
    } catch (err: any) {
      toast.error(err.message || "좋아요 처리 실패");
    }
    setLikeLoading(false);
  };

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    try {
      const { error } = await supabase.functions.invoke("add-comment", {
        body: { action: "add", target_type: type, target_id: id, body: commentBody.trim() },
      });
      if (error) throw error;
      setCommentBody("");
      loadComments();
    } catch (err: any) {
      toast.error(err.message || "댓글 작성 실패");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await supabase.functions.invoke("add-comment", {
        body: { action: "delete", comment_id: commentId },
      });
      loadComments();
    } catch { /* ignore */ }
  };

  const handleAction = async () => {
    if (!user) { navigate("/auth"); return; }
    setActionLoading(true);
    const idempotencyKey = crypto.randomUUID();
    try {
      if (type === "game") {
        const { data, error } = await supabase.functions.invoke("play-public-game", {
          body: { story_id: id, idempotency_key: idempotencyKey },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.session_id) {
          onOpenChange(false);
          navigate(`/game/${data.session_id}`);
        }
      } else {
        const { data, error } = await supabase.functions.invoke("read-public-novel", {
          body: { novel_id: id, idempotency_key: idempotencyKey },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        onOpenChange(false);
        navigate(`/novel/${id}`);
      }
    } catch (err: any) {
      toast.error(err.message || "처리에 실패했습니다.");
    }
    setActionLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden bg-card border-border">
        {/* Cover */}
        <AspectRatio ratio={16 / 9}>
          {coverUrl ? (
            <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-secondary flex items-center justify-center">
              {type === "game" ? <Play className="h-12 w-12 text-muted-foreground" /> : <BookOpen className="h-12 w-12 text-muted-foreground" />}
            </div>
          )}
        </AspectRatio>

        <div className="p-5 space-y-4">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg font-bold text-foreground flex-1">{title}</DialogTitle>
              {genre && <Badge variant="outline">{GENRE_LABELS[genre] || genre}</Badge>}
            </div>
            {protagonistName && <p className="text-sm text-muted-foreground">주인공: {protagonistName}</p>}
          </DialogHeader>

          {synopsis && <p className="text-sm text-muted-foreground leading-relaxed">{synopsis}</p>}

          {/* Stats + Like */}
          <div className="flex items-center gap-4">
            <Button
              size="sm"
              variant={liked ? "default" : "outline"}
              onClick={handleToggleLike}
              disabled={likeLoading}
              className="gap-1.5"
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
              {likeCount + (liked ? 1 : 0)}
            </Button>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              {type === "game" ? <Play className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {playOrViewCount}
            </span>
          </div>

          {/* Action Button */}
          <Button onClick={handleAction} disabled={actionLoading} className="w-full gap-2" size="lg">
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : type === "game" ? <Play className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
            {type === "game" ? "게임 시작 (10💎)" : "소설 보기 (10💎)"}
          </Button>

          <Separator />

          {/* Comments */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" />댓글 ({comments.length})
            </h4>
            <ScrollArea className="max-h-48">
              {commentsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">아직 댓글이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{c.display_name}</span>
                        <p className="text-muted-foreground break-words">{c.body}</p>
                      </div>
                      {user?.id === c.user_id && (
                        <button onClick={() => handleDeleteComment(c.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                placeholder="댓글을 입력하세요..."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                className="bg-secondary text-sm"
              />
              <Button size="icon" variant="ghost" onClick={handleAddComment} disabled={!commentBody.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
