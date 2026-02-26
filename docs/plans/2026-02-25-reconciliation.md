# Payment Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/admin/reconciliation` page that lists tickets with successful Paystack payments but still `reserved` in Supabase, with bulk-select checkboxes and a "Resolve Selected" action that generates QR codes and marks tickets as `paid`.

**Architecture:** Three-layer pattern (handler → server function wrapper → UI component), matching the existing PaymentsPage and AdminsPage patterns. A pure `reconciliation-handler.ts` file handles Paystack API cross-referencing and QR code generation; thin `createServerFn` wrappers in `reconciliation.ts`; a `ReconciliationPage` component handles bulk checkbox state and mutation.

**Tech Stack:** TanStack Start (`createServerFn`), @tanstack/react-query v5, `qrcode` npm package, Supabase JS client (storage + table ops), vitest, lucide-react

---

### Task 0: Install qrcode dependency

**Files:**

- Modify: `package.json` (via bun add)

**Step 1: Install the package**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun add qrcode && bun add -d @types/qrcode
```

Expected output: package.json updated with `qrcode` in dependencies and `@types/qrcode` in devDependencies.

**Step 2: Verify import resolves**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run typecheck 2>&1 | grep -i qrcode || echo "qrcode types OK"
```

Expected: no qrcode-related type errors.

**Step 3: Commit**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && git add package.json bun.lock && git commit -m "chore: install qrcode dependency for QR code generation"
```

---

### Task 1: Reconciliation handler + tests (TDD)

**Files:**

- Create: `src/lib/reconciliation-handler.ts`
- Create: `src/lib/reconciliation.test.ts`

The handler takes `SupabaseClient` as a dependency (testable pattern, same as `admin-users-handler.ts`). The `parseReference` utility is exported separately so it can be unit-tested in isolation.

**Step 1: Write the failing test file first**

Create `src/lib/reconciliation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Must mock qrcode BEFORE importing the handler (hoisting)
vi.mock("qrcode", () => ({
  default: {
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-qr-png")),
  },
}));

import {
  parseReference,
  getReconciliationDataHandler,
  resolveTicketsHandler,
} from "./reconciliation-handler";

// ─── parseReference (pure function, no mocks needed) ───────────────────────

describe("parseReference", () => {
  it("strips trailing -N suffix and returns position", () => {
    expect(parseReference("1771972002656_gbs248-2")).toEqual({
      baseRef: "1771972002656_gbs248",
      position: 2,
    });
  });

  it("handles -1 single-ticket suffix", () => {
    expect(parseReference("1771944180130_npmaz-1")).toEqual({
      baseRef: "1771944180130_npmaz",
      position: 1,
    });
  });

  it("returns position 1 and original string when no -N suffix", () => {
    expect(parseReference("plainref")).toEqual({
      baseRef: "plainref",
      position: 1,
    });
  });
});

// ─── getReconciliationDataHandler ──────────────────────────────────────────

describe("getReconciliationDataHandler", () => {
  const PAYSTACK_SUCCESS_PAGE = {
    status: true,
    data: [
      {
        reference: "1771972002656_gbs248",
        amount: 205000,
        channel: "bank_transfer",
        paid_at: "2026-02-24T10:00:00Z",
      },
    ],
    meta: { page: 1, pageCount: 1 },
  };

  const SUPABASE_RESERVED_TICKETS = [
    {
      id: "ticket-uuid-1",
      email: "test@example.com",
      name: "Test User",
      paystack_reference: "1771972002656_gbs248-1",
      ticket_type_id: "type-uuid",
      price_paid: 205000,
      status: "reserved",
      group_booking_id: null,
      event_id: "event-uuid",
    },
    {
      id: "ticket-uuid-2",
      email: "test@example.com",
      name: "Test User",
      paystack_reference: "1771972002656_gbs248-2",
      ticket_type_id: "type-uuid",
      price_paid: 205000,
      status: "reserved",
      group_booking_id: null,
      event_id: "event-uuid",
    },
  ];

  function makeMockClient(ticketData: unknown[], ticketError = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: ticketData, error: ticketError }),
      }),
    } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
  });

  it("returns affected tickets whose base reference matches a Paystack success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => PAYSTACK_SUCCESS_PAGE,
    } as Response);

    const client = makeMockClient(SUPABASE_RESERVED_TICKETS);
    const result = await getReconciliationDataHandler(client);

    expect(result).toHaveLength(2);
    expect(result[0].base_reference).toBe("1771972002656_gbs248");
    expect(result[0].position).toBe(1);
    expect(result[1].position).toBe(2);
  });

  it("excludes reserved tickets that have no matching Paystack success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, data: [], meta: { page: 1, pageCount: 1 } }),
    } as Response);

    const client = makeMockClient(SUPABASE_RESERVED_TICKETS);
    const result = await getReconciliationDataHandler(client);

    expect(result).toHaveLength(0);
  });

  it("throws when PAYSTACK_SECRET_KEY is not set", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const client = makeMockClient([]);
    await expect(getReconciliationDataHandler(client)).rejects.toThrow(
      "PAYSTACK_SECRET_KEY is not set",
    );
  });
});

