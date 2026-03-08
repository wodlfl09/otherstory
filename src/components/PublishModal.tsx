import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Loader2, Globe, BookOpen } from "lucide-react";

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "game" | "novel";
  storyId: string;
  sessionId?: string;
  defaults?: {
    title?: string;
    synopsis?: string;
    coverUrl?: string;
    protagonistName?: string;
  };
}

export default function PublishModal({
  open, onOpenChange, mode, storyId, sessionId, defaults,
}: PublishModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(defaults?.title || "");
  const [synopsis, setSynopsis] = useState(defaults?.synopsis || "");
  const [coverUrl, setCoverUrl] = useState(defaults?.coverUrl || "");
  const [protagonistName, setProtagonistName] = useState(defaults?.protagonistName || "");

  // Reset form when defaults change
  const handleOpenChange = (val: boolean) => {
    if (val) {
      setTitle(defaults?.title || "");
      setSynopsis(defaults?.synopsis || "");
      setCoverUrl(defaults?.coverUrl || "");
      setProtagonistName(defaults?.protagonistName || "");
    }
    onOpenChange(val);
  };

  const handlePublish = async () => {
    setLoading(true);
    try {
      const body: Record<string, any> = {
        type: mode,
        synopsis: synopsis.trim() || undefined,
        cover_url: coverUrl.trim() || undefined,
      };

      if (mode === "game") {
        body.story_id = storyId;
        body.protagonist_name = protagonistName.trim() || undefined;
      } else {
        body.session_id = sessionId;
        body.title = title.trim() || undefined;
      }

      const { data, error } = await supabase.functions.invoke("publish-content", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(mode === "game" ? "게임이 공개되었습니다!" : "소설이 공개되었습니다!");
      onOpenChange(false);
      navigate(`/explore`);
    } catch (err: any) {
      toast.error(err.message || "공개에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {mode === "game" ? <Globe className="h-5 w-5 text-primary" /> : <BookOpen className="h-5 w-5 text-primary" />}
            {mode === "game" ? "게임 공개" : "소설 공개"}
          </DialogTitle>
          <DialogDescription>
            {mode === "game"
              ? "다른 유저가 이 게임을 플레이할 수 있게 됩니다."
              : "완주한 이야기를 소설로 공개합니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {mode === "novel" && (
            <div className="space-y-2">
              <Label htmlFor="pub-title">제목</Label>
              <Input
                id="pub-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="소설 제목"
                className="bg-secondary"
              />
            </div>
          )}

          {mode === "game" && (
            <div className="space-y-2">
              <Label htmlFor="pub-protagonist">주인공 이름</Label>
              <Input
                id="pub-protagonist"
                value={protagonistName}
                onChange={(e) => setProtagonistName(e.target.value)}
                placeholder="예: 김도윤"
                className="bg-secondary"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pub-synopsis">줄거리 (맛보기)</Label>
            <Textarea
              id="pub-synopsis"
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="이 이야기는..."
              rows={3}
              className="bg-secondary resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pub-cover">커버 이미지 URL (선택)</Label>
            <Input
              id="pub-cover"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="비워두면 자동으로 채워집니다"
              className="bg-secondary"
            />
            <p className="text-[11px] text-muted-foreground">비워두면 첫 장면 이미지를 자동 사용합니다.</p>
          </div>

          <Button onClick={handlePublish} disabled={loading} className="w-full gap-2" size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            공개하기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
