import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2 } from "lucide-react";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const loadUsers = async (p = 0) => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("admin-manage", {
      body: { action: "list_users", search: search || undefined, page: p },
    });
    setUsers(data?.users || []);
    setPage(p);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 user_id 검색"
            className="bg-secondary pl-9"
            onKeyDown={(e) => e.key === "Enter" && loadUsers(0)}
          />
        </div>
        <Button onClick={() => loadUsers(0)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "검색"}
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary">
              <TableHead>이름</TableHead>
              <TableHead>User ID</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>플랜</TableHead>
              <TableHead className="text-right">크레딧</TableHead>
              <TableHead className="text-right">가입일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  검색 버튼을 눌러 유저를 조회하세요.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">{u.user_id}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : u.role === "subadmin" ? "secondary" : "outline"}>
                    {u.role || "user"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.plan}</TableCell>
                <TableCell className="text-right font-medium text-accent">{u.credits}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {users.length > 0 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => loadUsers(page - 1)}>이전</Button>
          <span className="flex items-center text-sm text-muted-foreground">페이지 {page + 1}</span>
          <Button variant="outline" size="sm" disabled={users.length < 50} onClick={() => loadUsers(page + 1)}>다음</Button>
        </div>
      )}
    </div>
  );
}
