import Navbar from "@/components/Navbar";
import GenreGrid from "@/components/GenreCard";
import MasonryGallery from "@/components/home/MasonryGallery";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Compact hero */}
      <section className="relative pt-16">
        <div className="absolute inset-0 gradient-glow opacity-60" />
        <div className="relative container mx-auto px-4 py-8 md:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-black tracking-tight text-foreground md:text-3xl lg:text-4xl">
              선택이 <span className="text-glow text-primary">운명</span>을 바꾼다
            </h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm max-w-md">
              짧은 장면, 강한 선택 — AI 시네마 스토리 게임
            </p>
          </div>
          <div className="flex items-center gap-3">
            {profile && (
              <div className="inline-flex items-center gap-2 rounded-full bg-secondary/80 backdrop-blur-sm px-3 py-1.5 text-xs text-muted-foreground border border-border">
                💎 <span className="font-bold text-accent">{profile.credits}</span>
                <span className="text-border">|</span>
                <span className="font-bold text-primary uppercase">{profile.plan}</span>
              </div>
            )}
            <button
              onClick={() => navigate("/create")}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              새 게임
            </button>
          </div>
        </div>
      </section>

      {/* Genre Quick-Select */}
      <section className="container mx-auto px-4 pb-6">
        <h2 className="mb-4 font-display text-sm font-bold tracking-wider text-muted-foreground uppercase">
          장르 선택
        </h2>
        <GenreGrid />
      </section>

      {/* Gallery */}
      <section className="px-2 sm:px-4 lg:px-6 pb-20">
        <h2 className="mb-4 px-2 font-display text-lg font-bold tracking-wider text-foreground">
          🔥 인기 작품
        </h2>
        <MasonryGallery />
      </section>
    </div>
  );
}
