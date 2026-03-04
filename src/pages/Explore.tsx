import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Heart, MessageCircle, Play, BookOpen, Search, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("games");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"popular" | "latest">("popular");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["all"]);
  const [games, setGames] = useState<PublicGame[]>([]);
  const [novels, setNovels] = useState<PublicNovel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContent();
  }, [tab, sortBy, selectedGenres]);

  const loadContent = async () => {
    setLoading(true);
    if (tab === "games") {
      let query = supabase
        .from("public_games")
        .select("*, story:stories(title, genre, synopsis, cover_url, protagonist_name)");

      if (sortBy === "popular") {
        query = query.order("like_count", { ascending: false });
      } else {
        query = query.order("published_at", { ascending: false });
      }

      const { data } = await query.limit(50);
      let filtered = (data as any[]) || [];

      if (!selectedGenres.includes("all") && selectedGenres.length > 0) {
        filtered = filtered.filter((g) => selectedGenres.includes(g.story?.genre));
      }
      if (search) {
        filtered = filtered.filter((g) =>
          g.story?.title?.toLowerCase().includes(search.toLowerCase())
        );
      }

      setGames(filtered);
    } else {
      let query = supabase.from("public_novels").select("*");

      if (sortBy === "popular") {
        query = query.order("like_count", { ascending: false });
      } else {
        query = query.order("published_at", { ascending: false });
      }

      const { data } = await query.limit(50);
      let filtered = (data as any[]) || [];

      if (search) {
        filtered = filtered.filter((n: any) =>
          n.title?.toLowerCase().includes(search.toLowerCase())
        );
      }

      setNovels(filtered);
    }
    setLoading(false);
  };

  const toggleGenre = (id: string) => {
    if (id === "all") {
      setSelectedGenres(["all"]);
      return;
    }
    setSelectedGenres((prev) => {
      const next = prev.filter((g) => g !== "all");
      if (next.includes(id)) {
        const result = next.filter((g) => g !== id);
        return result.length === 0 ? ["all"] : result;
      }
      return [...next, id];
    });
  };

  const handlePlayGame = async (storyId: string) => {
    if (!user) { navigate("/auth"); return; }
    const idempotencyKey = crypto.randomUUID();
    try {
      const { data, error } = await supabase.functions.invoke("play-public-game", {
        body: { story_id: storyId, idempotency_key: idempotencyKey },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.session_id) navigate(`/game/${data.session_id}`);
    } catch (err: any) {
      toast.error(err.message || "게임 시작에 실패했습니다.");
    }
  };

  const handleReadNovel = async (novelId: string) => {
    if (!user) { navigate("/auth"); return; }
    const idempotencyKey = crypto.randomUUID();
    try {
      const { data, error } = await supabase.functions.invoke("read-public-novel", {
        body: { novel_id: novelId, idempotency_key: idempotencyKey },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      navigate(`/novel/${novelId}`);
    } catch (err: any) {
      toast.error(err.message || "소설 열람에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-6xl px-4 pt-24 pb-16">
        <h1 className="font-display text-3xl font-bold mb-2">탐색</h1>
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
                placeholder="검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadContent()}
                className="pl-10 bg-secondary"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={sortBy === "popular" ? "default" : "outline"}
                  onClick={() => setSortBy("popular")}
                  className="gap-1"
                >
                  <TrendingUp className="h-3.5 w-3.5" />인기
                </Button>
                <Button
                  size="sm"
                  variant={sortBy === "latest" ? "default" : "outline"}
                  onClick={() => setSortBy("latest")}
                  className="gap-1"
                >
                  <Clock className="h-3.5 w-3.5" />최신
                </Button>
              </div>
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
            </div>
          </div>

          <TabsContent value="games">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : games.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">공개된 게임이 없습니다.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {games.map((game) => (
                  <div key={game.story_id} className="card-glow rounded-xl border border-border bg-card overflow-hidden">
                    <AspectRatio ratio={16 / 9}>
                      {game.story?.cover_url ? (
                        <img src={game.story.cover_url} alt={game.story.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-secondary flex items-center justify-center">
                          <Play className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </AspectRatio>
                    <div className="p-4">
                      <h3 className="font-medium text-foreground line-clamp-1">{game.story?.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground capitalize">{game.story?.genre}</p>
                      {game.story?.synopsis && (
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{game.story.synopsis}</p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{game.like_count}</span>
                          <span className="flex items-center gap-1"><Play className="h-3.5 w-3.5" />{game.play_count}</span>
                        </div>
                        <Button size="sm" onClick={() => handlePlayGame(game.story_id)}>
                          게임 시작 (10💎)
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="novels">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : novels.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">공개된 소설이 없습니다.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {novels.map((novel) => (
                  <div key={novel.id} className="card-glow rounded-xl border border-border bg-card overflow-hidden">
                    <AspectRatio ratio={16 / 9}>
                      {novel.cover_url ? (
                        <img src={novel.cover_url} alt={novel.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-secondary flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </AspectRatio>
                    <div className="p-4">
                      <h3 className="font-medium text-foreground line-clamp-1">{novel.title}</h3>
                      {novel.synopsis && (
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{novel.synopsis}</p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{novel.like_count}</span>
                          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{novel.view_count}</span>
                        </div>
                        <Button size="sm" onClick={() => handleReadNovel(novel.id)}>
                          소설 보기 (10💎)
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