// ─── resolveTicketsHandler ─────────────────────────────────────────────────

describe("resolveTicketsHandler", () => {
  const TICKET = {
    id: "ticket-uuid-1",
    email: "test@example.com",
    name: "Test User",
    paystack_reference: "1771972002656_gbs248-1",
    event_id: "event-uuid",
    group_booking_id: null,
    ticket_secret: null,
    qr_code_url: null,
  };

  function makeMockClient(ticketData: unknown[]) {
    const storageChain = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://storage.test/qr.png" } }),
    };
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "tickets") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: ticketData, error: null }),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "group_bookings") {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
      storage: { from: vi.fn().mockReturnValue(storageChain) },
    } as unknown as SupabaseClient;
  }

  it("generates ticket_secret, uploads QR, and updates ticket", async () => {
    const client = makeMockClient([TICKET]);
    const result = await resolveTicketsHandler(client, ["ticket-uuid-1"]);

    expect(result.resolved).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify QRCode was called with correct ticket_secret format
    const QRCode = (await import("qrcode")).default;
    expect(QRCode.toBuffer).toHaveBeenCalledWith(
      "1771972002656_gbs248::event-uuid::ticket-1",
      expect.objectContaining({ errorCorrectionLevel: "H", type: "png", width: 400 }),
    );
  });

  it("returns error entry (does not throw) when upload fails", async () => {
    const failingStorage = {
      upload: vi.fn().mockResolvedValue({ error: new Error("Upload failed") }),
      getPublicUrl: vi.fn(),
    };
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [TICKET], error: null }),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      storage: { from: vi.fn().mockReturnValue(failingStorage) },
    } as unknown as SupabaseClient;

    const result = await resolveTicketsHandler(client, ["ticket-uuid-1"]);

    expect(result.resolved).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].ticketId).toBe("ticket-uuid-1");
  });
});
```

**Step 2: Run tests to verify they FAIL**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run test src/lib/reconciliation.test.ts --run
```

Expected: FAIL — "Cannot find module './reconciliation-handler'"

**Step 3: Create `src/lib/reconciliation-handler.ts`**

