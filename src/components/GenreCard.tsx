import { Lock, Rocket, Wand2, Search, Zap, Skull, Heart, Laugh, Sword, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const GENRES = [
  { id: "sf", label: "SF", icon: Rocket, hsl: "200 100% 55%" },
  { id: "fantasy", label: "판타지", icon: Wand2, hsl: "265 90% 60%" },
  { id: "mystery", label: "추리", icon: Search, hsl: "45 100% 55%" },
  { id: "action", label: "액션", icon: Zap, hsl: "15 100% 55%" },
  { id: "horror", label: "공포", icon: Skull, hsl: "0 72% 51%" },
  { id: "romance", label: "로맨스", icon: Heart, hsl: "340 82% 60%" },
  { id: "comic", label: "코믹", icon: Laugh, hsl: "120 60% 50%" },
  { id: "martial", label: "무협", icon: Sword, hsl: "30 80% 45%" },
  { id: "adult", label: "성인", icon: ShieldAlert, hsl: "0 0% 40%" },
] as const;

export type GenreId = (typeof GENRES)[number]["id"];

export default function GenreGrid() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const handleGenreClick = (genre: typeof GENRES[number]) => {
    if (genre.id === "adult" && !profile?.adult_verified) {
      navigate("/adult-verify");
      return;
    }
    navigate(`/create?genre=${genre.id}`);
  };

  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {GENRES.map((genre, i) => {
        const Icon = genre.icon;
        const isLocked = genre.id === "adult" && !profile?.adult_verified;
        const color = `hsl(${genre.hsl})`;
        return (
          <button
            key={genre.id}
            onClick={() => handleGenreClick(genre)}
            className="card-glow group relative flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center opacity-0 animate-fade-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {isLocked && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div
              className="rounded-lg p-3 transition-colors"
              style={{ backgroundColor: `hsl(${genre.hsl} / 0.1)` }}
            >
              <Icon className="h-7 w-7" style={{ color }} />
            </div>
            <span className="text-sm font-medium text-foreground">{genre.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { GENRES };
