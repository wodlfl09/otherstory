import { useRef, useEffect, useState } from "react";
import { Heart, Play, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MotionPreset = "cinematic" | "noir" | "soft";

interface MotionCardProps {
  type: "game" | "novel";
  id: string;
  title: string;
  genre?: string;
  coverUrl?: string | null;
  likeCount: number;
  span: "tall" | "wide" | "normal";
  motionPreset: MotionPreset;
  delay: number;
  onClick: () => void;
  /** Hide all text overlays — used for background-only mode */
  hideOverlay?: boolean;
}

const GENRE_LABELS: Record<string, string> = {
  sf: "SF", fantasy: "판타지", mystery: "추리", action: "액션",
  horror: "공포", romance: "로맨스", comic: "코믹", martial: "무협",
};

/** Returns a genre-based motion preset */
export function getMotionPreset(genre?: string): MotionPreset {
  if (!genre) return "soft";
  if (["sf", "fantasy", "action"].includes(genre)) return "cinematic";
  if (["mystery", "horror"].includes(genre)) return "noir";
  return "soft";
}

/** Deterministic span pattern for masonry variety */
export function getRandomSpan(index: number): "tall" | "wide" | "normal" {
  const pattern = [
    "tall", "normal", "wide", "normal", "normal", "tall",
    "wide", "normal", "tall", "normal", "normal", "wide",
  ] as const;
  return pattern[index % pattern.length];
}

export default function MotionCard({
  type, title, genre, coverUrl, likeCount, span, motionPreset, delay, onClick, hideOverlay,
}: MotionCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const motionClass =
    motionPreset === "cinematic"
      ? "gallery-motion-cinematic"
      : motionPreset === "noir"
        ? "gallery-motion-noir"
        : "gallery-motion-soft";

  // Height classes for the masonry auto-row system
  const heightClass = span === "tall"
    ? "gallery-span-tall"
    : span === "wide"
      ? "gallery-span-wide"
      : "gallery-span-normal";

  return (
    <button
      ref={cardRef}
      onClick={onClick}
      className={cn(
        "gallery-card group relative overflow-hidden bg-card text-left",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
        "rounded-lg",
        heightClass,
        visible ? "gallery-card-visible" : "gallery-card-hidden"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Image with motion */}
      <div className="absolute inset-0 overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            loading="lazy"
            className={cn("h-full w-full object-cover will-change-transform", motionClass)}
          />
        ) : (
          <div className={cn("h-full w-full bg-secondary flex items-center justify-center", motionClass)}>
            {type === "game"
              ? <Play className="h-10 w-10 text-muted-foreground/30" />
              : <BookOpen className="h-10 w-10 text-muted-foreground/30" />}
          </div>
        )}
      </div>

      {/* Vignette — stronger bottom fade for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent pointer-events-none" />

      {/* Noir scanline */}
      {motionPreset === "noir" && (
        <div className="absolute inset-0 gallery-noir-scanline pointer-events-none" />
      )}

      {/* Cinematic light sweep */}
      {motionPreset === "cinematic" && (
        <div className="absolute inset-0 gallery-light-sweep pointer-events-none" />
      )}

      {/* Text overlays — hidden in background mode */}
      {!hideOverlay && (
        <>
          {/* Like indicator */}
          {likeCount > 0 && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-sm px-2 py-1">
              <Heart className="h-3 w-3 text-primary fill-primary" />
              <span className="text-[10px] font-medium text-foreground/90">{likeCount}</span>
            </div>
          )}

          {/* Content overlay — bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-3 z-10 translate-y-0.5 group-hover:translate-y-0 transition-transform duration-300">
            <h3 className="font-medium text-xs sm:text-sm text-foreground line-clamp-2 drop-shadow-lg">
              {title}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {genre && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-foreground/20 text-foreground/70 bg-background/20 backdrop-blur-sm">
                  {GENRE_LABELS[genre] || genre}
                </Badge>
              )}
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-foreground/20 text-foreground/70 bg-background/20 backdrop-blur-sm">
                {type === "game" ? "게임" : "소설"}
              </Badge>
            </div>
          </div>

          {/* Hover glow ring */}
          <div className="absolute inset-0 rounded-lg border border-transparent group-hover:border-primary/30 transition-colors duration-300 pointer-events-none" />
        </>
      )}
    </button>
  );
}