```ts
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AffectedTicket {
  id: string;
  email: string;
  name: string;
  paystack_reference: string;
  ticket_type_id: string;
  price_paid: number;
  status: string;
  group_booking_id: string | null;
  event_id: string;
  // Derived from paystack_reference
  base_reference: string;
  position: number;
  // From Paystack API
  paystack_amount: number;
  paystack_channel: string;
  paystack_date: string;
  is_group: boolean;
}

export interface ResolveResult {
  resolved: number;
  errors: Array<{ ticketId: string; error: string }>;
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Strips the trailing -N suffix added by the purchase route.
 * "1771972002656_gbs248-2" → { baseRef: "1771972002656_gbs248", position: 2 }
 */
export function parseReference(paystackReference: string): { baseRef: string; position: number } {
  const match = paystackReference.match(/^(.+)-(\d+)$/);
  if (!match) return { baseRef: paystackReference, position: 1 };
  return { baseRef: match[1], position: parseInt(match[2], 10) };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/**
 * Fetches all Paystack "success" transactions (paginated) and cross-references
 * with all "reserved" Supabase tickets to find the affected set.
 */
export async function getReconciliationDataHandler(
  client: SupabaseClient,
): Promise<AffectedTicket[]> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");

  // 1. Fetch ALL Paystack success transactions (paginate through all pages)
  const successRefs = new Map<string, { amount: number; channel: string; paid_at: string }>();
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await fetch(
      `https://api.paystack.co/transaction?perPage=${perPage}&page=${page}&status=success`,
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
    );
    if (!res.ok) throw new Error(`Paystack API error: ${res.status}`);
    const body = await res.json();
    for (const tx of body.data) {
      successRefs.set(tx.reference, {
        amount: tx.amount,
        channel: tx.channel,
        paid_at: tx.paid_at,
      });
    }
    if (body.meta.page >= body.meta.pageCount) break;
    page++;
  }

  // 2. Fetch all reserved tickets from Supabase
  const { data: tickets, error } = await client
    .from("tickets")
    .select(
      "id, email, name, paystack_reference, ticket_type_id, price_paid, status, group_booking_id, event_id",
    )
    .eq("status", "reserved");

  if (error) throw error;
  if (!tickets) return [];

  // 3. Cross-reference: match base references
  const affected: AffectedTicket[] = [];
  for (const ticket of tickets) {
    const { baseRef, position } = parseReference(ticket.paystack_reference);
    const paystackData = successRefs.get(baseRef);
    if (!paystackData) continue;

    affected.push({
      ...ticket,
      base_reference: baseRef,
      position,
      paystack_amount: paystackData.amount,
      paystack_channel: paystackData.channel,
      paystack_date: paystackData.paid_at,
      is_group: !!ticket.group_booking_id,
    });
  }

  return affected;
}

/**
 * For each given ticket ID:
 *   - Expands group bookings (resolves all siblings)
 *   - Generates ticket_secret and QR code PNG
 *   - Uploads to Supabase storage "qr-codes" bucket
 *   - Updates ticket: status='paid', qr_code_url, ticket_secret
 *   - Updates group_bookings.status='paid' if applicable
 * Returns { resolved, errors } — partial success is allowed.
 */
