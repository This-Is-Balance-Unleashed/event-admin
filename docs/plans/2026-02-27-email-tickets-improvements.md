# Email & Tickets Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Six targeted improvements: email template copy fixes, ticket-type filter + template switcher on email page, bulk/single ticket editing, and global exclusion of test tickets.

**Architecture:** Each feature is isolated — template changes are pure-function, server functions go in `src/lib/ticket-edit.ts`, UI components are self-contained. The `qrCode` IncludeFields flag is repurposed as a generic "CTA button" toggle (renders Zoom URL or QR URL based on recipient data). Test tickets are excluded at the query layer in every ticket-fetching path.

**Tech Stack:** TanStack Start server fns, Supabase JS client, React state, ra-core (useUpdate / useRefresh), shadcn/ui components.

---

### Task 1: Email Template — Header, Date+Time, Zoom Button

**Files:**
- Modify: `src/lib/email-template.ts`
- Modify: `src/lib/email-template.test.ts`

**Step 1: Write failing tests**

Add/update in `src/lib/email-template.test.ts`:

```typescript
// Header says "Hit Refresh" not "Hit Refresh Conference"
it('header says "Hit Refresh" not "Hit Refresh Conference"', () => {
  const html = buildEmailHtml({ email: "a@b.com" }, defaultFields, "", "Test");
  expect(html).toContain(">Hit Refresh<");
  expect(html).not.toContain(">Hit Refresh Conference<");
});

// Date row includes time info
it("date row includes registration and event time", () => {
  const html = buildEmailHtml({ email: "a@b.com" }, defaultFields, "", "Test");
  expect(html).toContain("Registration 8am");
  expect(html).toContain("Event 9am");
});

// Zoom button renders when zoomUrl is set
it("renders zoom button when zoomUrl is set and qrCode is true", () => {
  const html = buildEmailHtml(
    { email: "a@b.com", zoomUrl: "https://zoom.us/test" },
    { ...defaultFields, qrCode: true },
    "",
    "Test",
  );
  expect(html).toContain("Join Hit Refresh");
  expect(html).toContain("https://zoom.us/test");
  expect(html).not.toContain("View Your QR Code");
});

// QR button still works when qrCodeUrl is set (no zoomUrl)
it("renders QR button when qrCodeUrl is set and no zoomUrl", () => {
  const html = buildEmailHtml(
    { email: "a@b.com", qrCodeUrl: "https://qr.example.com/1" },
    { ...defaultFields, qrCode: true },
    "",
    "Test",
  );
  expect(html).toContain("View Your QR Code");
  expect(html).not.toContain("Join Hit Refresh");
});
```

**Step 2: Run to verify they fail**

```bash
bun run test src/lib/email-template.test.ts --run
```

Expected: FAIL on the 4 new tests.

**Step 3: Implement changes in `src/lib/email-template.ts`**

Add `zoomUrl?: string` to `EmailRecipient` type:
```typescript
export type EmailRecipient = {
  name?: string;
  email: string;
  ticketTypeName?: string;
  pricePaid?: number;
  reference?: string;
  qrCodeUrl?: string;
  zoomUrl?: string; // if set, CTA button links to Zoom instead of QR
};
```

Change header `<p>` text (line ~114):
```html
<!-- FROM: -->
Hit Refresh Conference
<!-- TO: -->
Hit Refresh
```

Change the date fieldRow (line ~62):
```typescript
// FROM:
fields.dateVenue ? fieldRow("Date", EVENT.date) : "",
// TO:
fields.dateVenue
  ? fieldRow("Date", `${EVENT.date} · Registration 8am | Event 9am`)
  : "",
```

