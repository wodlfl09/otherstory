import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BookOpen, LogOut } from "lucide-react";

export default function Navbar() {
  const { user, signOut } = useAuth();

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/home" className="font-display text-lg font-bold tracking-wider text-foreground">
          AI <span className="text-primary">스토리</span> 게임
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            <Link to="/library">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <BookOpen className="h-4 w-4" />
                내 스토리
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
