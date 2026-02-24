# Paystack Payments Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a read-only admin page at `/admin/payments` that lists all Paystack transactions, rendered inside the existing Admin shell.

**Architecture:** A `createServerFn` in `src/lib/paystack.ts` proxies the Paystack API server-side (keeping the secret key off the client). A `PaymentsPage` component calls it via `useQuery` and renders a paginated table. The page is wired as a `CustomRoute` inside the existing `<Admin>` component, exactly like the `CheckInPage` pattern.

**Tech Stack:** `@tanstack/react-start` (createServerFn), `@tanstack/react-query` (useQuery), `lucide-react` (icons), `shadcn/ui` (Table, Badge, Button, Skeleton), vitest + jsdom (tests)

---

### Task 1: Add environment variable

**Files:**
- Modify: `.env`

**Step 1: Add the key**

Append to `.env`:
```
PAYSTACK_SECRET_KEY=sk_live_YOUR_KEY_HERE
```

> Note: No `VITE_` prefix — this key is server-only. TanStack Start server functions have access to `process.env` without VITE prefix. Never expose this in client code.

**Step 2: Commit**

```bash
git add .env
git commit -m "config: add PAYSTACK_SECRET_KEY env var"
```

---

### Task 2: Create Paystack server function with tests

**Files:**
- Create: `src/lib/paystack.ts`
- Create: `src/lib/paystack.test.ts`

**Step 1: Write the failing test**

Create `src/lib/paystack.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the TanStack Start module so createServerFn works in test env
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: Function) => ({ __handler: fn }),
    }),
  }),
}));

// The types we expect from Paystack
type PaystackTransaction = {
  id: number;
  reference: string;
  amount: number;
  status: string;
  channel: string;
  paid_at: string;
  customer: { email: string };
};

describe("fetchPaystackTransactions handler", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
  });

  it("calls Paystack API with correct auth header and pagination params", async () => {
    const mockTransactions: PaystackTransaction[] = [
      {
        id: 1,
        reference: "ref_abc",
        amount: 1000000,
        status: "success",
        channel: "card",
        paid_at: "2026-02-24T10:00:00Z",
        customer: { email: "test@example.com" },
      },
    ];
    const mockResponse = {
      status: true,
      data: mockTransactions,
      meta: { total: 1, skipped: 0, perPage: 50, page: 1, pageCount: 1 },
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Import the handler function directly for testing
    const { fetchPaystackTransactions } = await import("./paystack");
    // @ts-ignore - accessing internal handler for test
    const result = await fetchPaystackTransactions.__handler({
      data: { page: 1, perPage: 50 },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction?perPage=50&page=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_abc123",
        }),
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].reference).toBe("ref_abc");
  });

  it("throws when PAYSTACK_SECRET_KEY is not set", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    const { fetchPaystackTransactions } = await import("./paystack");
    // @ts-ignore
    await expect(
      fetchPaystackTransactions.__handler({ data: { page: 1, perPage: 50 } }),
    ).rejects.toThrow("PAYSTACK_SECRET_KEY is not set");
  });

  it("throws on non-ok HTTP response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const { fetchPaystackTransactions } = await import("./paystack");
    // @ts-ignore
    await expect(
      fetchPaystackTransactions.__handler({ data: { page: 1, perPage: 50 } }),
    ).rejects.toThrow("Paystack API error: 401");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun run test src/lib/paystack.test.ts
```
Expected: FAIL — `Cannot find module './paystack'`

**Step 3: Create the server function**

Create `src/lib/paystack.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";

export type PaystackTransaction = {
  id: number;
  reference: string;
  amount: number; // in kobo
  status: "success" | "failed" | "abandoned";
  channel: string;
  paid_at: string | null;
  customer: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
};

export type PaystackMeta = {
  total: number;
  skipped: number;
  perPage: number;
  page: number;
  pageCount: number;
};

export type PaystackResponse = {
  status: boolean;
  data: PaystackTransaction[];
  meta: PaystackMeta;
};

export const fetchPaystackTransactions = createServerFn()
  .validator((input: { page: number; perPage: number }) => input)
  .handler(async ({ data }) => {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");

    const res = await fetch(
      `https://api.paystack.co/transaction?perPage=${data.perPage}&page=${data.page}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Paystack API error: ${res.status}`);
    }

    return res.json() as Promise<PaystackResponse>;
  });
```

**Step 4: Run tests to verify they pass**

```bash
bun run test src/lib/paystack.test.ts
```
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/lib/paystack.ts src/lib/paystack.test.ts
git commit -m "feat: add Paystack server function with tests"
```

---

### Task 3: Create the PaymentsPage component

