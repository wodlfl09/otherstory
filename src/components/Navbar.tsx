import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BookOpen, Compass, LogOut, Crown, ChevronDown, Shield } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const role = (profile as any)?.role;

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/home" className="font-display text-lg font-bold tracking-wider text-foreground">
          AI <span className="text-primary">스토리</span> 게임
        </Link>

        {user && (
          <div className="flex items-center gap-2">
            <Link to="/explore">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <Compass className="h-4 w-4" />
                탐색
              </Button>
            </Link>
            <Link to="/library">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <BookOpen className="h-4 w-4" />
                내 스토리
              </Button>
            </Link>

            {/* Credits dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-sm">
                  💎 {profile?.credits ?? 0}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground">현재 플랜</p>
                  <p className="font-bold text-foreground uppercase">{profile?.plan || "free"}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/pricing")} className="gap-2">
                  <Crown className="h-4 w-4" />플랜 & 요금
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {(role === "admin" || role === "subadmin") && (
              <Link to="/admin">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                  <Shield className="h-4 w-4" />
                </Button>
              </Link>
            )}

            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
