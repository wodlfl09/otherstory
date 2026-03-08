import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MotionCard, { getMotionPreset, getRandomSpan } from "./MotionCard";

interface BgItem {
  id: string;
  type: "game" | "novel";
  title: string;
  genre?: string;
  coverUrl?: string | null;
  likeCount: number;
}

/**
 * A non-interactive version of the masonry gallery used purely as
 * a cinematic background layer behind the login form.
 */
export default function GalleryBackground() {
  const [items, setItems] = useState<BgItem[]>([]);

  useEffect(() => {
    (async () => {
      const [gamesRes, novelsRes] = await Promise.all([
        supabase
          .from("public_games")
          .select("story_id, like_count, story:stories(title, genre, cover_url)")
          .order("like_count", { ascending: false })
          .limit(30),
        supabase
          .from("public_novels")
          .select("id, title, cover_url, like_count")
          .order("like_count", { ascending: false })
          .limit(20),
      ]);

      const games: BgItem[] = ((gamesRes.data as any[]) || []).map((g) => ({
        id: g.story_id,
        type: "game",
        title: g.story?.title || "",
        genre: g.story?.genre,
        coverUrl: g.story?.cover_url,
        likeCount: g.like_count || 0,
      }));

      const novels: BgItem[] = ((novelsRes.data as any[]) || []).map((n) => ({
        id: n.id,
        type: "novel",
        title: n.title,
        coverUrl: n.cover_url,
        likeCount: n.like_count || 0,
      }));

      setItems([...games, ...novels].sort(() => Math.random() - 0.5));
    })();
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      {/* The masonry grid fills the viewport */}
      <div className="gallery-masonry gallery-bg-mode h-full w-full opacity-70">
        {items.map((item, i) => (
          <MotionCard
            key={`${item.type}-${item.id}`}
            type={item.type}
            id={item.id}
            title={item.title}
            genre={item.genre}
            coverUrl={item.coverUrl}
            likeCount={item.likeCount}
            span={getRandomSpan(i)}
            motionPreset={getMotionPreset(item.genre)}
            delay={i * 80}
            onClick={() => {}}
          />
        ))}
      </div>
      {/* Lighter overlay — let gallery shine through */}
      <div className="absolute inset-0 bg-background/30" />
      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,hsl(var(--background)/0.7)_100%)]" />
    </div>
  );
}
