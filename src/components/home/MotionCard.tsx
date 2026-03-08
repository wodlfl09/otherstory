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
  return "soft"; // romance, comic, martial
}

/** Random span assignment for masonry variety */
export function getRandomSpan(index: number): "tall" | "wide" | "normal" {
  const pattern = [
    "tall", "normal", "wide", "normal", "normal", "tall",
    "normal", "wide", "normal", "tall", "normal", "normal",
  ] as const;
  return pattern[index % pattern.length];
}

export default function MotionCard({
  type, title, genre, coverUrl, likeCount, span, motionPreset, delay, onClick,
}: MotionCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  // Intersection observer for scroll-reveal
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const spanClass = span === "tall"
    ? "row-span-2"
    : span === "wide"
      ? "col-span-2"
      : "";

  const motionClass =
    motionPreset === "cinematic"
      ? "gallery-motion-cinematic"
      : motionPreset === "noir"
        ? "gallery-motion-noir"
        : "gallery-motion-soft";

  return (
    <button
      ref={cardRef}
      onClick={onClick}
      className={cn(
        "gallery-card group relative overflow-hidden rounded-xl border border-border bg-card text-left",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        spanClass,
        visible ? "gallery-card-visible" : "gallery-card-hidden"
      )}
      style={{ animationDelay: `${delay}ms`, minHeight: span === "tall" ? 380 : span === "wide" ? 200 : 260 }}
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
              ? <Play className="h-12 w-12 text-muted-foreground/40" />
              : <BookOpen className="h-12 w-12 text-muted-foreground/40" />}
          </div>
        )}
      </div>

      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

      {/* Glitch scanline for noir */}
      {motionPreset === "noir" && (
        <div className="absolute inset-0 gallery-noir-scanline pointer-events-none" />
      )}

      {/* Light sweep for cinematic */}
      {motionPreset === "cinematic" && (
        <div className="absolute inset-0 gallery-light-sweep pointer-events-none" />
      )}

      {/* Content overlay — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 z-10 translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm sm:text-base text-white line-clamp-2 drop-shadow-lg">
              {title}
            </h3>
            <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {genre && (
                <Badge variant="outline" className="text-[10px] border-white/30 text-white/80 bg-white/10 backdrop-blur-sm">
                  {GENRE_LABELS[genre] || genre}
                </Badge>
              )}
              <span className="flex items-center gap-1 text-[11px] text-white/70">
                <Heart className="h-3 w-3" />{likeCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover glow border */}
      <div className="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-primary/40 transition-colors duration-300 pointer-events-none" />
    </button>
  );
}
