import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import GenreGrid from "@/components/GenreCard";
import MasonryGallery from "@/components/home/MasonryGallery";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function Home() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [activeJob, setActiveJob] = useState<any>(null);

  // Check for active generation jobs
  useEffect(() => {
    if (!user) return;
    const checkActiveJobs = async () => {
      const { data } = await supabase
        .from("generation_jobs")
        .select("id, status, progress_percent, current_stage, eta_seconds")
        .eq("user_id", user.id)
        .not("status", "in", '("completed","failed")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveJob(data);
    };
    checkActiveJobs();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Active generation banner */}
      {activeJob && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md cursor-pointer"
          onClick={() => navigate(`/generating/${activeJob.id}`)}
        >
          <div className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-md shadow-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              게임 생성 중 — 터치하여 확인
            </div>
            <Progress value={activeJob.progress_percent || 0} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{activeJob.current_stage}</span>
              <span>{activeJob.progress_percent || 0}%</span>
            </div>
          </div>
        </div>
      )}

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
