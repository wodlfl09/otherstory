import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/AuthContext";
import UpgradeModal from "@/components/UpgradeModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";

export default function CreateStory() {
  const [searchParams] = useSearchParams();
  const genre = searchParams.get("genre") || "sf";
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [name, setName] = useState("");
  const [gender, setGender] = useState("male");
  const [protagonist, setProtagonist] = useState("");
  const [keywords, setKeywords] = useState("");
  const [customStory, setCustomStory] = useState("");
  const [duration, setDuration] = useState("10");
  const [choicesCount, setChoicesCount] = useState("2");
  const [endingsCount, setEndingsCount] = useState("2");
  const [loading, setLoading] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature: string; plan: string }>({
    open: false, feature: "", plan: "",
  });
  const [creditModal, setCreditModal] = useState(false);

  const plan = profile?.plan || "free";

  const checkPlanAccess = (feature: string, requiredPlan: string): boolean => {
    const planRank = { free: 0, basic: 1, pro: 2 };
    if (planRank[plan] < planRank[requiredPlan as keyof typeof planRank]) {
      setUpgradeModal({ open: true, feature, plan: requiredPlan });
      return false;
    }
    return true;
  };

  const handleStart = async () => {
    if (!user) return;
    if (!name.trim()) { toast.error("이름을 입력해주세요."); return; }

    const dur = parseInt(duration);
    if (dur > 10 && !checkPlanAccess(`${dur}분 플레이`, dur > 20 ? "pro" : "basic")) return;
    if (choicesCount === "3" && !checkPlanAccess("선택지 3개", "basic")) return;
    if (endingsCount === "3" && !checkPlanAccess("결말 3개", "basic")) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-session", {
        body: {
          genre,
          name,
          gender,
          protagonist,
          keywords,
          customStory,
          duration_min: dur,
          choices_count: parseInt(choicesCount),
          endings_count: parseInt(endingsCount),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      navigate(`/game/${data.session_id}`);
    } catch (err: any) {
      toast.error(err.message || "세션 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-2xl px-4 pt-24 pb-16">
        <h1 className="mb-8 font-display text-2xl font-bold">
          새 스토리 만들기 — <span className="capitalize text-primary">{genre}</span>
        </h1>

        <Tabs defaultValue="simple">
          <TabsList className="mb-6 w-full bg-secondary">
            <TabsTrigger value="simple" className="flex-1">Simple</TabsTrigger>
            <TabsTrigger value="custom" className="flex-1">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>이름</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="주인공 이름" className="bg-secondary" />
              </div>
              <div className="space-y-2">
                <Label>성별</Label>
                <RadioGroup value={gender} onValueChange={setGender} className="flex gap-4 pt-2">
                  <div className="flex items-center gap-2"><RadioGroupItem value="male" id="m" /><Label htmlFor="m">남성</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="female" id="f" /><Label htmlFor="f">여성</Label></div>
                </RadioGroup>
              </div>
            </div>
            <div className="space-y-2">
              <Label>주인공 설정 (선택)</Label>
              <Input value={protagonist} onChange={(e) => setProtagonist(e.target.value)} placeholder="예: 우주 해적 선장" className="bg-secondary" />
            </div>
            <div className="space-y-2">
              <Label>키워드 (선택)</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="예: 시간여행, 복수" className="bg-secondary" />
            </div>
          </TabsContent>

          <TabsContent value="custom" className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>이름</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="주인공 이름" className="bg-secondary" />
              </div>
              <div className="space-y-2">
                <Label>성별</Label>
                <RadioGroup value={gender} onValueChange={setGender} className="flex gap-4 pt-2">
                  <div className="flex items-center gap-2"><RadioGroupItem value="male" id="m2" /><Label htmlFor="m2">남성</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="female" id="f2" /><Label htmlFor="f2">여성</Label></div>
                </RadioGroup>
              </div>
            </div>
            <div className="space-y-2">
              <Label>주인공 설정</Label>
              <Input value={protagonist} onChange={(e) => setProtagonist(e.target.value)} placeholder="예: 우주 해적 선장" className="bg-secondary" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>스토리 입력</Label>
                {plan === "pro" && (
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary">
                    <Wand2 className="h-3.5 w-3.5" /> 자동 생성
                  </Button>
                )}
              </div>
              <Textarea
                value={customStory}
                onChange={(e) => setCustomStory(e.target.value)}
                placeholder="원하는 스토리 설정을 자유롭게 입력하세요..."
                rows={5}
                className="bg-secondary"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Game settings */}
        <div className="mt-8 space-y-5 rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-sm font-bold tracking-wider text-muted-foreground">게임 설정</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">플레이 시간</Label>
              <RadioGroup value={duration} onValueChange={setDuration} className="space-y-1">
                <div className="flex items-center gap-2"><RadioGroupItem value="10" id="d10" /><Label htmlFor="d10" className="text-sm">10분</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="20" id="d20" /><Label htmlFor="d20" className="text-sm">20분 {plan === "free" && "🔒"}</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="30" id="d30" /><Label htmlFor="d30" className="text-sm">30분 {plan !== "pro" && "🔒"}</Label></div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">선택지 수</Label>
              <RadioGroup value={choicesCount} onValueChange={setChoicesCount} className="space-y-1">
                <div className="flex items-center gap-2"><RadioGroupItem value="2" id="c2" /><Label htmlFor="c2" className="text-sm">2개</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="3" id="c3" /><Label htmlFor="c3" className="text-sm">3개 {plan === "free" && "🔒"}</Label></div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">결말 수</Label>
              <RadioGroup value={endingsCount} onValueChange={setEndingsCount} className="space-y-1">
                <div className="flex items-center gap-2"><RadioGroupItem value="2" id="e2" /><Label htmlFor="e2" className="text-sm">2개</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="3" id="e3" /><Label htmlFor="e3" className="text-sm">3개 {plan === "free" && "🔒"}</Label></div>
              </RadioGroup>
            </div>
          </div>
        </div>

        <Button onClick={handleStart} disabled={loading} className="mt-8 w-full py-6 text-lg font-bold animate-pulse-glow">
          {loading ? "생성 중..." : "🚀 모험 시작하기"}
        </Button>

        <UpgradeModal
          open={upgradeModal.open}
          onOpenChange={(open) => setUpgradeModal((p) => ({ ...p, open }))}
          feature={upgradeModal.feature}
          requiredPlan={upgradeModal.plan}
        />
      </div>
    </div>
  );
}
