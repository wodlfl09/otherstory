import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import { NavLink, Outlet, Navigate } from "react-router-dom";
import { Shield, Users, Coins, UserCog, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminLayout() {
  const { profile } = useAuth();
  const role = (profile as any)?.role || "user";

  if (role !== "admin" && role !== "subadmin") {
    return <Navigate to="/admin/bootstrap" replace />;
  }

  const links = [
    { to: "/admin/users", icon: Users, label: "유저 관리", roles: ["admin", "subadmin"] },
    { to: "/admin/credits", icon: Coins, label: "크레딧", roles: ["admin", "subadmin"] },
    { to: "/admin/roles", icon: UserCog, label: "역할 관리", roles: ["admin"] },
  ].filter((l) => l.roles.includes(role));

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-bold">관리자 패널</h1>
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{role}</span>
        </div>

        <nav className="flex gap-1 rounded-lg bg-secondary p-1 mb-6">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              <l.icon className="h-4 w-4" />
              {l.label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>
    </div>
  );
}