Replace the entire `qrButton` const block:
```typescript
const ctaButton = (() => {
  if (!fields.qrCode) return "";
  if (recipient.zoomUrl) {
    return `
  <tr>
    <td style="padding:24px 0 8px;text-align:center;">
      <a href="${recipient.zoomUrl}"
         style="display:inline-block;background-color:${BRAND.green};color:${BRAND.white};
                text-decoration:none;font-family:Arial,sans-serif;font-size:16px;
                font-weight:bold;padding:14px 32px;border-radius:6px;">
        Join Hit Refresh
      </a>
      <p style="margin:8px 0 0;font-size:11px;color:${BRAND.mutedText};font-family:Arial,sans-serif;">
        Use this link to join the virtual stream on the event day
      </p>
    </td>
  </tr>`;
  }
  if (recipient.qrCodeUrl) {
    return `
  <tr>
    <td style="padding:24px 0 8px;text-align:center;">
      <a href="${recipient.qrCodeUrl}"
         style="display:inline-block;background-color:${BRAND.green};color:${BRAND.white};
                text-decoration:none;font-family:Arial,sans-serif;font-size:16px;
                font-weight:bold;padding:14px 32px;border-radius:6px;">
        View Your QR Code
      </a>
      <p style="margin:8px 0 0;font-size:11px;color:${BRAND.mutedText};font-family:Arial,sans-serif;">
        Show this at the entrance on the event day
      </p>
    </td>
  </tr>`;
  }
  return "";
})();
```

In the HTML body, replace `${qrButton}` with `${ctaButton}`.

**Step 4: Run tests**

```bash
bun run test src/lib/email-template.test.ts --run
```

Expected: all 14+ tests PASS.

**Step 5: Commit**

```bash
git add src/lib/email-template.ts src/lib/email-template.test.ts
git commit -m "feat: fix email template header, date+time row, add zoom CTA button"
```

---

### Task 2: Exclude Test Tickets from fetchEmailTickets

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/lib/email.test.ts`

**Step 1: Write failing test**

In `src/lib/email.test.ts`, add inside `describe("fetchEmailTicketsHandler")`:

```typescript
it("excludes tickets with paystack_reference starting with test_", async () => {
  ticketsChain.order.mockResolvedValueOnce({
    data: [
      {
        id: "t-real",
        email: "real@test.com",
        name: "Real User",
        status: "paid",
        price_paid: 1000000,
        paystack_reference: "PSK-REAL",
        qr_code_url: null,
        ticket_type_id: "tt1",
      },
      {
        id: "t-test",
        email: "test@test.com",
        name: "Test User",
        status: "paid",
        price_paid: 0,
        paystack_reference: "test_abc123",
        qr_code_url: null,
        ticket_type_id: "tt1",
      },
    ],
    error: null,
  });

  const result = await fetchEmailTicketsHandler({});
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe("t-real");
});
```

**Step 2: Run to verify it fails**

```bash
bun run test src/lib/email.test.ts --run
```

**Step 3: Implement**

Note: The Supabase JS `.not()` filter can't be easily verified in the current mock setup (mock ignores filter calls). Use client-side post-filter as a belt-and-suspenders approach that IS testable:

In `fetchEmailTicketsHandler`, after `const { data, error } = await query;`, add:

```typescript
// Exclude test tickets (paystack_reference starts with "test_")
const realData = (data ?? []).filter(
  (row) => !row.paystack_reference?.toLowerCase().startsWith("test_"),
);
```

Then use `realData` instead of `data` in the typeMap and return mapping:
```typescript
if (error || !data) throw new Error(toMessage(error));
const realData = data.filter(
  (row) => !row.paystack_reference?.toLowerCase().startsWith("test_"),
);
// ... typeMap build from realData ...
return realData.map((row) => ({ ... }));
```

**Step 4: Run tests**

```bash
bun run test src/lib/email.test.ts --run
```

Expected: 6 tests PASS (5 existing + 1 new).

**Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat: exclude test_ tickets from email recipient list"
```

---

### Task 3: `src/lib/ticket-edit.ts` — Server Functions (TDD)

**Files:**
- Create: `src/lib/ticket-edit.ts`
- Create: `src/lib/ticket-edit.test.ts`

**Step 1: Write the test file first**