**Files:**
- Create: `src/components/admin/payments-page.tsx`

**Step 1: Create the component**

Create `src/components/admin/payments-page.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchPaystackTransactions, type PaystackTransaction } from "@/lib/paystack";

const PER_PAGE = 50;

function statusVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  if (status === "success") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

function formatAmount(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TransactionRow({ tx }: { tx: PaystackTransaction }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
      <TableCell>{formatAmount(tx.amount)}</TableCell>
      <TableCell>
        <Badge variant={statusVariant(tx.status)} className="capitalize">
          {tx.status}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{tx.customer.email}</TableCell>
      <TableCell className="capitalize">{tx.channel}</TableCell>
      <TableCell className="text-muted-foreground text-sm">{formatDate(tx.paid_at)}</TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 6 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function PaymentsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["paystack-transactions", page, PER_PAGE],
    queryFn: () => fetchPaystackTransactions({ data: { page, perPage: PER_PAGE } }),
    staleTime: 60_000, // 1 min — Paystack data doesn't change that fast
  });

  const meta = data?.meta;
  const transactions = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-full p-3">
            <CreditCard className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
            {meta && (
              <p className="text-sm text-muted-foreground">
                {meta.total.toLocaleString()} transactions total
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-4 border border-red-200">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Failed to load payments:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Reference</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              <ChevronLeft className="size-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.pageCount || isLoading}
            >
              Next
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript is happy**

```bash
bun run typecheck
```
Expected: No errors related to `payments-page.tsx` or `paystack.ts`

**Step 3: Commit**

```bash
git add src/components/admin/payments-page.tsx
git commit -m "feat: add PaymentsPage component"
```

---

### Task 4: Add sidebar menu item

**Files:**
- Modify: `src/components/admin/app-sidebar.tsx`

**Step 1: Add the import and menu item**

In `src/components/admin/app-sidebar.tsx`:

Add `CreditCard` to the lucide imports at line 13:
```ts
import { ScanLine, CreditCard } from "lucide-react";
```

After `CheckInMenuItem` (around line 133), add:

```tsx
export const PaymentsMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/payments", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/payments" onClick={onClick}>
          <CreditCard />
          Payments
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
```

In the `AppSidebar` function, after `<CheckInMenuItem onClick={handleClick} />`, add:

```tsx
<PaymentsMenuItem onClick={handleClick} />
```

**Step 2: Run typecheck**

```bash
bun run typecheck
```
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/admin/app-sidebar.tsx
git commit -m "feat: add Payments link to sidebar"
```

---

### Task 5: Wire up the route

**Files:**
- Modify: `src/routes/admin/$.tsx`

**Step 1: Add import and route**

In `src/routes/admin/$.tsx`, add the import:

```ts
import { PaymentsPage } from "@/components/admin/payments-page";
```

Inside `<CustomRoutes>`, after the checkin route, add:

```tsx
<RouterRoute path="/payments" element={<PaymentsPage />} />
```

The full `<CustomRoutes>` block should look like:

```tsx
<CustomRoutes>
  <RouterRoute path="/checkin" element={<CheckInPage />} />
  <RouterRoute path="/payments" element={<PaymentsPage />} />
</CustomRoutes>
```

**Step 2: Run typecheck and lint**

```bash
bun run typecheck && bun run lint
```
Expected: No errors

**Step 3: Run full test suite**

```bash
bun run test
```
Expected: All tests pass (including the 3 paystack tests)

**Step 4: Build verification**

```bash
bun run build
```
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/routes/admin/$.tsx
git commit -m "feat: wire /admin/payments route to PaymentsPage"
```

---

### Task 6: Verify end-to-end (manual)

**Step 1:** Start dev server: `bun run dev`

**Step 2:** Navigate to `http://localhost:3000/admin`

**Step 3:** Confirm "Payments" link appears in sidebar

**Step 4:** Click it — should navigate to `/admin/payments`

**Step 5:** Confirm table loads with Paystack transactions (or shows a clear error if `PAYSTACK_SECRET_KEY` is not yet set with a real key)

**Step 6:** Confirm pagination works if there are > 50 transactions

---

## Notes

- The Paystack API key in `.env` starts with `sk_live_` for production or `sk_test_` for test mode. Use test mode key during development.
- The `Table`, `Badge`, `Skeleton`, `Button` components come from shadcn/ui — if any are missing, run: `bunx shadcn add table badge skeleton button`
- `createServerFn` from `@tanstack/react-start` runs only on the server — never in the browser bundle. The `PAYSTACK_SECRET_KEY` is never accessible client-side.
- The `staleTime: 60_000` means TanStack Query won't refetch the same page within 1 minute. Remove or lower this during debugging.
