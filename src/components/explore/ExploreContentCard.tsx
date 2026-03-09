import { Heart, Play, BookOpen, Eye } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";

interface ExploreContentCardProps {
  type: "game" | "novel";
  id: string;
  title: string;
  genre?: string;
  coverUrl?: string | null;
  synopsis?: string | null;
  protagonistName?: string | null;
  likeCount: number;
  playOrViewCount: number;
  onClick: () => void;
}

const GENRE_LABELS: Record<string, string> = {
  sf: "SF", fantasy: "판타지", mystery: "추리", action: "액션",
  horror: "공포", romance: "로맨스", comic: "코믹", martial: "무협",
};

export default function ExploreContentCard({
  type, title, genre, coverUrl, synopsis, protagonistName,
  likeCount, playOrViewCount, onClick,
}: ExploreContentCardProps) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-[var(--shadow-glow)] focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <AspectRatio ratio={16 / 9}>
        {coverUrl ? (
          <img src={coverUrl} alt={title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="h-full w-full bg-secondary flex items-center justify-center">
            {type === "game" ? <Play className="h-10 w-10 text-muted-foreground" /> : <BookOpen className="h-10 w-10 text-muted-foreground" />}
          </div>
        )}
      </AspectRatio>
      <div className="p-3 sm:p-4 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <h3 className="font-medium text-foreground line-clamp-1 flex-1 text-sm sm:text-base" style={{ wordBreak: "keep-all" }}>{title}</h3>
          {genre && <Badge variant="outline" className="text-[10px] shrink-0">{GENRE_LABELS[genre] || genre}</Badge>}
        </div>
        {protagonistName && (
          <p className="text-[11px] text-muted-foreground truncate">주인공: {protagonistName}</p>
        )}
        {synopsis && (
          <p className="text-xs text-muted-foreground line-clamp-2 hidden sm:block">{synopsis}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{likeCount}</span>
          <span className="flex items-center gap-1">
            {type === "game" ? <Play className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {playOrViewCount}
          </span>
        </div>
      </div>
    </button>
  );
}