Create `src/lib/ticket-edit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase-provider", () => ({
  supabaseClient: {
    from: vi.fn((table: string) => {
      if (table === "tickets") return ticketsChain;
      if (table === "ticket_types") return typesChain;
      return {};
    }),
  },
}));

let ticketsChain: Record<string, ReturnType<typeof vi.fn>>;
let typesChain: Record<string, ReturnType<typeof vi.fn>>;

import {
  fetchEditableTicketsHandler,
  updateTicketHandler,
  bulkUpdateTicketTypeHandler,
} from "./ticket-edit";

beforeEach(() => {
  vi.clearAllMocks();

  ticketsChain = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };

  typesChain = {
    select: vi.fn().mockResolvedValue({
      data: [
        { id: "tt1", name: "General" },
        { id: "tt2", name: "VIP" },
      ],
      error: null,
    }),
  };
});

describe("fetchEditableTicketsHandler", () => {
  it("returns tickets with ticket type names merged", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: [{ id: "t1", email: "a@b.com", name: "Alice", status: "paid", ticket_type_id: "tt1", paystack_reference: "PSK-1" }],
      error: null,
    });

    const result = await fetchEditableTicketsHandler();
    expect(result).toHaveLength(1);
    expect(result[0].ticketTypeName).toBe("General");
  });

  it("excludes test_ tickets client-side", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: [
        { id: "t1", email: "a@b.com", name: "Alice", status: "paid", ticket_type_id: "tt1", paystack_reference: "PSK-REAL" },
        { id: "t2", email: "b@b.com", name: "Bot", status: "paid", ticket_type_id: "tt1", paystack_reference: "test_abc" },
      ],
      error: null,
    });

    const result = await fetchEditableTicketsHandler();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });

  it("throws on supabase error", async () => {
    ticketsChain.order.mockResolvedValueOnce({ data: null, error: { message: "DB error" } });
    await expect(fetchEditableTicketsHandler()).rejects.toThrow("DB error");
  });
});

describe("updateTicketHandler", () => {
  it("updates name when provided", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: null });
    await expect(updateTicketHandler({ id: "t1", name: "Bob" })).resolves.toBeUndefined();
    expect(ticketsChain.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Bob" }));
  });

  it("updates ticket_type_id when ticketTypeId provided", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: null });
    await updateTicketHandler({ id: "t1", ticketTypeId: "tt2" });
    expect(ticketsChain.update).toHaveBeenCalledWith(expect.objectContaining({ ticket_type_id: "tt2" }));
  });

  it("no-ops when no fields given", async () => {
    await updateTicketHandler({ id: "t1" });
    expect(ticketsChain.update).not.toHaveBeenCalled();
  });

  it("throws on supabase error", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: { message: "Update failed" } });
    await expect(updateTicketHandler({ id: "t1", name: "Bob" })).rejects.toThrow("Update failed");
  });
});

describe("bulkUpdateTicketTypeHandler", () => {
  it("updates ticket_type_id for all ids", async () => {
    ticketsChain.in.mockResolvedValueOnce({ error: null });
    await bulkUpdateTicketTypeHandler({ ids: ["t1", "t2"], ticketTypeId: "tt2" });
    expect(ticketsChain.update).toHaveBeenCalledWith({ ticket_type_id: "tt2" });
    expect(ticketsChain.in).toHaveBeenCalledWith("id", ["t1", "t2"]);
  });

  it("no-ops for empty ids array", async () => {
    await bulkUpdateTicketTypeHandler({ ids: [], ticketTypeId: "tt2" });
    expect(ticketsChain.update).not.toHaveBeenCalled();
  });

  it("throws on supabase error", async () => {
    ticketsChain.in.mockResolvedValueOnce({ error: { message: "Bulk update failed" } });
    await expect(bulkUpdateTicketTypeHandler({ ids: ["t1"], ticketTypeId: "tt2" })).rejects.toThrow("Bulk update failed");
  });
});
```

**Step 2: Run to verify it fails**

```bash
bun run test src/lib/ticket-edit.test.ts --run
```

Expected: FAIL with "Cannot find module ./ticket-edit".

