import { useEffect, useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Play, BookOpen, Search, TrendingUp, Clock } from "lucide-react";
import ExploreContentCard from "@/components/explore/ExploreContentCard";
import ExplorePreviewModal from "@/components/explore/ExplorePreviewModal";

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

const GENRE_OPTIONS = [
  { id: "all", label: "전체" },
  { id: "sf", label: "SF" },
  { id: "fantasy", label: "판타지" },
  { id: "mystery", label: "추리" },
  { id: "action", label: "액션" },
  { id: "horror", label: "공포" },
  { id: "romance", label: "로맨스" },
  { id: "comic", label: "코믹" },
  { id: "martial", label: "무협" },
];

export default function Explore() {
  const [tab, setTab] = useState("games");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"popular" | "latest">("popular");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["all"]);
  const [games, setGames] = useState<PublicGame[]>([]);
  const [novels, setNovels] = useState<PublicNovel[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
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
  } | null>(null);

  useEffect(() => {
    loadContent();
  }, [tab]);

  const loadContent = async () => {
    setLoading(true);
    if (tab === "games") {
      const { data } = await supabase
        .from("public_games")
        .select("*, story:stories(title, genre, synopsis, cover_url, protagonist_name)")
        .order("published_at", { ascending: false })
        .limit(100);
      setGames((data as any[]) || []);
    } else {
      const { data } = await supabase
        .from("public_novels")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(100);
      setNovels((data as any[]) || []);
    }
    setLoading(false);
  };

  // Client-side filtering & sorting
  const filteredGames = useMemo(() => {
    let items = [...games];
    if (!selectedGenres.includes("all") && selectedGenres.length > 0) {
      items = items.filter((g) => selectedGenres.includes(g.story?.genre));
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((g) =>
        g.story?.title?.toLowerCase().includes(q) ||
        g.story?.synopsis?.toLowerCase().includes(q)
      );
    }
    if (sortBy === "popular") {
      items.sort((a, b) => (b.like_count + b.play_count * 0.2) - (a.like_count + a.play_count * 0.2));
    } else {
      items.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    }
    return items;
  }, [games, selectedGenres, search, sortBy]);

  const filteredNovels = useMemo(() => {
    let items = [...novels];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((n) =>
        n.title?.toLowerCase().includes(q) ||
        n.synopsis?.toLowerCase().includes(q)
      );
    }
    if (sortBy === "popular") {
      items.sort((a, b) => (b.like_count + b.view_count * 0.2) - (a.like_count + a.view_count * 0.2));
    } else {
      items.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    }
    return items;
  }, [novels, search, sortBy]);

  const toggleGenre = (id: string) => {
    if (id === "all") { setSelectedGenres(["all"]); return; }
    setSelectedGenres((prev) => {
      const next = prev.filter((g) => g !== "all");
      if (next.includes(id)) {
        const result = next.filter((g) => g !== id);
        return result.length === 0 ? ["all"] : result;
      }
      return [...next, id];
    });
  };

  const openGamePreview = (game: PublicGame) => {
    setSelectedItem({
      type: "game",
      id: game.story_id,
      title: game.story?.title || "제목 없음",
      genre: game.story?.genre,
      coverUrl: game.story?.cover_url,
      synopsis: game.story?.synopsis,
      protagonistName: game.story?.protagonist_name,
      likeCount: game.like_count || 0,
      playOrViewCount: game.play_count || 0,
      creatorId: game.creator_id,
    });
    setModalOpen(true);
  };

  const openNovelPreview = (novel: PublicNovel) => {
    setSelectedItem({
      type: "novel",
      id: novel.id,
      title: novel.title,
      coverUrl: novel.cover_url,
      synopsis: novel.synopsis,
      likeCount: novel.like_count || 0,
      playOrViewCount: novel.view_count || 0,
      creatorId: novel.creator_id,
    });
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-6xl px-4 pt-16 sm:pt-24 pb-20 sm:pb-16">
        <h1 className="font-display text-3xl font-bold mb-2 text-foreground">탐색</h1>
        <p className="text-muted-foreground mb-8">공개된 게임과 소설을 즐겨보세요</p>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 bg-secondary">
            <TabsTrigger value="games" className="gap-2"><Play className="h-4 w-4" />공개 게임</TabsTrigger>
            <TabsTrigger value="novels" className="gap-2"><BookOpen className="h-4 w-4" />공개 소설</TabsTrigger>
          </TabsList>

          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="제목 또는 시놉시스 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-2">
                <Button size="sm" variant={sortBy === "popular" ? "default" : "outline"} onClick={() => setSortBy("popular")} className="gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />인기
                </Button>
                <Button size="sm" variant={sortBy === "latest" ? "default" : "outline"} onClick={() => setSortBy("latest")} className="gap-1">
                  <Clock className="h-3.5 w-3.5" />최신
                </Button>
              </div>
              {tab === "games" && (
                <>
                  <div className="h-5 w-px bg-border mx-1" />
                  <div className="flex gap-1 flex-wrap">
                    {GENRE_OPTIONS.map((g) => (
                      <Badge
                        key={g.id}
                        variant={selectedGenres.includes(g.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleGenre(g.id)}
                      >
                        {g.label}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <TabsContent value="games">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredGames.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">공개된 게임이 없습니다.</div>
            ) : (
              <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGames.map((game) => (
                  <ExploreContentCard
                    key={game.story_id}
                    type="game"
                    id={game.story_id}
                    title={game.story?.title || "제목 없음"}
                    genre={game.story?.genre}
                    coverUrl={game.story?.cover_url}
                    synopsis={game.story?.synopsis}
                    protagonistName={game.story?.protagonist_name}
                    likeCount={game.like_count || 0}
                    playOrViewCount={game.play_count || 0}
                    onClick={() => openGamePreview(game)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="novels">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredNovels.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">공개된 소설이 없습니다.</div>
            ) : (
              <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredNovels.map((novel) => (
                  <ExploreContentCard
                    key={novel.id}
                    type="novel"
                    id={novel.id}
                    title={novel.title}
                    coverUrl={novel.cover_url}
                    synopsis={novel.synopsis}
                    likeCount={novel.like_count || 0}
                    playOrViewCount={novel.view_count || 0}
                    onClick={() => openNovelPreview(novel)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview Modal */}
      {selectedItem && (
        <ExplorePreviewModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          {...selectedItem}
          onLikeToggled={loadContent}
        />
      )}
    </div>
  );
}
