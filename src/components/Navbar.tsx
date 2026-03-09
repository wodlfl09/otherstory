import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BookOpen, Compass, LogOut, Crown, ChevronDown, Shield, Menu, Home, Gem } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/home": "홈",
  "/explore": "탐색",
  "/library": "내 스토리",
  "/pricing": "요금제",
  "/create": "새 스토리",
};

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = (profile as any)?.role;

  const currentTitle = PAGE_TITLES[location.pathname] || "";

  return (
    <>
      {/* Top navbar */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-12 sm:h-14 items-center justify-between px-3 sm:px-4">
          {/* Left: Logo */}
          <Link to="/home" className="shrink-0 font-display text-sm sm:text-lg font-bold tracking-wider text-foreground whitespace-nowrap">
            AI<span className="text-primary">스토리</span>
          </Link>

          {/* Center: Page title (mobile only) */}
          <span className="sm:hidden text-xs font-medium text-muted-foreground truncate mx-2">
            {currentTitle}
          </span>

          {/* Desktop nav links */}
          {user && (
            <div className="hidden sm:flex items-center gap-1">
              <Link to="/explore">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground text-sm">
                  <Compass className="h-4 w-4" />탐색
                </Button>
              </Link>
              <Link to="/library">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground text-sm">
                  <BookOpen className="h-4 w-4" />내 스토리
                </Button>
              </Link>
            </div>
          )}

          {/* Right side */}
          {user && (
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Credits chip - compact on mobile */}
              <button
                onClick={() => navigate("/pricing")}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 sm:px-2.5 sm:py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                <Gem className="h-3 w-3" />
                <span>{profile?.credits ?? 0}</span>
              </button>

              {/* Admin (icon only) */}
              {(role === "admin" || role === "subadmin") && (
                <Link to="/admin/users" className="hidden sm:block">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground p-1.5">
                    <Shield className="h-4 w-4" />
                  </Button>
                </Link>
              )}

              {/* Desktop: logout button */}
              <Button variant="ghost" size="sm" onClick={signOut} className="hidden sm:flex text-muted-foreground hover:text-foreground p-1.5">
                <LogOut className="h-4 w-4" />
              </Button>

              {/* Mobile: hamburger menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="sm:hidden p-1.5 text-muted-foreground hover:text-foreground">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-card border-border">
                  <DropdownMenuItem onClick={() => navigate("/explore")} className="gap-2 text-sm">
                    <Compass className="h-4 w-4" />탐색
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/library")} className="gap-2 text-sm">
                    <BookOpen className="h-4 w-4" />내 스토리
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/pricing")} className="gap-2 text-sm">
                    <Crown className="h-4 w-4" />플랜 & 요금
                  </DropdownMenuItem>
                  {(role === "admin" || role === "subadmin") && (
                    <DropdownMenuItem onClick={() => navigate("/admin/users")} className="gap-2 text-sm">
                      <Shield className="h-4 w-4" />관리자
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive">
                    <LogOut className="h-4 w-4" />로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      {user && (
        <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl safe-area-bottom">
          <div className="flex items-center justify-around h-14 px-2">
            {[
              { path: "/home", icon: Home, label: "홈" },
              { path: "/explore", icon: Compass, label: "탐색" },
              { path: "/library", icon: BookOpen, label: "내 스토리" },
            ].map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