**Step 3: Create `src/lib/ticket-edit.ts`**

```typescript
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";

export type EditableTicket = {
  id: string;
  name?: string;
  email: string;
  status: string;
  ticket_type_id: string;
  ticketTypeName?: string;
  paystack_reference?: string;
};

export async function fetchEditableTicketsHandler(): Promise<EditableTicket[]> {
  const { data, error } = await supabaseClient
    .from("tickets")
    .select("id, name, email, status, ticket_type_id, paystack_reference")
    .not("paystack_reference", "ilike", "test_%")
    .order("created_at", { ascending: false });

  if (error || !data) throw new Error(error?.message ?? "Failed to load tickets");

  const realData = data.filter(
    (row) => !row.paystack_reference?.toLowerCase().startsWith("test_"),
  );

  const { data: types } = await supabaseClient.from("ticket_types").select("id, name");
  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name as string]));

  return realData.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    status: row.status,
    ticket_type_id: row.ticket_type_id,
    ticketTypeName: typeMap.get(row.ticket_type_id) ?? undefined,
    paystack_reference: row.paystack_reference ?? undefined,
  }));
}

export async function updateTicketHandler(input: {
  id: string;
  name?: string;
  ticketTypeId?: string;
}): Promise<void> {
  const patch: Record<string, string> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.ticketTypeId) patch.ticket_type_id = input.ticketTypeId;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseClient.from("tickets").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function bulkUpdateTicketTypeHandler(input: {
  ids: string[];
  ticketTypeId: string;
}): Promise<void> {
  if (input.ids.length === 0) return;
  const { error } = await supabaseClient
    .from("tickets")
    .update({ ticket_type_id: input.ticketTypeId })
    .in("id", input.ids);
  if (error) throw new Error(error.message);
}

export const fetchEditableTickets = createServerFn({ method: "POST" }).handler(() =>
  fetchEditableTicketsHandler(),
);

export const updateTicket = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; name?: string; ticketTypeId?: string }) => input,
  )
  .handler(({ data }) => updateTicketHandler(data));

export const bulkUpdateTicketType = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[]; ticketTypeId: string }) => input)
  .handler(({ data }) => bulkUpdateTicketTypeHandler(data));
```

**Step 4: Run tests**

```bash
bun run test src/lib/ticket-edit.test.ts --run
```

Expected: 8 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/ticket-edit.ts src/lib/ticket-edit.test.ts
git commit -m "feat: add ticket-edit server functions with TDD"
```

---

### Task 4: Email Page — Ticket Type Filter + Template Switcher

**Files:**
- Modify: `src/components/admin/email-page.tsx`

No new tests (pure UI state). Verify manually that filter and templates work.

**Step 1: Add TEMPLATES constant and typeFilter state**

At the top of the file, after the existing imports, add:

```typescript
const ZOOM_URL =
  "https://zoom.us/j/99036993644?pwd=wrENKh7Ii7wOsP3U5dtJYxSKpV7hrc.1";

type EmailTemplateConfig = {
  key: string;
  label: string;
  subject: string;
  message: string;
  fields: IncludeFields;
  zoomUrl?: string;
};

const TEMPLATES: EmailTemplateConfig[] = [
  {
    key: "general",
    label: "General Ticket",
    subject: DEFAULT_SUBJECT,
    message: DEFAULT_MESSAGE,
    fields: DEFAULT_FIELDS,
  },
  {
    key: "virtual",
    label: "Virtual Ticket (Zoom)",
    subject: "Join Hit Refresh — Your Zoom Link",
    message: `You're registered for the virtual stream of Hit Refresh 2026!\n\nJoin Hit Refresh\nMeeting ID: 990 3699 3644\nPasscode: 775309`,
    fields: {
      name: true,
      ticketType: true,
      qrCode: true,
      dateVenue: true,
      pricePaid: false,
      reference: false,
    },
    zoomUrl: ZOOM_URL,
  },
];
```

**Step 2: Add state and handlers**

Inside `EmailPage()`, after the existing state declarations, add:

```typescript
const [typeFilter, setTypeFilter] = useState<string>("all");
const [templateKey, setTemplateKey] = useState<string>("general");

