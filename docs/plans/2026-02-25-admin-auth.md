# Admin Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire Supabase authentication to protect all admin routes, update login page branding, and add an Admins page where a super-admin can invite new admins by email.

**Architecture:** `supabaseAuthProvider` from `ra-supabase-core` wraps the existing `supabaseClient` and is passed to the `<Admin>` component with `requireAuth`. A dedicated `/admin/admins` custom route hosts the invite UI; server functions call `supabase.auth.admin.*` with the service role key (server-only). The pattern mirrors how `PaymentsPage` and Paystack server functions are structured.

**Tech Stack:** ra-supabase-core (supabaseAuthProvider), @supabase/supabase-js (SupabaseClient), TanStack Start (createServerFn), @tanstack/react-query v5, vitest

---

### Task 1: Create auth provider and wire into Admin

**Files:**
- Create: `src/lib/auth-provider.ts`
- Modify: `src/routes/admin/$.tsx` (lines 32–38 — `<Admin>` props)

No test file for this task — `supabaseAuthProvider` is a third-party wrapper; integration testing requires a live Supabase instance.

**Step 1: Create `src/lib/auth-provider.ts`**

```ts
import { supabaseAuthProvider } from "ra-supabase-core";
import { supabaseClient } from "./supabase-provider";

export const authProvider = supabaseAuthProvider(supabaseClient, {
  getIdentity: async (user) => ({
    id: user.id,
    fullName: user.user_metadata?.full_name ?? user.email ?? user.id,
    email: user.email,
    avatar: user.user_metadata?.avatar_url,
  }),
});
```

**Step 2: Wire `authProvider` and `requireAuth` into Admin**

In `src/routes/admin/$.tsx`, add the import and two props:

```ts
// Add import at top (line ~13, after other lib imports)
import { authProvider } from "@/lib/auth-provider";
```

Change the `<Admin>` opening tag (currently line 33) from:
```tsx
<Admin
  dataProvider={dataProvider}
  routerProvider={tanStackRouterProvider}
  basename="/admin"
  title="Hit Refresh Admin"
  disableTelemetry
>
```
to:
```tsx
<Admin
  dataProvider={dataProvider}
  authProvider={authProvider}
  routerProvider={tanStackRouterProvider}
  basename="/admin"
  title="Hit Refresh Admin"
  disableTelemetry
  requireAuth
>
```

**Step 3: Run typecheck to verify**

```bash
bun run typecheck
```

Expected: no new errors.

**Step 4: Commit**

```bash
git add src/lib/auth-provider.ts src/routes/admin/$.tsx
git commit -m "feat: wire supabase auth provider into Admin with requireAuth"
```

---

### Task 2: Update login page branding

**Files:**
- Modify: `src/components/admin/login-page.tsx` (lines 70, 74–80, 87)

No test file — pure UI change.

**Step 1: Open `src/components/admin/login-page.tsx` and make these exact edits**

Change line 70 from:
```tsx
            Acme Inc
```
to:
```tsx
            Hit Refresh Admin
```

Replace the blockquote block (lines 72–81) from:
```tsx
          <div className="relative z-20 mt-auto">
            <blockquote className="space-y-2">
              <p className="text-lg">
                &ldquo;Shadcn Admin Kit has allowed us to quickly create and evolve a powerful tool
                that otherwise would have taken months of time and effort to develop.&rdquo;
              </p>
              <footer className="text-sm">John Doe</footer>
            </blockquote>
          </div>
```
to:
```tsx
          <div className="relative z-20 mt-auto">
            <p className="text-sm text-zinc-400">
              Hit Refresh Conference — Feb 28, 2026, Lagos
            </p>
          </div>
```

Replace line 87 (the dummy credentials hint) from:
```tsx
              <p className="text-sm leading-none text-muted-foreground">
                Try janedoe@acme.com / password
              </p>
```
to:
```tsx
              <p className="text-sm leading-none text-muted-foreground">
                Admin access only
              </p>
```

**Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/admin/login-page.tsx
git commit -m "fix: update login page branding to Hit Refresh Admin"
```

---

### Task 3: Admin users handler with tests (TDD)

**Files:**
- Create: `src/lib/admin-users-handler.ts`
- Create: `src/lib/admin-users.test.ts`

**Step 1: Write the failing test first**

Create `src/lib/admin-users.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listAdminUsersHandler, inviteAdminUserHandler } from "./admin-users-handler";

const mockListUsers = vi.fn();
const mockInviteUser = vi.fn();

