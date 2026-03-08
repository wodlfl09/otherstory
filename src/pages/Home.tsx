import Navbar from "@/components/Navbar";
import GenreGrid from "@/components/GenreCard";
import MasonryGallery from "@/components/home/MasonryGallery";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles } from "lucide-react";

export default function Home() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero — short & punchy */}
      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 gradient-glow" />
        <div className="relative container mx-auto px-4 py-12 text-center md:py-16">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            AI가 만드는 몰입형 인터랙티브 소설
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight text-foreground md:text-5xl lg:text-6xl">
            당신만의 <span className="text-glow text-primary">이야기</span>를 시작하세요
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground md:text-base">
            장르를 선택하면 AI가 소설 수준의 몰입감 있는 스토리와 삽화를 실시간으로 만들어냅니다.
          </p>
          {profile && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm text-muted-foreground">
              💎 <span className="font-bold text-accent">{profile.credits}</span>
              <span className="text-border">|</span>
              <span className="font-bold text-primary uppercase">{profile.plan}</span>
            </div>
          )}
        </div>
      </section>

      {/* Genre Quick-Select */}
      <section className="container mx-auto px-4 pb-6">
        <h2 className="mb-4 font-display text-sm font-bold tracking-wider text-muted-foreground uppercase">
          장르 선택
        </h2>
        <GenreGrid />
      </section>

      {/* Animated Masonry Gallery */}
      <section className="container mx-auto px-4 pb-20">
        <h2 className="mb-6 font-display text-xl font-bold tracking-wider text-foreground">
          🔥 지금 인기 있는 작품
        </h2>
        <MasonryGallery />
      </section>
    </div>
  );
}
