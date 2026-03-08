import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Twitter, Copy, Download, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface Tendency {
  key: string;
  label: string;
  icon: string;
  pct: number;
}

interface ShareCardProps {
  storyTitle: string;
  endingMessage: string;
  dominantIcon: string;
  dominantLabel: string;
  stats: { choices: number; scenes: number; elapsed: string };
  tendencies: Tendency[];
  imageUrl?: string | null;
}

const BAR_COLORS: Record<string, string> = {
  positive: "#22c55e",
  negative: "#ef4444",
  avoidance: "#eab308",
  neutral: "#a855f7",
};

export default function ShareCard({
  storyTitle, endingMessage, dominantIcon, dominantLabel,
  stats, tendencies, imageUrl,
}: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const generateImage = useCallback(async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const W = 1080, H = 1350;
    canvas.width = W;
    canvas.height = H;

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0a0a0f");
    grad.addColorStop(1, "#1a1025");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Load and draw scene image if available
    let imgY = 80;
    if (imageUrl) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = imageUrl;
        });
        const imgW = W - 80;
        const imgH = imgW * (9 / 16);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(40, imgY, imgW, imgH, 16);
        ctx.clip();
        ctx.drawImage(img, 40, imgY, imgW, imgH);
        ctx.restore();
        // Dark overlay for text readability
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(40, imgY, imgW, imgH, 16);
        ctx.clip();
        const overlay = ctx.createLinearGradient(0, imgY, 0, imgY + imgH);
        overlay.addColorStop(0.5, "rgba(0,0,0,0)");
        overlay.addColorStop(1, "rgba(0,0,0,0.7)");
        ctx.fillStyle = overlay;
        ctx.fillRect(40, imgY, imgW, imgH);
        ctx.restore();
        imgY += imgH + 40;
      } catch {
        imgY = 80;
      }
    }

    // 🎬 END
    ctx.textAlign = "center";
    ctx.font = "bold 56px sans-serif";
    ctx.fillStyle = "#a855f7";
    ctx.fillText("🎬 END", W / 2, imgY + 20);

    // Story title
    ctx.font = "bold 32px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(storyTitle.slice(0, 30), W / 2, imgY + 70);

    // Ending message
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#a0a0b0";
    const words = endingMessage.split("");
    let line = "";
    let lineY = imgY + 110;
    for (const char of words) {
      const test = line + char;
      if (ctx.measureText(test).width > W - 120) {
        ctx.fillText(line, W / 2, lineY);
        line = char;
        lineY += 28;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, W / 2, lineY);
    lineY += 50;

    // Stats row
    const statsData = [
      { val: String(stats.choices), label: "총 선택" },
      { val: String(stats.scenes), label: "총 장면" },
      { val: stats.elapsed, label: "소요 시간" },
    ];
    const statW = (W - 120) / 3;
    statsData.forEach((s, i) => {
      const x = 60 + statW * i + statW / 2;
      ctx.font = "bold 40px sans-serif";
      ctx.fillStyle = "#a855f7";
      ctx.fillText(s.val, x, lineY + 10);
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#808090";
      ctx.fillText(s.label, x, lineY + 36);
    });
    lineY += 70;

    // Tendency bars
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(`플레이 성향: ${dominantIcon} ${dominantLabel}`, 60, lineY);
    lineY += 40;

    tendencies.forEach((t) => {
      ctx.font = "18px sans-serif";
      ctx.fillStyle = "#a0a0b0";
      ctx.textAlign = "left";
      ctx.fillText(`${t.icon} ${t.label}`, 60, lineY + 2);

      // Bar bg
      const barX = 240, barW = W - 380, barH = 16;
      ctx.fillStyle = "#2a2a35";
      ctx.beginPath();
      ctx.roundRect(barX, lineY - 12, barW, barH, 8);
      ctx.fill();

      // Bar fill
      ctx.fillStyle = BAR_COLORS[t.key] || "#a855f7";
      ctx.beginPath();
      ctx.roundRect(barX, lineY - 12, barW * (t.pct / 100), barH, 8);
      ctx.fill();

      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(`${t.pct}%`, W - 60, lineY + 2);

      lineY += 38;
    });

    // Watermark
    ctx.textAlign = "center";
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#505060";
    ctx.fillText("토리게임 — 선택형 시네마 스토리 게임", W / 2, H - 40);

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }, [storyTitle, endingMessage, dominantIcon, dominantLabel, stats, tendencies, imageUrl]);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await generateImage();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tori-game-result.png";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("이미지가 저장되었습니다!");
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async (platform?: "twitter" | "kakao") => {
    setGenerating(true);
    try {
      const blob = await generateImage();
      const shareText = `🎬 ${storyTitle} 클리어!\n${dominantIcon} 성향: ${dominantLabel}\n${endingMessage}\n\n#토리게임 #선택형스토리`;

      if (platform === "twitter") {
        const encoded = encodeURIComponent(shareText);
        window.open(`https://twitter.com/intent/tweet?text=${encoded}`, "_blank");
        return;
      }

      if (platform === "kakao") {
        const kakaoText = `🎬 ${storyTitle} 클리어!\n${dominantIcon} 성향: ${dominantLabel}\n${endingMessage}`;
        const encoded = encodeURIComponent(kakaoText);
        window.open(`https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(window.location.href)}&text=${encoded}`, "_blank");
        return;
      }

      // Native share with image
      if (blob && navigator.share && navigator.canShare) {
        const file = new File([blob], "tori-game-result.png", { type: "image/png" });
        const shareData = { text: shareText, files: [file] };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }

      // Fallback: copy text
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      toast.success("공유 텍스트가 복사되었습니다!");
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyText = async () => {
    const shareText = `🎬 ${storyTitle} 클리어! ${dominantIcon} 성향: ${dominantLabel} — ${endingMessage} #토리게임`;
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    toast.success("복사되었습니다!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden" />
      <div className="grid grid-cols-4 gap-2">
        <Button variant="outline" size="sm" onClick={() => handleShare("twitter")} disabled={generating}>
          <Twitter className="h-4 w-4 mr-1" />X
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleShare("kakao")} disabled={generating} className="text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10">
          <MessageCircle className="h-4 w-4 mr-1" />카톡
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyText} disabled={generating}>
          {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
          복사
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleShare()} disabled={generating}>
          <Share2 className="h-4 w-4 mr-1" />공유
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleDownload} disabled={generating}>
        <Download className="h-4 w-4 mr-1.5" />결과 이미지 저장
      </Button>
    </div>
  );
}
