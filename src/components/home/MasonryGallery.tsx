import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import MotionCard, { getMotionPreset, getRandomSpan } from "./MotionCard";
import ExplorePreviewModal from "@/components/explore/ExplorePreviewModal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const GENRE_FILTERS = [
  { key: "all", label: "전체" },
  { key: "sf", label: "SF" },
  { key: "fantasy", label: "판타지" },
  { key: "mystery", label: "추리" },
  { key: "action", label: "액션" },
  { key: "horror", label: "공포" },
  { key: "romance", label: "로맨스" },
  { key: "comic", label: "코믹" },
  { key: "martial", label: "무협" },
] as const;

interface PublicGame {
  story_id: string;
  creator_id: string;
  play_count: number;
  like_count: number;
  published_at: string;
  story: {
    title: string;
    genre: string;
    synopsis: string | null;
    cover_url: string | null;
    protagonist_name: string | null;
  };
}

interface PublicNovel {
  id: string;
  session_id: string;
  story_id: string;
  creator_id: string;
  title: string;
  synopsis: string | null;
  cover_url: string | null;
  view_count: number;
  like_count: number;
  published_at: string;
}

interface GalleryItem {
  type: "game" | "novel";
  id: string;
  title: string;
  genre?: string;
  coverUrl?: string | null;
  synopsis?: string | null;
  protagonistName?: string | null;
  likeCount: number;
  playOrViewCount: number;
  creatorId?: string;
  publishedAt: string;
}

export default function MasonryGallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  const [activeGenre, setActiveGenre] = useState<string>("all");

  useEffect(() => {
    loadAll();
  }, []);

  const filteredItems = useMemo(() => {
    if (activeGenre === "all") return items;
    return items.filter((item) => item.genre === activeGenre);
  }, [items, activeGenre]);

  const loadAll = async () => {
    setLoading(true);
    const [gamesRes, novelsRes] = await Promise.all([
      supabase
        .from("public_games")
        .select("*, story:stories(title, genre, synopsis, cover_url, protagonist_name)")
        .order("published_at", { ascending: false })
        .limit(30),
      supabase
        .from("public_novels")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(20),
    ]);

    const games: GalleryItem[] = ((gamesRes.data as any[]) || []).map((g: PublicGame) => ({
      type: "game" as const,
      id: g.story_id,
      title: g.story?.title || "제목 없음",
      genre: g.story?.genre,
      coverUrl: g.story?.cover_url,
      synopsis: g.story?.synopsis,
      protagonistName: g.story?.protagonist_name,
      likeCount: g.like_count || 0,
      playOrViewCount: g.play_count || 0,
      creatorId: g.creator_id,
      publishedAt: g.published_at,
    }));

    const novels: GalleryItem[] = ((novelsRes.data as any[]) || []).map((n: PublicNovel) => ({
      type: "novel" as const,
      id: n.id,
      title: n.title,
      coverUrl: n.cover_url,
      synopsis: n.synopsis,
      likeCount: n.like_count || 0,
      playOrViewCount: n.view_count || 0,
      creatorId: n.creator_id,
      publishedAt: n.published_at,
    }));

    // Interleave games and novels, sorted by popularity
    const all = [...games, ...novels].sort(
      (a, b) => (b.likeCount + b.playOrViewCount * 0.3) - (a.likeCount + a.playOrViewCount * 0.3)
    );
    setItems(all);
    setLoading(false);
  };

  const openPreview = (item: GalleryItem) => {
    setSelected(item);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="gallery-masonry">
        {Array.from({ length: 12 }).map((_, i) => {
          const s = getRandomSpan(i);
          return (
            <Skeleton
              key={i}
              className={cn(
                "rounded-lg",
                s === "tall" ? "gallery-span-tall" : s === "wide" ? "gallery-span-wide" : "gallery-span-normal"
              )}
            />
          );
        })}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        아직 공개된 작품이 없습니다. 첫 번째 작품을 만들어보세요!
      </div>
    );
  }

  return (
    <>
      {/* Genre Filter Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {GENRE_FILTERS.map((g) => (
          <button
            key={g.key}
            onClick={() => setActiveGenre(g.key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200",
              "border border-border hover:border-primary/40",
              activeGenre === g.key
                ? "bg-primary text-primary-foreground border-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)]"
                : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          해당 장르의 공개 작품이 없습니다.
        </div>
      ) : (
        <div className="gallery-masonry">
          {filteredItems.map((item, i) => (
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
              delay={Math.min(i * 60, 600)}
              onClick={() => openPreview(item)}
            />
          ))}
        </div>
      )}

      {selected && (
        <ExplorePreviewModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          type={selected.type}
          id={selected.id}
          title={selected.title}
          genre={selected.genre}
          coverUrl={selected.coverUrl}
          synopsis={selected.synopsis}
          protagonistName={selected.protagonistName}
          likeCount={selected.likeCount}
          playOrViewCount={selected.playOrViewCount}
          creatorId={selected.creatorId}
          onLikeToggled={loadAll}
        />
      )}
    </>
  );
}
