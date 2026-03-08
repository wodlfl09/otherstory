import { Skull, Search, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const GENRES = [
  { id: "horror", label: "공포", icon: Skull, hsl: "0 72% 51%", desc: "심장이 멎을 듯한 공포" },
  { id: "mystery", label: "미스터리", icon: Search, hsl: "45 100% 55%", desc: "진실을 파헤쳐라" },
  { id: "action", label: "스릴러", icon: ShieldAlert, hsl: "15 100% 55%", desc: "생사를 건 추격" },
] as const;

export type GenreId = (typeof GENRES)[number]["id"];

export default function GenreGrid() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {GENRES.map((genre, i) => {
        const Icon = genre.icon;
        const color = `hsl(${genre.hsl})`;
        return (
          <button
            key={genre.id}
            onClick={() => navigate(`/create?genre=${genre.id}`)}
            className="card-glow group relative flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 sm:p-6 text-center opacity-0 animate-fade-in"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div
              className="rounded-lg p-3 transition-colors"
              style={{ backgroundColor: `hsl(${genre.hsl} / 0.1)` }}
            >
              <Icon className="h-7 w-7" style={{ color }} />
            </div>
            <span className="text-sm font-bold text-foreground">{genre.label}</span>
            <span className="text-[10px] text-muted-foreground">{genre.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

export { GENRES };
