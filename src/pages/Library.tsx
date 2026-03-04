import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { BookOpen, Pin, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface LibraryEntry {
  id: string;
  pinned: boolean;
  created_at: string;
  story: {
    id: string;
    title: string;
    genre: string;
    created_at: string;
  };
}

export default function Library() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const maxItems = profile?.plan === "pro" ? Infinity : profile?.plan === "basic" ? 9 : 3;

  useEffect(() => {
    if (!user) return;
    loadLibrary();
  }, [user]);

  const loadLibrary = async () => {
    const { data } = await supabase
      .from("library_items")
      .select("id, pinned, created_at, story:stories(id, title, genre, created_at)")
      .eq("user_id", user!.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    setItems((data as any) || []);
    setLoading(false);
  };

  const removeItem = async (id: string) => {
    await supabase.from("library_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("라이브러리에서 삭제되었습니다.");
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-4xl px-4 pt-24 pb-16">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">내 스토리 라이브러리</h1>
          <span className="text-sm text-muted-foreground">
            {items.length} / {maxItems === Infinity ? "∞" : maxItems}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12" />
            <p>아직 저장된 스토리가 없습니다.</p>
            <Button onClick={() => navigate("/home")}>새 스토리 시작하기</Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="card-glow rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">{item.story?.title || "제목 없음"}</h3>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">{item.story?.genre}</p>
                  </div>
                  <div className="flex gap-1">
                    {item.pinned && <Pin className="h-4 w-4 text-primary" />}
                    <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
