import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeleteGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

export default function DeleteGameDialog({ open, onOpenChange, onConfirm, loading }: DeleteGameDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const isValid = confirmText.trim() === "동의합니다.";

  const handleConfirm = async () => {
    if (!isValid) return;
    await onConfirm();
    setConfirmText("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setConfirmText(""); onOpenChange(v); }}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">게임을 정말 삭제하시겠습니까?</DialogTitle>
          <DialogDescription>
            한번 삭제한 게임은 복구할 수 없습니다. 삭제를 원하시면 아래에 <strong className="text-foreground">'동의합니다.'</strong>라고 적어주세요.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="동의합니다."
          className="mt-2"
          autoFocus
        />
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
            취소
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={!isValid || loading}
            onClick={handleConfirm}
          >
            {loading ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
