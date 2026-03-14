import { useEffect, useRef, useState, useCallback } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Download, Film, FilmIcon } from "lucide-react";
import { toast } from "sonner";

type GenrePreset = "cinematic" | "noir" | "soft";

interface MotionComicProps {
  imageUrl: string;
  genre: string;
  step: number;
  alt?: string;
}

const GENRE_PRESET_MAP: Record<string, GenrePreset> = {
  sf: "cinematic",
  fantasy: "cinematic",
  action: "cinematic",
  adult: "cinematic",
  mystery: "noir",
  horror: "noir",
  romance: "soft",
  comic: "soft",
  martial: "soft",
};

const PRESET_STYLES: Record<GenrePreset, string> = {
  cinematic: "brightness(1.04) contrast(1.06) saturate(1.04)",
  noir: "brightness(0.9) contrast(1.1) saturate(0.65)",
  soft: "brightness(1.06) contrast(0.97) saturate(1.08)",
};

// Deterministic but varied movement per step
function getKenBurnsDirection(step: number) {
  const directions = [
    { startX: 0, startY: 0, endX: -3, endY: -2 },
    { startX: -2, startY: -1, endX: 2, endY: 1 },
    { startX: 2, startY: -1, endX: -2, endY: -3 },
    { startX: -1, startY: 2, endX: 2, endY: -2 },
    { startX: 1, startY: -2, endX: -3, endY: 1 },
    { startX: -3, startY: 1, endX: 1, endY: -2 },
  ];
  return directions[step % directions.length];
}

export default function MotionComic({ imageUrl, genre, step, alt }: MotionComicProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageKey, setImageKey] = useState(0);
  const preset = GENRE_PRESET_MAP[genre] || "cinematic";
  const dir = getKenBurnsDirection(step);

  // Trigger re-animation on step/image change
  useEffect(() => {
    setImageKey((k) => k + 1);
  }, [imageUrl, step]);

  const handleExport = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = container.querySelector("canvas");
    const img = container.querySelector("img");
    if (!img) { toast.error("이미지를 찾을 수 없습니다."); return; }

    toast.info("클립 녹화 중... (6초)");

    const offCanvas = document.createElement("canvas");
    offCanvas.width = 1280;
    offCanvas.height = 720;
    const ctx = offCanvas.getContext("2d")!;

    const stream = offCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scene_${step}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("클립이 저장되었습니다!");
    };

    recorder.start();
    const duration = 6000;
    const startTime = performance.now();

    const drawFrame = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const scale = 1 + 0.1 * progress;
      const tx = dir.startX + (dir.endX - dir.startX) * progress;
      const ty = dir.startY + (dir.endY - dir.startY) * progress;

      ctx.clearRect(0, 0, 1280, 720);
      ctx.save();
      ctx.translate(640, 360);
      ctx.scale(scale, scale);
      ctx.translate(-640 + (tx / 100) * 1280, -360 + (ty / 100) * 720);
      ctx.filter = PRESET_STYLES[preset];
      ctx.drawImage(img, 0, 0, 1280, 720);
      ctx.restore();

      // Vignette for noir
      if (preset === "noir") {
        const grad = ctx.createRadialGradient(640, 360, 200, 640, 360, 700);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, "rgba(0,0,0,0.4)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1280, 720);
      }

      if (progress < 1) {
        requestAnimationFrame(drawFrame);
      } else {
        recorder.stop();
      }
    };
    requestAnimationFrame(drawFrame);
  }, [imageUrl, step, preset, dir]);

  return (
    <div ref={containerRef} className="relative group">
      <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border border-border shadow-lg">
        {/* Crossfade wrapper */}
        <div className="absolute inset-0 motion-comic-crossfade" key={imageKey}>
          <img
            src={imageUrl}
            alt={alt || `장면 ${step + 1}`}
            crossOrigin="anonymous"
            className="motion-comic-image h-full w-full object-cover"
            style={{
              filter: PRESET_STYLES[preset],
              ["--kb-start-x" as string]: `${dir.startX}%`,
              ["--kb-start-y" as string]: `${dir.startY}%`,
              ["--kb-end-x" as string]: `${dir.endX}%`,
              ["--kb-end-y" as string]: `${dir.endY}%`,
            }}
          />
        </div>

        {/* Vignette overlay for noir */}
        {preset === "noir" && (
          <div className="absolute inset-0 pointer-events-none motion-comic-vignette" />
        )}

        {/* Soft bloom overlay */}
        {preset === "soft" && (
          <div className="absolute inset-0 pointer-events-none motion-comic-bloom" />
        )}

        {/* Glitch overlay for horror/mystery */}
        {preset === "noir" && (
          <div className="absolute inset-0 pointer-events-none motion-comic-glitch" />
        )}
      </AspectRatio>

      {/* Export button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExport}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 bg-background/60 backdrop-blur-sm text-xs"
      >
        <Download className="h-3.5 w-3.5" />
        클립 저장
      </Button>
    </div>
  );
}
