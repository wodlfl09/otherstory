import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  requiredPlan: string;
}

export default function UpgradeModal({ open, onOpenChange, feature, requiredPlan }: UpgradeModalProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display">업그레이드 필요</DialogTitle>
          <DialogDescription>
            <strong className="text-primary">{feature}</strong> 기능은{" "}
            <strong className="uppercase text-accent">{requiredPlan}</strong> 플랜 이상에서 사용 가능합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            닫기
          </Button>
          <Button onClick={() => { onOpenChange(false); navigate("/billing"); }} className="flex-1">
            플랜 보기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
