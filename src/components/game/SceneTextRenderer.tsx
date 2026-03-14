import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";

export type TextStyle = "normal" | "shout" | "whisper" | "impact" | "glitch";

export interface TextSegment {
  text: string;
  style: TextStyle;
  delayMs: number;   // when to start appearing (cumulative)
  durationMs: number; // how long the reveal animation takes
}

interface SceneTextRendererProps {
  sceneText: string;
  genre: string;
  /** Reset key – change to re-trigger animation */
  revealKey: string | number;
  /** Callback fired when all segments have been revealed */
  onRevealComplete?: () => void;
  className?: string;
}

// ── Genre → style hinting ──
const GENRE_ACCENTS: Record<string, TextStyle[]> = {
  horror: ["whisper", "glitch", "impact"],
  mystery: ["whisper", "impact"],
  sf: ["impact", "shout"],
  fantasy: ["impact", "shout"],
  action: ["shout", "impact"],
  romance: ["normal", "whisper"],
  comic: ["shout", "normal"],
  martial: ["impact", "shout"],
};

/**
 * Split scene text into 2-4 segments and assign styles.
 * First & last sentences stay `normal`; middle ones may get genre accents.
 */
export function parseSegments(text: string, genre: string): TextSegment[] {
  if (!text) return [];

  // Split by Korean/general sentence endings
  const raw = text
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (raw.length === 0) return [];

  // Group into 2-4 segments
  const segments: string[] = [];
  if (raw.length <= 2) {
    segments.push(...raw);
  } else if (raw.length <= 4) {
    segments.push(...raw);
  } else {
    // Merge into ~4 groups
    const groupSize = Math.ceil(raw.length / 4);
    for (let i = 0; i < raw.length; i += groupSize) {
      segments.push(raw.slice(i, i + groupSize).join(" "));
    }
  }

  const accents = GENRE_ACCENTS[genre] || ["normal"];
  const BASE_DELAY = 600; // ms between segments

  return segments.map((text, i) => {
    let style: TextStyle = "normal";
    // Apply accent to middle segments (not first or last for readability)
    if (i > 0 && i < segments.length - 1 && segments.length > 2) {
      // Pick an accent style, cycling through available ones
      style = accents[(i - 1) % accents.length];
    }

    return {
      text,
      style,
      delayMs: i * BASE_DELAY,
      durationMs: 400,
    };
  });
}

const STYLE_CLASSES: Record<TextStyle, string> = {
  normal: "scene-text-normal",
  shout: "scene-text-shout",
  whisper: "scene-text-whisper",
  impact: "scene-text-impact",
  glitch: "scene-text-glitch",
};

export default function SceneTextRenderer({
  sceneText,
  genre,
  revealKey,
  onRevealComplete,
  className,
}: SceneTextRendererProps) {
  const segments = useMemo(() => parseSegments(sceneText, genre), [sceneText, genre]);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    if (segments.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    segments.forEach((seg, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleCount((c) => {
            const next = c + 1;
            if (next >= segments.length) {
              onRevealComplete?.();
            }
            return next;
          });
        }, seg.delayMs + seg.durationMs)
      );
    });

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, segments.length]);

  return (
    <div className={cn("space-y-1", className)} style={{ wordBreak: "keep-all" }}>
      {segments.map((seg, i) => (
        <span
          key={`${revealKey}-${i}`}
          className={cn(
            "inline scene-text-segment",
            STYLE_CLASSES[seg.style],
            i < visibleCount ? "scene-text-visible" : "scene-text-hidden"
          )}
          style={{
            transitionDelay: `${seg.delayMs}ms`,
            animationDelay: `${seg.delayMs}ms`,
          }}
        >
          {seg.text}{" "}
        </span>
      ))}
    </div>
  );
}
