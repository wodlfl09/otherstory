import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

interface NovelNode {
  step: number;
  scene_text: string;
  image_url: string | null;
}

interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export default function NovelReader() {
  const { novelId } = useParams<{ novelId: string }>();
  const { user } = useAuth();
  const [novel, setNovel] = useState<any>(null);
  const [nodes, setNodes] = useState<NovelNode[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentBody, setCommentBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!novelId) return;
    loadNovel();
    loadComments();
    checkLiked();
  }, [novelId]);

  const loadNovel = async () => {
    const { data } = await supabase
      .from("public_novels")
      .select("*")
      .eq("id", novelId)
      .single();
    if (data) {
      setNovel(data);
      setLikeCount(data.like_count || 0);

      // Load all nodes for this session
      const { data: nodeData } = await supabase
        .from("story_nodes")
        .select("step, scene_text, image_url")
        .eq("session_id", data.session_id)
        .order("step", { ascending: true });
      setNodes(nodeData || []);
    }
    setLoading(false);
  };

  const loadComments = async () => {
    if (!novelId) return;
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("target_type", "novel")
      .eq("target_id", novelId)
      .order("created_at", { ascending: true });
    setComments(data || []);
  };

  const checkLiked = async () => {
    if (!user || !novelId) return;
    const { data } = await supabase
      .from("likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", "novel")
      .eq("target_id", novelId)
      .maybeSingle();
    setLiked(!!data);
  };

  const toggleLike = async () => {
    if (!user || !novelId) return;
    try {
      const { data } = await supabase.functions.invoke("toggle-like", {
        body: { target_type: "novel", target_id: novelId },
      });
      if (data?.liked !== undefined) {
        setLiked(data.liked);
        setLikeCount((c) => data.liked ? c + 1 : c - 1);
      }
    } catch { toast.error("좋아요 처리 실패"); }
  };

  const submitComment = async () => {
    if (!user || !novelId || !commentBody.trim()) return;
    const { error } = await supabase.from("comments").insert({
      user_id: user.id,
      target_type: "novel",
      target_id: novelId,
      body: commentBody.trim(),
    });
    if (!error) {
      setCommentBody("");
      loadComments();
    }
  };

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
        {/* Header */}
        {novel && (
          <div className="mb-8">
            {novel.cover_url && (
              <AspectRatio ratio={16 / 9} className="mb-6 overflow-hidden rounded-xl border border-border">
                <img src={novel.cover_url} alt={novel.title} className="h-full w-full object-cover" />
              </AspectRatio>
            )}
            <h1 className="font-display text-2xl font-bold text-foreground">{novel.title}</h1>
            {novel.synopsis && <p className="mt-2 text-muted-foreground">{novel.synopsis}</p>}
            <div className="mt-4 flex items-center gap-4">
              <Button
                variant={liked ? "default" : "outline"}
                size="sm"
                onClick={toggleLike}
                className="gap-2"
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
                {likeCount}
              </Button>
              <span className="text-sm text-muted-foreground">{novel.view_count} 조회</span>
            </div>
          </div>
        )}

        {/* All scenes */}
        <div className="space-y-8">
          {nodes.map((node) => (
            <div key={node.step} className="space-y-4">
              {node.image_url && (
                <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border">
                  <img src={node.image_url} alt={`장면 ${node.step + 1}`} className="h-full w-full object-cover" />
                </AspectRatio>
              )}
              <div className="rounded-xl border border-border bg-card p-6 md:p-8">
                <p className="whitespace-pre-wrap leading-[2] text-foreground text-[15px] tracking-wide">
                  {node.scene_text}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Comments */}
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />댓글 ({comments.length})
          </h2>

          {user && (
            <div className="mb-6 flex gap-2">
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="댓글을 입력하세요..."
                rows={2}
                className="bg-secondary flex-1"
              />
              <Button size="icon" onClick={submitComment} disabled={!commentBody.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-foreground">{c.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("ko-KR")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
