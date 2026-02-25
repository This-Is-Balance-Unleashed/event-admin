import { useState } from "react";
import { useNotify } from "ra-core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAdminUsers, inviteAdminUser } from "@/lib/admin-users";
import type { AdminUser } from "@/lib/admin-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, UserPlus, X } from "lucide-react";

export function AdminsPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listAdminUsers(),
    staleTime: 60_000,
  });

  const { mutate: invite, isPending } = useMutation({
    mutationFn: (emailToInvite: string) =>
      inviteAdminUser({ data: { email: emailToInvite } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      notify("Invitation sent successfully", { type: "success" });
      setEmail("");
      setShowInvite(false);
    },
    onError: (err: Error) => {
      notify(err.message, { type: "error" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (trimmed) invite(trimmed);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Admins</h1>
        </div>
        {!showInvite && (
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Admin
          </Button>
        )}
      </div>

      {showInvite && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 p-4 border rounded-lg"
        >
          <Input
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="max-w-sm"
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending..." : "Send Invite"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowInvite(false);
              setEmail("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 rounded p-3">
          Failed to load admins: {(error as Error).message}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Last Sign In</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                  </TableRow>
                ))
              : users.map((user: AdminUser) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email ?? "—"}</TableCell>
                    <TableCell>
                      {user.last_sign_in_at
                        ? new Date(user.last_sign_in_at).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
