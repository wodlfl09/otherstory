import { useCallback, useRef, useState } from "react";

/**
 * Extract 1-2 key sentences from scene text for short TTS narration.
 * Prefers the first and a "dramatic" middle sentence.
 */
function extractKeyLines(text: string, maxChars = 120): string {
  if (!text) return "";
  const sentences = text
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return text.slice(0, maxChars);
  if (sentences.length === 1) return sentences[0].slice(0, maxChars);
  // Take first + last sentence (usually the hook + cliffhanger)
  const result = [sentences[0], sentences[sentences.length - 1]].join(" ");
  return result.length > maxChars ? sentences[0].slice(0, maxChars) : result;
}

export function useTTS() {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem("tts-enabled");
    return saved === "true";
  });
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("tts-enabled", String(next));
      if (!next) {
        // Stop any playing audio
        audioRef.current?.pause();
        abortRef.current?.abort();
        setPlaying(false);
      }
      return next;
    });
  }, []);

  const speak = useCallback(
    async (fullText: string) => {
      if (!enabled) return;

      // Stop previous
      audioRef.current?.pause();
      abortRef.current?.abort();

      const ttsText = extractKeyLines(fullText);
      if (!ttsText) return;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setPlaying(true);
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts-speak`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ text: ttsText }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          console.warn("TTS request failed:", response.status);
          setPlaying(false);
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setPlaying(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setPlaying(false);
          URL.revokeObjectURL(url);
        };

        await audio.play();
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("TTS error:", err);
        }
        setPlaying(false);
      }
    },
    [enabled]
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    abortRef.current?.abort();
    setPlaying(false);
  }, []);

  return { enabled, playing, toggle, speak, stop };
}