// Unique ticket type names from loaded tickets
const ticketTypeOptions = useMemo(
  () => [...new Set(tickets.map((t) => t.ticketTypeName).filter(Boolean))] as string[],
  [tickets],
);

const applyTemplate = (key: string) => {
  const tpl = TEMPLATES.find((t) => t.key === key);
  if (!tpl) return;
  setTemplateKey(key);
  setSubject(tpl.subject);
  setMessage(tpl.message);
  setIncludeFields(tpl.fields);
};
```

Add `useMemo` to the imports at the top.

**Step 3: Update visibleTickets to include typeFilter**

```typescript
const visibleTickets = tickets.filter((t) => {
  const q = search.toLowerCase();
  const matchesSearch =
    !q || t.email.toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q);
  const matchesStatus = statusFilter === "all" || t.status === statusFilter;
  const matchesType = typeFilter === "all" || t.ticketTypeName === typeFilter;
  return matchesSearch && matchesStatus && matchesType;
});
```

**Step 4: Update the filter row JSX**

Add the third filter Select after the status Select:

```tsx
<Select value={typeFilter} onValueChange={setTypeFilter}>
  <SelectTrigger className="w-36 h-8 text-sm">
    <SelectValue placeholder="All types" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All types</SelectItem>
    {ticketTypeOptions.map((name) => (
      <SelectItem key={name} value={name}>
        {name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Step 5: Add template switcher above the subject field**

Above the subject Label/Input in the right panel, add:

```tsx
<div>
  <Label className="text-sm font-medium mb-1 block">Template</Label>
  <Select value={templateKey} onValueChange={applyTemplate}>
    <SelectTrigger className="h-8 text-sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {TEMPLATES.map((t) => (
        <SelectItem key={t.key} value={t.key}>
          {t.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

**Step 6: Update handleSend to pass zoomUrl**

In `handleSend`, update the recipients mapping:

```typescript
const selectedTemplate = TEMPLATES.find((t) => t.key === templateKey);
const result = await sendTicketEmails({
  data: {
    recipients: allRecipients.map((r) => ({
      email: r.email,
      name: r.name,
      ticketTypeName: r.ticketTypeName,
      pricePaid: r.pricePaid,
      reference: r.reference,
      qrCodeUrl: r.qrCodeUrl,
      zoomUrl: selectedTemplate?.zoomUrl,
    })),
    subject,
    message,
    includeFields,
  },
});
```

Also update the live preview `useEffect` to pass `zoomUrl` to `buildEmailHtml`:

```typescript
// In the preview useEffect recipient object, add:
zoomUrl: selectedTemplate?.zoomUrl,
```

The preview `useEffect` dependency array should include `templateKey`.

**Step 7: Relabel QR field in FIELD_OPTIONS**

```typescript
{ key: "qrCode", label: "Action Button (QR / Zoom)" },
```

**Step 8: Verify build**

```bash
bun run build 2>&1 | tail -5
```

**Step 9: Commit**

```bash
git add src/components/admin/email-page.tsx
git commit -m "feat: add ticket-type filter and template switcher to email page"
```

---

### Task 5: Edit Tickets Bulk Page

**Files:**
- Create: `src/components/admin/edit-tickets-page.tsx`
- Modify: `src/routes/admin/$.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`

**Step 1: Create `src/components/admin/edit-tickets-page.tsx`**

```typescript
import { useState, useEffect } from "react";
import { useNotify } from "ra-core";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchEditableTickets,
  bulkUpdateTicketType,
  updateTicket,
  type EditableTicket,
} from "@/lib/ticket-edit";
import { fetchTicketTypes } from "@/lib/ticket-create";

type TicketType = { id: string; name: string };

function InlineNameEdit({
  ticket,
  onSaved,
}: {
  ticket: EditableTicket;
  onSaved: (id: string, name: string) => void;
}) {
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ticket.name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await updateTicket({ data: { id: ticket.id, name: value.trim() } });
      onSaved(ticket.id, value.trim());
      setEditing(false);
    } catch (e) {
      notify(`Failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs"
      >
        <Pencil className="size-3" />
        {ticket.name || "Add name"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-6 text-xs w-32"
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
      />
      <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700">
        <Check className="size-3.5" />
      </button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function EditTicketsPage() {
  const notify = useNotify();
  const [tickets, setTickets] = useState<EditableTicket[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveToTypeId, setMoveToTypeId] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchEditableTickets({ data: {} }),
      fetchTicketTypes(),
    ])
      .then(([t, types]) => {
        setTickets(Array.isArray(t) ? t : []);
        setTicketTypes(Array.isArray(types) ? types : []);
      })
      .catch((e) => notify(`Failed to load: ${e.message}`, { type: "error" }))
      .finally(() => setLoading(false));
  }, []);

  const allSelected =
    tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map((t) => t.id)));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleNameSaved = (id: string, name: string) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleApply = async () => {
    if (!moveToTypeId || selectedIds.size === 0) return;
    setApplying(true);
    try {
      await bulkUpdateTicketType({
        data: { ids: [...selectedIds], ticketTypeId: moveToTypeId },
      });
      const typeName = ticketTypes.find((t) => t.id === moveToTypeId)?.name ?? moveToTypeId;
      setTickets((prev) =>
        prev.map((t) =>
          selectedIds.has(t.id)
            ? { ...t, ticket_type_id: moveToTypeId, ticketTypeName: typeName }
            : t,
        ),
      );
      notify(`Moved ${selectedIds.size} ticket${selectedIds.size !== 1 ? "s" : ""} to ${typeName}`, {
        type: "success",
      });
      setSelectedIds(new Set());
      setMoveToTypeId("");
    } catch (e) {
      notify(`Failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Pencil className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold">Edit Tickets</h1>
      </div>

      <div className="rounded-lg border bg-card overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th className="p-3 w-8">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Ticket Type</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                  Loading…
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                  No tickets found
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr
                  key={t.id}
                  className="border-t hover:bg-muted/30 transition-colors"
                  onClick={() => toggleRow(t.id)}
                >
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.has(t.id)}
                      onCheckedChange={() => toggleRow(t.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <InlineNameEdit ticket={t} onSaved={handleNameSaved} />
                  </td>
                  <td className="p-3 text-muted-foreground">{t.email}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="capitalize text-xs">
                      {t.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{t.ticketTypeName ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-background border shadow-lg rounded-lg px-4 py-3">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <span className="text-muted-foreground text-sm">Move to:</span>
          <Select value={moveToTypeId} onValueChange={setMoveToTypeId}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Ticket type…" />
            </SelectTrigger>
            <SelectContent>
              {ticketTypes.map((tt) => (
                <SelectItem key={tt.id} value={tt.id}>
                  {tt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!moveToTypeId || applying}
          >
            {applying ? "Applying…" : "Apply"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Wire route in `src/routes/admin/$.tsx`**

Find the existing import block and route list. Add:

```typescript
import { EditTicketsPage } from "@/components/admin/edit-tickets-page";
```

Add route:
```tsx
<RouterRoute path="/tickets/edit" element={<EditTicketsPage />} />
```

**Step 3: Add sidebar item in `src/components/admin/app-sidebar.tsx`**

Find the Tickets section in the sidebar nav. Add after the existing Tickets items:

```typescript
import { Pencil } from "lucide-react"; // add to existing lucide import
```

Add menu item:
```tsx
<SidebarMenuButton asChild>
  <Link to="/admin/tickets/edit">
    <Pencil className="size-4" />
    Edit Tickets
  </Link>
</SidebarMenuButton>
```

**Step 4: Build to check types**

```bash
bun run build 2>&1 | tail -8
```

**Step 5: Commit**

```bash
git add src/components/admin/edit-tickets-page.tsx src/routes/admin/$.tsx src/components/admin/app-sidebar.tsx
git commit -m "feat: add edit tickets bulk page with type reassignment and inline name edit"
```

---

### Task 6: Inline Edit on Single Ticket Show Page

**Files:**
- Modify: `src/components/admin/ticket-show.tsx`

**Step 1: Add EditTicketSection component**

Add imports at top of ticket-show.tsx:
```typescript
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTicket } from "@/lib/ticket-edit";
import { fetchTicketTypes } from "@/lib/ticket-create";
```

Add the component before `TicketShow`:

```typescript
type TicketType = { id: string; name: string };

function EditTicketSection() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!record) return;
    setName(record.name ?? "");
    setTicketTypeId(record.ticket_type_id ?? "");
    fetchTicketTypes().then((types) => setTicketTypes(Array.isArray(types) ? types : []));
  }, [record?.id]);

  if (!record) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTicket({
        data: { id: String(record.id), name: name || undefined, ticketTypeId: ticketTypeId || undefined },
      });
      notify("Ticket updated", { type: "success" });
      refresh();
    } catch (e) {
      notify(`Update failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-4 border-t mt-2">
      <p className="text-sm font-medium mb-3">Edit Ticket</p>
      <div className="flex flex-col gap-3 max-w-sm">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Attendee name"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Ticket Type</Label>
          <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ticketTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-fit">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Add `<EditTicketSection />` below actions in `TicketShow`**

```tsx
<div className="pt-4 flex gap-3 flex-wrap">
  <CheckInButton />
  <SendEmailButton />
</div>
<EditTicketSection />   {/* add this line */}
```

**Step 3: Build**

```bash
bun run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/components/admin/ticket-show.tsx
git commit -m "feat: add inline ticket edit section to ticket show page"
```

---

### Task 7: Global Test Ticket Exclusion

**Files:**
- Modify: `src/components/admin/ticket-list.tsx`
- Modify: `src/lib/check-in.ts`
- Modify: `src/lib/reconciliation-handler.ts`

**Step 1: `ticket-list.tsx` — permanent filter**

Change:
```tsx
<List filters={listFilters} sort={{ field: "created_at", order: "DESC" }}>
```
To:
```tsx
<List
  filters={listFilters}
  sort={{ field: "created_at", order: "DESC" }}
  filter={{ "paystack_reference@not.ilike": "test_%" }}
>
```

**Step 2: `check-in.ts` — exclude from search**

After the `.or(orParts.join(","))` call, add `.not("paystack_reference", "ilike", "test_%")`:

```typescript
const { data, error } = await supabaseClient
  .from("tickets")
  .select("id, name, email, status, price_paid, checked_in_at, ticket_type_id")
  .or(orParts.join(","))
  .not("paystack_reference", "ilike", "test_%")
  .limit(10);
```

**Step 3: `reconciliation-handler.ts` — exclude from reserved tickets query**

Find the `.eq("status", "reserved")` query (around line 124). Add `.not("paystack_reference", "ilike", "test_%")`:

```typescript
const { data: tickets, error } = await client
  .from("tickets")
  .select(
    "id, email, name, paystack_reference, ticket_type_id, price_paid, status, group_booking_id, event_id",
  )
  .eq("status", "reserved")
  .not("paystack_reference", "ilike", "test_%");
```

**Step 4: Build**

```bash
bun run build 2>&1 | tail -5
```

**Step 5: Run all tests**

```bash
bun run test --run
```

Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/components/admin/ticket-list.tsx src/lib/check-in.ts src/lib/reconciliation-handler.ts
git commit -m "feat: exclude test_ tickets from all admin ticket views globally"
```

---

### Task 8: Full Verification

**Run all tests:**

```bash
bun run test --run
```

Expected: all tests pass.

**Run build:**

```bash
bun run build 2>&1 | tail -8
```

Expected: `✓ built in X.XXs` with no errors.

**Final commit (if any stragglers):**

```bash
git status
# stage any remaining changes
git commit -m "chore: final cleanup for email & tickets improvements"
```