const mockClient = {
  auth: {
    admin: {
      listUsers: mockListUsers,
      inviteUserByEmail: mockInviteUser,
    },
  },
} as unknown as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAdminUsersHandler", () => {
  it("returns mapped users on success", async () => {
    mockListUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: "uuid-1",
            email: "admin@test.com",
            last_sign_in_at: "2026-02-25T10:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    });

    const result = await listAdminUsersHandler(mockClient);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "uuid-1",
      email: "admin@test.com",
      last_sign_in_at: "2026-02-25T10:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("throws on Supabase error", async () => {
    mockListUsers.mockResolvedValueOnce({
      data: null,
      error: new Error("Auth admin error"),
    });

    await expect(listAdminUsersHandler(mockClient)).rejects.toThrow("Auth admin error");
  });
});

describe("inviteAdminUserHandler", () => {
  it("calls inviteUserByEmail with correct email", async () => {
    mockInviteUser.mockResolvedValueOnce({ error: null });

    await inviteAdminUserHandler(mockClient, "new@test.com");

    expect(mockInviteUser).toHaveBeenCalledWith("new@test.com");
  });

  it("throws on Supabase error", async () => {
    mockInviteUser.mockResolvedValueOnce({
      error: new Error("Email already registered"),
    });

    await expect(inviteAdminUserHandler(mockClient, "dup@test.com")).rejects.toThrow(
      "Email already registered",
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
bun run test src/lib/admin-users.test.ts
```

Expected: FAIL — "Cannot find module './admin-users-handler'"

**Step 3: Create `src/lib/admin-users-handler.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminUser {
  id: string;
  email: string | undefined;
  last_sign_in_at: string | undefined;
  created_at: string;
}

export async function listAdminUsersHandler(client: SupabaseClient): Promise<AdminUser[]> {
  const { data, error } = await client.auth.admin.listUsers();
  if (error) throw error;
  return data.users.map((u) => ({
    id: u.id,
    email: u.email,
    last_sign_in_at: u.last_sign_in_at,
    created_at: u.created_at,
  }));
}

export async function inviteAdminUserHandler(
  client: SupabaseClient,
  email: string,
): Promise<void> {
  const { error } = await client.auth.admin.inviteUserByEmail(email);
  if (error) throw error;
}
```

**Step 4: Run tests to verify they pass**

```bash
bun run test src/lib/admin-users.test.ts
```

Expected: PASS — 4 tests passing

**Step 5: Commit**

```bash
git add src/lib/admin-users-handler.ts src/lib/admin-users.test.ts
git commit -m "feat: add admin users handler with tests"
```

---

### Task 4: Admin users server functions (thin wrapper)

**Files:**
- Create: `src/lib/admin-users.ts`

**Step 1: Create `src/lib/admin-users.ts`**

Follow the exact same pattern as `src/lib/paystack.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import { listAdminUsersHandler, inviteAdminUserHandler } from "./admin-users-handler";

export type { AdminUser } from "./admin-users-handler";

export const listAdminUsers = createServerFn().handler(() =>
  listAdminUsersHandler(supabaseClient),
);

export const inviteAdminUser = createServerFn()
  .inputValidator((input: { email: string }) => input)
  .handler(({ data }) => inviteAdminUserHandler(supabaseClient, data.email));
```

**Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/lib/admin-users.ts
git commit -m "feat: add admin users server functions (list, invite)"
```

---

### Task 5: Admins page component + sidebar + route

**Files:**
- Create: `src/components/admin/admins-page.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`
- Modify: `src/routes/admin/$.tsx`

**Step 1: Create `src/components/admin/admins-page.tsx`**

```tsx
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
```

**Step 2: Add `AdminsMenuItem` to `src/components/admin/app-sidebar.tsx`**

Add `ShieldCheck` to the lucide import on line 13:
```ts
import { CreditCard, ScanLine, ShieldCheck } from "lucide-react";
```

Add this component after `PaymentsMenuItem` (after line 148):
```tsx
export const AdminsMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/admins", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/admins" onClick={onClick}>
          <ShieldCheck />
          Admins
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
```

Then in the `AppSidebar` function, add `<AdminsMenuItem onClick={handleClick} />` after `<PaymentsMenuItem onClick={handleClick} />` (line 75):
```tsx
              <CheckInMenuItem onClick={handleClick} />
              <PaymentsMenuItem onClick={handleClick} />
              <AdminsMenuItem onClick={handleClick} />
```

**Step 3: Wire the route in `src/routes/admin/$.tsx`**

Add the import at the top (after the `PaymentsPage` import):
```ts
import { AdminsPage } from "@/components/admin/admins-page";
```

Add the route inside `<CustomRoutes>` (after the payments route):
```tsx
        <RouterRoute path="/payments" element={<PaymentsPage />} />
        <RouterRoute path="/admins" element={<AdminsPage />} />
```

**Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/components/admin/admins-page.tsx src/components/admin/app-sidebar.tsx src/routes/admin/$.tsx
git commit -m "feat: add Admins page with invite admin form and sidebar entry"
```

---

## Final Verification

After all tasks, run the full test suite and typecheck:

```bash
bun run test
bun run typecheck
```

Expected:
- All tests pass (including the 4 new admin-users handler tests)
- No TypeScript errors
