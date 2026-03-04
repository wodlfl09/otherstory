import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Check, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "무료",
    features: [
      "가입 크레딧 20",
      "선택지 2개 / 결말 2개",
      "10분 플레이",
      "라이브러리 3개",
      "광고 포함",
    ],
  },
  {
    id: "basic",
    name: "Basic",
    price: "$30/월",
    features: [
      "크레딧 100/월",
      "선택지 3개 / 결말 3개",
      "10/20분 플레이",
      "라이브러리 9개",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$50/월",
    popular: true,
    features: [
      "크레딧 300/월",
      "🪄 자동 스토리 생성",
      "선택지 3개 / 결말 3개",
      "10/20/30분 플레이",
      "라이브러리 무제한",
      "광고 없음",
    ],
  },
];

export default function Billing() {
  const { profile } = useAuth();

  const handleSubscribe = (planId: string) => {
    toast.info("Stripe 결제 연동 준비 중입니다.");
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <div className="mb-12 text-center">
          <h1 className="font-display text-3xl font-bold">플랜 & 요금</h1>
          <p className="mt-2 text-muted-foreground">나에게 맞는 플랜을 선택하세요</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = profile?.plan === plan.id;
            return (
              <div
                key={plan.id}
                className={`card-glow relative rounded-2xl border p-6 ${
                  plan.popular ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> 인기
                  </div>
                )}
                <h3 className="font-display text-lg font-bold">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold text-foreground">{plan.price}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={plan.popular ? "default" : "outline"}
                  disabled={isCurrent}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {isCurrent ? "현재 플랜" : plan.id === "free" ? "무료 시작" : "구독하기"}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Credits */}
        <div className="mt-16 rounded-2xl border border-border bg-card p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-accent" />
            <h2 className="font-display text-xl font-bold">크레딧 충전</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">1회 결제로 크레딧을 추가 구매할 수 있습니다.</p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => toast.info("준비 중")}>50 크레딧 — $10</Button>
            <Button variant="outline" onClick={() => toast.info("준비 중")}>150 크레딧 — $25</Button>
            <Button onClick={() => toast.info("준비 중")}>500 크레딧 — $70</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