export async function resolveTicketsHandler(
  client: SupabaseClient,
  ticketIds: string[],
): Promise<ResolveResult> {
  // 1. Fetch ticket details for given IDs
  const { data: tickets, error } = await client
    .from("tickets")
    .select(
      "id, email, name, paystack_reference, event_id, group_booking_id, ticket_secret, qr_code_url",
    )
    .in("id", ticketIds);

  if (error) throw error;
  if (!tickets || tickets.length === 0) return { resolved: 0, errors: [] };

  // 2. Expand: include all sibling tickets from the same group bookings
  const groupIds = [
    ...new Set(tickets.filter((t) => t.group_booking_id).map((t) => t.group_booking_id as string)),
  ];

  let allTickets = [...tickets];
  if (groupIds.length > 0) {
    const { data: groupTickets } = await client
      .from("tickets")
      .select(
        "id, email, name, paystack_reference, event_id, group_booking_id, ticket_secret, qr_code_url",
      )
      .in("group_booking_id", groupIds);

    if (groupTickets) {
      const seen = new Set(tickets.map((t) => t.id));
      for (const gt of groupTickets) {
        if (!seen.has(gt.id)) allTickets.push(gt);
      }
    }
  }

  // 3. Process each ticket — partial failure allowed
  let resolved = 0;
  const errors: Array<{ ticketId: string; error: string }> = [];

  for (const ticket of allTickets) {
    try {
      const { baseRef, position } = parseReference(ticket.paystack_reference);
      const ticketSecret =
        ticket.ticket_secret ?? `${baseRef}::${ticket.event_id}::ticket-${position}`;

      // Generate QR code PNG buffer
      const qrBuffer = await QRCode.toBuffer(ticketSecret, {
        errorCorrectionLevel: "H",
        type: "png",
        width: 400,
        margin: 2,
      });

      // Upload to Supabase storage
      // Note: user_id is null for affected tickets; using "tickets/" prefix
      const filePath = `tickets/${baseRef}-ticket-${position}.png`;
      const { error: uploadError } = await client.storage
        .from("qr-codes")
        .upload(filePath, qrBuffer, { contentType: "image/png", upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = client.storage.from("qr-codes").getPublicUrl(filePath);

      // Update ticket record
      const { error: updateError } = await client
        .from("tickets")
        .update({ status: "paid", qr_code_url: publicUrl, ticket_secret: ticketSecret })
        .eq("id", ticket.id);

      if (updateError) throw updateError;

      // Update group booking status
      if (ticket.group_booking_id) {
        await client
          .from("group_bookings")
          .update({ status: "paid" })
          .eq("id", ticket.group_booking_id);
      }

      resolved++;
    } catch (err) {
      errors.push({
        ticketId: ticket.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { resolved, errors };
}
```

**Step 4: Run tests to verify they PASS**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run test src/lib/reconciliation.test.ts --run
```

Expected: all 8 tests PASS (3 parseReference + 3 getReconciliationDataHandler + 2 resolveTicketsHandler)

If tests fail, likely causes:

- `vi.mock("qrcode", ...)` hoisting — ensure mock is declared before the import
- The Supabase client chain mock may need `.in()` chained differently — verify the mock returns a promise at the right step

**Step 5: Run typecheck**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run typecheck
```

**Step 6: Commit**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && git add src/lib/reconciliation-handler.ts src/lib/reconciliation.test.ts && git commit -m "feat: add reconciliation handler with tests"
```

---

### Task 2: Server function wrappers

**Files:**

- Create: `src/lib/reconciliation.ts`

**Step 1: Create `src/lib/reconciliation.ts`**

Follow the exact same pattern as `src/lib/admin-users.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import { getReconciliationDataHandler, resolveTicketsHandler } from "./reconciliation-handler";

export type { AffectedTicket, ResolveResult } from "./reconciliation-handler";

// NOTE: supabaseClient uses the service-role key (see supabase-provider.ts).
// Pre-existing project-wide trade-off for this internal admin tool.
// The auth.admin.* and storage calls here run inside createServerFn (server-side only).
export const getReconciliationData = createServerFn().handler(() =>
  getReconciliationDataHandler(supabaseClient),
);

// Arrow wrapper needed: handler takes (client, ticketIds) not TanStack's { data } context shape
export const resolveTickets = createServerFn({ method: "POST" })
  .inputValidator((input: { ticketIds: string[] }) => input)
  .handler(({ data }) => resolveTicketsHandler(supabaseClient, data.ticketIds));
```

**Step 2: Run typecheck**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run typecheck
```

Expected: no errors in the new file.

**Step 3: Commit**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && git add src/lib/reconciliation.ts && git commit -m "feat: add reconciliation server functions"
```

---

### Task 3: ReconciliationPage component

**Files:**

- Create: `src/components/admin/reconciliation-page.tsx`

**Step 1: Create `src/components/admin/reconciliation-page.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";
import { getReconciliationData, resolveTickets } from "@/lib/reconciliation";
import type { AffectedTicket } from "@/lib/reconciliation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

function formatAmount(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export function ReconciliationPage() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const notify = useNotify();
  const queryClient = useQueryClient();

  const {
    data: tickets = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["reconciliation"],
    queryFn: () => getReconciliationData(),
    staleTime: 30_000,
  });

  const pendingTickets = tickets.filter((t) => !resolvedIds.has(t.id));
  const allSelected =
    pendingTickets.length > 0 && pendingTickets.every((t) => selectedIds.has(t.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingTickets.map((t) => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { mutate: resolve, isPending } = useMutation({
    mutationFn: () => resolveTickets({ data: { ticketIds: [...selectedIds] } }),
    onSuccess: (result) => {
      const newResolved = new Set(resolvedIds);
      selectedIds.forEach((id) => newResolved.add(id));
      setResolvedIds(newResolved);
      setSelectedIds(new Set());
      notify(`${result.resolved} ticket(s) resolved successfully`, { type: "success" });
      if (result.errors.length > 0) {
        notify(`${result.errors.length} ticket(s) failed — check console`, { type: "error" });
        console.error("Reconciliation errors:", result.errors);
      }
      queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    },
    onError: (err: Error) => {
      notify(err.message, { type: "error" });
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 rounded-full p-3">
            <AlertTriangle className="size-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payment Reconciliation</h1>
            {!isLoading && (
              <p className="text-sm text-muted-foreground">
                {pendingTickets.length} ticket(s) need resolution
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button onClick={() => resolve()} disabled={isPending}>
              {isPending ? "Resolving..." : `Resolve ${selectedIds.size} Selected`}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {isError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-4 border border-red-200">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Failed to load reconciliation data:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={pendingTickets.length === 0 || isLoading}
                />
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Group?</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 8 }, (_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                  No affected tickets found — all payments are reconciled
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket: AffectedTicket) => {
                const isResolved = resolvedIds.has(ticket.id);
                const isSelected = selectedIds.has(ticket.id);
                return (
                  <TableRow key={ticket.id} className={isResolved ? "opacity-60" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(ticket.id)}
                        disabled={isResolved || isPending}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{ticket.email}</TableCell>
                    <TableCell className="text-sm">{ticket.name}</TableCell>
                    <TableCell className="font-mono text-xs">{ticket.base_reference}</TableCell>
                    <TableCell>{formatAmount(ticket.paystack_amount)}</TableCell>
                    <TableCell className="capitalize">{ticket.paystack_channel}</TableCell>
                    <TableCell>
                      {ticket.is_group ? <Badge variant="secondary">Group</Badge> : "—"}
                    </TableCell>
                    <TableCell>
                      {isResolved ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="size-4" />
                          <span className="text-sm font-medium">Resolved</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run typecheck
```

Fix any TypeScript errors before proceeding.

**Step 3: Commit**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && git add src/components/admin/reconciliation-page.tsx && git commit -m "feat: add ReconciliationPage component with bulk checkbox resolve"
```

---

### Task 4: Sidebar entry + route wiring

**Files:**

- Modify: `src/components/admin/app-sidebar.tsx`
- Modify: `src/routes/admin/$.tsx`

**Step 1: Add `ReconciliationMenuItem` to `app-sidebar.tsx`**

Add `AlertTriangle` to the lucide import:

```ts
// BEFORE:
import { CreditCard, ScanLine, ShieldCheck } from "lucide-react";

// AFTER:
import { AlertTriangle, CreditCard, ScanLine, ShieldCheck } from "lucide-react";
```

Add this component after `AdminsMenuItem` (at the end of the file, before `ResourceMenuItem`):

```tsx
export const ReconciliationMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/reconciliation", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/reconciliation" onClick={onClick}>
          <AlertTriangle />
          Reconciliation
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
```

In the `AppSidebar` function, add `<ReconciliationMenuItem onClick={handleClick} />` after `<AdminsMenuItem onClick={handleClick} />`:

```tsx
              <AdminsMenuItem onClick={handleClick} />
              <ReconciliationMenuItem onClick={handleClick} />
```

**Step 2: Wire the route in `src/routes/admin/$.tsx`**

Add import after the `AdminsPage` import:

```ts
import { ReconciliationPage } from "@/components/admin/reconciliation-page";
```

Add route in `<CustomRoutes>` after the `/admins` route:

```tsx
        <RouterRoute path="/admins" element={<AdminsPage />} />
        <RouterRoute path="/reconciliation" element={<ReconciliationPage />} />
```

**Step 3: Run typecheck and full test suite**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run typecheck && bun run test --run
```

Expected: no type errors, all tests pass.

**Step 4: Commit**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && git add src/components/admin/app-sidebar.tsx src/routes/admin/$.tsx && git commit -m "feat: wire reconciliation page to sidebar and route"
```

---

## Final Verification

After all tasks complete:

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run test --run && bun run typecheck
```

Expected:

- All tests pass (existing 8 + 8 new reconciliation tests = 16 total)
- No TypeScript errors

Manual smoke test:

1. Visit `/admin/reconciliation` — should show a list of affected tickets
2. Check one or more checkboxes — "Resolve N Selected" button appears
3. Click Resolve — tickets update to "Resolved" state, success toast shows
4. Refresh button re-fetches live data
