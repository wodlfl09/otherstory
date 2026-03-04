import Navbar from "@/components/Navbar";
import GenreGrid from "@/components/GenreCard";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles } from "lucide-react";

export default function Home() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 gradient-glow" />
        <div className="relative container mx-auto px-4 py-20 text-center md:py-32">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            AI가 만드는 몰입형 인터랙티브 소설
          </div>
          <h1 className="font-display text-4xl font-black tracking-tight text-foreground md:text-6xl lg:text-7xl">
            당신만의 <span className="text-glow text-primary">이야기</span>를<br />
            시작하세요
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            장르를 선택하면 AI가 소설 수준의 몰입감 있는 스토리와 삽화를 실시간으로 만들어냅니다.
            매 선택이 결말을 바꿉니다.
          </p>
          {profile && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm text-muted-foreground">
              크레딧: <span className="font-bold text-accent">{profile.credits}</span>
              <span className="text-border">|</span>
              플랜: <span className="font-bold text-primary uppercase">{profile.plan}</span>
            </div>
          )}
        </div>
      </section>

      {/* Genre Grid */}
      <section className="container mx-auto px-4 pb-20">
        <h2 className="mb-8 font-display text-xl font-bold tracking-wider text-foreground">
          장르 선택
        </h2>
        <GenreGrid />
      </section>
    </div>
  );
}
