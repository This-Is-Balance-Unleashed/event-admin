# Email Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/admin/email` page that lets admins compose and send branded HTML ticket confirmation emails to selected attendees via Resend.

**Architecture:** A dedicated page with a two-panel layout — left for recipient selection (ticket table + select-all + paste area), right for composing (subject, message, field checkboxes, live preview, send button). All Resend API calls run inside `createServerFn` server functions. The HTML template is a pure function for testability.

**Tech Stack:** Resend JS SDK, `createServerFn` (TanStack Start), Vitest, Supabase, React, Tailwind CSS v4, shadcn/ui

---

## Task 1: Install Resend and add env vars

**Files:**

- Modify: `package.json` (via bun)
- Modify: `.env`

**Step 1: Install Resend**

```bash
bun add resend
```

Expected: `resend` appears in `package.json` dependencies.

**Step 2: Add env vars to `.env`**

Add these two lines to `.env`:

```
RESEND_API_KEY=re_PLACEHOLDER
RESEND_FROM_EMAIL=events@balanceunleashed.org
```

> Replace `re_PLACEHOLDER` with the real Resend API key when available. The server functions will throw a clear error if it's missing.

**Step 3: Commit**

```bash
git add .env package.json bun.lock
git commit -m "feat: install resend sdk"
```

---

## Task 2: Build `buildEmailHtml` pure function with tests (TDD)

**Files:**

- Create: `src/lib/email-template.ts`
- Create: `src/lib/email-template.test.ts`

This is the hardest part. `buildEmailHtml` is a pure function — no network, no Supabase — so it's fully testable. Email clients require inline styles and table-based layout; no Tailwind classes.

### Step 1: Write the failing tests

Create `src/lib/email-template.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildEmailHtml } from "./email-template";

const baseRecipient = {
  name: "Jane Doe",
  email: "jane@test.com",
  ticketTypeName: "General Admission",
  pricePaid: 1000000,
  reference: "PSK-ABC123",
  qrCodeUrl: "https://example.com/qr/abc123",
};

const allFields = {
  name: true,
  ticketType: true,
  qrCode: true,
  dateVenue: true,
  pricePaid: true,
  reference: true,
};

describe("buildEmailHtml", () => {
  it("includes the custom message", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "Hello from admin", "Your Ticket");
    expect(html).toContain("Hello from admin");
  });

  it("includes name when field is enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("Jane Doe");
  });

  it("omits name when field is disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, name: false }, "", "");
    // name should not appear in a field block (it may appear in greeting)
    // check that the label "Attendee Name" is absent
    expect(html).not.toContain("Attendee Name");
  });

  it("includes ticket type when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("General Admission");
  });

  it("omits ticket type when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, ticketType: false }, "", "");
    expect(html).not.toContain("Ticket Type");
  });

  it("includes price paid formatted as naira when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("₦10,000");
  });

  it("omits price when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, pricePaid: false }, "", "");
    expect(html).not.toContain("Price Paid");
  });

  it("includes QR code link when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("https://example.com/qr/abc123");
  });

  it("omits QR code when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, qrCode: false }, "", "");
    expect(html).not.toContain("https://example.com/qr/abc123");
  });

  it("includes reference when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("PSK-ABC123");
  });

  it("includes event date and venue when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("February 28, 2026");
    expect(html).toContain("Pistis Annex");
  });

  it("omits event date/venue when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, dateVenue: false }, "", "");
    expect(html).not.toContain("February 28, 2026");
  });

  it("returns a valid HTML string with doctype", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toMatch(/^<!DOCTYPE html>/i);
  });

  it("uses brand green color in output", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("#39B54A");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
bun run test src/lib/email-template.test.ts --run
```

Expected: All tests FAIL with `Cannot find module './email-template'`.

### Step 3: Implement `buildEmailHtml`

Create `src/lib/email-template.ts`:

```typescript
export type EmailRecipient = {
  name?: string;
  email: string;
  ticketTypeName?: string;
  pricePaid?: number;
  reference?: string;
  qrCodeUrl?: string;
};

export type IncludeFields = {
  name: boolean;
  ticketType: boolean;
  qrCode: boolean;
  dateVenue: boolean;
  pricePaid: boolean;
  reference: boolean;
};

const BRAND = {
  green: "#39B54A",
  orange: "#FF8E00",
  bg: "#f5f1ed",
  text: "#1a1a1a",
  mutedText: "#555555",
  white: "#ffffff",
};

const EVENT = {
  name: "Hit Refresh Conference",
  tagline: "It's Time To Breathe Again",
  date: "February 28, 2026",
  venue: "Pistis Annex, Marwa, Lekki, Lagos",
  email: "events@balanceunleashed.org",
};

function fieldRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #e5e5e5;">
        <span style="font-size:12px;color:${BRAND.mutedText};font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.05em;">${label}</span><br/>
        <span style="font-size:15px;color:${BRAND.text};font-family:Arial,sans-serif;font-weight:600;">${value}</span>
      </td>
    </tr>`;
}

export function buildEmailHtml(
  recipient: EmailRecipient,
  fields: IncludeFields,
  message: string,
  subject: string,
): string {
  const priceFormatted =
    recipient.pricePaid != null ? `₦${(recipient.pricePaid / 100).toLocaleString("en-NG")}` : "";

  const detailRows = [
    fields.name && recipient.name ? fieldRow("Attendee Name", recipient.name) : "",
    fields.ticketType && recipient.ticketTypeName
      ? fieldRow("Ticket Type", recipient.ticketTypeName)
      : "",
    fields.pricePaid && priceFormatted ? fieldRow("Price Paid", priceFormatted) : "",
    fields.reference && recipient.reference ? fieldRow("Reference", recipient.reference) : "",
    fields.dateVenue ? fieldRow("Date", EVENT.date) : "",
    fields.dateVenue ? fieldRow("Venue", EVENT.venue) : "",
  ]
    .filter(Boolean)
    .join("");

  const qrButton =
    fields.qrCode && recipient.qrCodeUrl
      ? `
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
    </tr>`
      : "";

  const customMessageBlock = message
    ? `
    <tr>
      <td style="padding:16px 0;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.text};font-family:Arial,sans-serif;">
          ${message.replace(/\n/g, "<br/>")}
        </p>
      </td>
    </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${subject || EVENT.name}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.white};border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND.green};padding:28px 32px;">
              <p style="margin:0;font-size:22px;font-weight:bold;color:${BRAND.white};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.02em;">
                Hit Refresh Conference
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);font-family:Arial,sans-serif;">
                Career and Wellness Summit 2026
              </p>
            </td>
          </tr>

          <!-- Hero tagline -->
          <tr>
            <td style="padding:24px 32px 8px;border-bottom:3px solid ${BRAND.orange};">
              <p style="margin:0;font-size:26px;font-family:Georgia,'Times New Roman',serif;color:${BRAND.text};line-height:1.3;">
                ${EVENT.tagline}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Custom message -->
                ${customMessageBlock}

                <!-- Field details -->
                ${
                  detailRows
                    ? `<tr><td style="padding:16px 0 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${detailRows}
                  </table>
                </td></tr>`
                    : ""
                }

                <!-- QR Button -->
                ${qrButton}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 32px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:12px;color:${BRAND.mutedText};font-family:Arial,sans-serif;text-align:center;">
                Questions? Reply to
                <a href="mailto:${EVENT.email}" style="color:${BRAND.green};">${EVENT.email}</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;text-align:center;">
                © 2026 Balance Unleashed · Pistis Annex, Marwa, Lekki, Lagos
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
```

### Step 4: Run tests to verify they pass

```bash
bun run test src/lib/email-template.test.ts --run
```

Expected: All 14 tests PASS.

### Step 5: Commit

```bash
git add src/lib/email-template.ts src/lib/email-template.test.ts
git commit -m "feat: add buildEmailHtml pure function with tests"
```

---

## Task 3: Create `src/lib/email.ts` server functions with tests (TDD)

**Files:**

- Create: `src/lib/email.ts`
- Create: `src/lib/email.test.ts`

Two server functions:

1. `fetchEmailTickets({ search?, status? })` — queries Supabase
2. `sendTicketEmails({ recipients, subject, message, includeFields })` — calls Resend

### Step 1: Write the failing tests

Create `src/lib/email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Resend
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    batch: {
      send: vi.fn(),
    },
  })),
}));

// Mock supabase
vi.mock("./supabase-provider", () => ({
  supabaseClient: {
    from: vi.fn((table: string) => {
      if (table === "tickets") return ticketsChain;
      return {};
    }),
  },
}));

let ticketsChain: Record<string, ReturnType<typeof vi.fn>>;
let mockBatchSend: ReturnType<typeof vi.fn>;

import { fetchEmailTicketsHandler, sendTicketEmailsHandler } from "./email";
import { Resend } from "resend";

beforeEach(() => {
  vi.clearAllMocks();

  ticketsChain = {
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  };

  mockBatchSend = vi.fn();
  (Resend as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    batch: { send: mockBatchSend },
  }));
});

describe("fetchEmailTicketsHandler", () => {
  it("returns formatted ticket rows", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: [
        {
          id: "t1",
          email: "jane@test.com",
          name: "Jane Doe",
          status: "paid",
          price_paid: 1000000,
          paystack_reference: "PSK-ABC",
          qr_code_url: "https://example.com/qr/1",
          ticket_types: { name: "General" },
        },
      ],
      error: null,
    });

    const result = await fetchEmailTicketsHandler({});
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("jane@test.com");
    expect(result[0].ticketTypeName).toBe("General");
  });

  it("throws on Supabase error", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: null,
      error: { message: "DB error" },
    });

    await expect(fetchEmailTicketsHandler({})).rejects.toThrow("DB error");
  });
});

describe("sendTicketEmailsHandler", () => {
  const recipients = [
    {
      email: "jane@test.com",
      name: "Jane Doe",
      ticketTypeName: "General",
      pricePaid: 1000000,
      reference: "PSK-ABC",
      qrCodeUrl: "https://example.com/qr/1",
    },
  ];

  const includeFields = {
    name: true,
    ticketType: true,
    qrCode: true,
    dateVenue: true,
    pricePaid: true,
    reference: true,
  };

  it("calls Resend batch.send with one email per recipient", async () => {
    mockBatchSend.mockResolvedValueOnce({ data: [{ id: "msg1" }], error: null });

    const result = await sendTicketEmailsHandler({
      recipients,
      subject: "Your ticket",
      message: "Hello!",
      includeFields,
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    const calls = mockBatchSend.mock.calls[0][0];
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("jane@test.com");
    expect(calls[0].subject).toBe("Your ticket");
    expect(result.sent).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it("returns failed entry when Resend errors", async () => {
    mockBatchSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid API key" },
    });

    const result = await sendTicketEmailsHandler({
      recipients,
      subject: "Your ticket",
      message: "",
      includeFields,
    });

    expect(result.sent).toBe(0);
    expect(result.failed[0].email).toBe("jane@test.com");
    expect(result.failed[0].error).toContain("Invalid API key");
  });

  it("returns empty result for empty recipients", async () => {
    const result = await sendTicketEmailsHandler({
      recipients: [],
      subject: "Test",
      message: "",
      includeFields,
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toHaveLength(0);
    expect(mockBatchSend).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run tests to verify they fail

```bash
bun run test src/lib/email.test.ts --run
```

Expected: FAIL — `Cannot find module './email'`.

### Step 3: Implement `src/lib/email.ts`

```typescript
import { Resend } from "resend";
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import { buildEmailHtml, type EmailRecipient, type IncludeFields } from "./email-template";

function toMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

export type EmailTicket = {
  id: string;
  email: string;
  name?: string;
  status: string;
  ticketTypeName?: string;
  pricePaid?: number;
  reference?: string;
  qrCodeUrl?: string;
};

export type SendEmailInput = {
  recipients: EmailRecipient[];
  subject: string;
  message: string;
  includeFields: IncludeFields;
};

export type SendEmailResult = {
  sent: number;
  failed: Array<{ email: string; error: string }>;
};

export async function fetchEmailTicketsHandler(params: {
  search?: string;
  status?: string;
}): Promise<EmailTicket[]> {
  let query = supabaseClient
    .from("tickets")
    .select(
      "id, email, name, status, price_paid, paystack_reference, qr_code_url, ticket_types(name)",
    )
    .order("created_at", { ascending: false });

  if (params.search) {
    query = query.ilike("email", `%${params.search}%`);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;

  if (error || !data) throw new Error(toMessage(error));

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    status: row.status,
    ticketTypeName: (row.ticket_types as { name: string } | null)?.name ?? undefined,
    pricePaid: row.price_paid ?? undefined,
    reference: row.paystack_reference ?? undefined,
    qrCodeUrl: row.qr_code_url ?? undefined,
  }));
}

export async function sendTicketEmailsHandler(input: SendEmailInput): Promise<SendEmailResult> {
  if (input.recipients.length === 0) return { sent: 0, failed: [] };

  const resend = getResend();
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "events@balanceunleashed.org";

  const emails = input.recipients.map((r) => ({
    from: `Hit Refresh Conference <${fromEmail}>`,
    to: r.email,
    subject: input.subject,
    html: buildEmailHtml(r, input.includeFields, input.message, input.subject),
  }));

  const { data, error } = await resend.batch.send(emails);

  if (error) {
    return {
      sent: 0,
      failed: input.recipients.map((r) => ({ email: r.email, error: toMessage(error) })),
    };
  }

  const sentCount = (data ?? []).length;
  return { sent: sentCount, failed: [] };
}

// Server functions exposed to client
export const fetchEmailTickets = createServerFn({ method: "GET" })
  .inputValidator((input: { search?: string; status?: string }) => input)
  .handler(({ data }) => fetchEmailTicketsHandler(data));

export const sendTicketEmails = createServerFn({ method: "POST" })
  .inputValidator((input: SendEmailInput) => input)
  .handler(({ data }) => sendTicketEmailsHandler(data));
```

### Step 4: Run tests to verify they pass

```bash
bun run test src/lib/email.test.ts --run
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat: add email server functions with tests"
```

---

## Task 4: Create `src/components/admin/email-page.tsx`

**Files:**

- Create: `src/components/admin/email-page.tsx`

No unit tests for this UI component — test manually via the browser. This component is pure React state + server function calls.

### Step 1: Create the component

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "@tanstack/react-router";
import { useNotify } from "ra-core";
import { Mail, Send, CheckSquare, Square, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchEmailTickets, sendTicketEmails, type EmailTicket } from "@/lib/email";
import type { IncludeFields } from "@/lib/email-template";

const DEFAULT_SUBJECT = "Your Hit Refresh Conference Ticket";
const DEFAULT_MESSAGE = `Thank you for registering for Hit Refresh Conference 2026!

We're excited to see you on February 28th at Pistis Annex, Marwa, Lekki, Lagos.

Please keep this email handy — your QR code is your entry pass. Show it at the entrance on the day.

See you there!`;

const FIELD_OPTIONS: { key: keyof IncludeFields; label: string }[] = [
  { key: "name", label: "Attendee Name" },
  { key: "ticketType", label: "Ticket Type" },
  { key: "qrCode", label: "QR Code Button" },
  { key: "dateVenue", label: "Event Date & Venue" },
  { key: "pricePaid", label: "Price Paid" },
  { key: "reference", label: "Payment Reference" },
];

const DEFAULT_FIELDS: IncludeFields = {
  name: true,
  ticketType: true,
  qrCode: true,
  dateVenue: true,
  pricePaid: false,
  reference: false,
};

export function EmailPage() {
  const notify = useNotify();
  const searchParams = useSearchParams();
  const presetEmail = (searchParams as Record<string, string>).email ?? "";

  const [tickets, setTickets] = useState<EmailTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pasteEmails, setPasteEmails] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [includeFields, setIncludeFields] = useState<IncludeFields>(DEFAULT_FIELDS);
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTickets = useCallback(async (q: string, s: string) => {
    setLoading(true);
    try {
      const data = await fetchEmailTickets({
        search: q || undefined,
        status: s === "all" ? undefined : s,
      });
      setTickets(data);
      // Auto-select if preset email provided
      if (presetEmail) {
        const match = data.find((t) => t.email === presetEmail);
        if (match) setSelectedIds(new Set([match.id]));
      }
    } catch (e) {
      notify("Failed to load tickets", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [presetEmail, notify]);

  useEffect(() => {
    loadTickets("", "all");
  }, [loadTickets]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => loadTickets(q, statusFilter), 300);
  };

  const handleStatusChange = (s: string) => {
    setStatusFilter(s);
    loadTickets(search, s);
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map((t) => t.id)));
    }
  };

  const toggleField = (key: keyof IncludeFields) => {
    setIncludeFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Build recipients: selected tickets + pasted emails
  const selectedTickets = tickets.filter((t) => selectedIds.has(t.id));
  const pastedList = pasteEmails
    .split(/[\n,;]/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"))
    .map((e) => ({ id: `paste-${e}`, email: e, status: "unknown" } as EmailTicket));
  const allRecipients = [
    ...selectedTickets,
    ...pastedList.filter((p) => !selectedTickets.find((t) => t.email === p.email)),
  ];

  // Live preview (first recipient or placeholder)
  useEffect(() => {
    import("@/lib/email-template").then(({ buildEmailHtml }) => {
      const preview = allRecipients[0] ?? {
        email: "preview@example.com",
        name: "Preview Attendee",
        ticketTypeName: "General Admission",
        pricePaid: 1000000,
        reference: "PSK-PREVIEW",
        qrCodeUrl: "https://example.com/qr/preview",
      };
      setPreviewHtml(
        buildEmailHtml(
          {
            email: preview.email,
            name: preview.name,
            ticketTypeName: preview.ticketTypeName,
            pricePaid: preview.pricePaid,
            reference: preview.reference,
            qrCodeUrl: preview.qrCodeUrl,
          },
          includeFields,
          message,
          subject,
        ),
      );
    });
  }, [allRecipients, includeFields, message, subject]);

  const handleSend = async () => {
    if (allRecipients.length === 0) return;
    setSending(true);
    try {
      const result = await sendTicketEmails({
        recipients: allRecipients.map((r) => ({
          email: r.email,
          name: r.name,
          ticketTypeName: r.ticketTypeName,
          pricePaid: r.pricePaid,
          reference: r.reference,
          qrCodeUrl: r.qrCodeUrl,
        })),
        subject,
        message,
        includeFields,
      });
      if (result.failed.length > 0) {
        notify(
          `Sent ${result.sent}, failed ${result.failed.length}: ${result.failed.map((f) => f.email).join(", ")}`,
          { type: "warning", autoHideDuration: 8000 },
        );
      } else {
        notify(`Successfully sent ${result.sent} email${result.sent !== 1 ? "s" : ""}`, {
          type: "success",
        });
      }
    } catch (e) {
      notify("Send failed — check server logs", { type: "error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Mail className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Send Ticket Emails</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Recipients */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b">
              <h2 className="font-medium mb-3 flex items-center gap-2">
                <Users className="size-4" /> Recipients
              </h2>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by email…"
                    value={search}
                    onChange={handleSearchChange}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-28 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="p-2 w-8">
                      <button onClick={toggleAll} className="flex items-center justify-center">
                        {selectedIds.size === tickets.length && tickets.length > 0 ? (
                          <CheckSquare className="size-4 text-primary" />
                        ) : (
                          <Square className="size-4 text-muted-foreground" />
                        )}
                      </button>
                    </th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Name / Email</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={3} className="p-4 text-center text-muted-foreground text-xs">Loading…</td></tr>
                  ) : tickets.length === 0 ? (
                    <tr><td colSpan={3} className="p-4 text-center text-muted-foreground text-xs">No tickets found</td></tr>
                  ) : tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => toggleRow(t.id)}
                      className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="p-2 w-8">
                        <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleRow(t.id)} />
                      </td>
                      <td className="p-2">
                        <p className="font-medium leading-none">{t.name || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.email}</p>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs capitalize">{t.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t text-xs text-muted-foreground">
              {selectedIds.size} of {tickets.length} selected
            </div>
          </div>

          {/* Paste area */}
          <div className="rounded-lg border bg-card p-4">
            <Label className="text-sm font-medium mb-2 block">
              Or paste email addresses (one per line)
            </Label>
            <Textarea
              placeholder={"jane@example.com\njohn@example.com"}
              value={pasteEmails}
              onChange={(e) => setPasteEmails(e.target.value)}
              className="text-sm font-mono h-20 resize-none"
            />
            {pastedList.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{pastedList.length} additional email{pastedList.length !== 1 ? "s" : ""} detected</p>
            )}
          </div>
        </div>

        {/* RIGHT: Compose + Preview */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-card p-4 flex flex-col gap-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject…"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Custom Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="text-sm h-28 resize-none"
                placeholder="Your message to attendees…"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Include Fields</Label>
              <div className="grid grid-cols-2 gap-2">
                {FIELD_OPTIONS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={includeFields[key]}
                      onCheckedChange={() => toggleField(key)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="rounded-lg border bg-card">
            <div className="p-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Preview {allRecipients[0] ? `— ${allRecipients[0].email}` : "(placeholder)"}
            </div>
            <div className="h-64 overflow-auto">
              {previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full border-0"
                  title="Email preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Loading preview…
                </div>
              )}
            </div>
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={allRecipients.length === 0 || !subject || sending}
            size="lg"
            className="gap-2 w-full"
          >
            <Send className="size-4" />
            {sending
              ? "Sending…"
              : allRecipients.length === 0
              ? "Select recipients to send"
              : `Send to ${allRecipients.length} recipient${allRecipients.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add src/components/admin/email-page.tsx
git commit -m "feat: add EmailPage compose UI"
```

---

## Task 5: Wire route, sidebar, and ticket show button

**Files:**

- Modify: `src/routes/admin/$.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`
- Modify: `src/components/admin/ticket-show.tsx`

### Step 1: Add route to `src/routes/admin/$.tsx`

At the top, add import:

```typescript
import { EmailPage } from "@/components/admin/email-page";
```

Inside `<CustomRoutes>`, add:

```typescript
<RouterRoute path="/email" element={<EmailPage />} />
```

### Step 2: Add `SendEmailMenuItem` to `src/components/admin/app-sidebar.tsx`

Add import at top:

```typescript
import { MailPlus } from "lucide-react";
```

Add the component before `CheckInMenuItem`:

```typescript
export const SendEmailMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/email", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/email" onClick={onClick}>
          <MailPlus />
          Send Emails
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
```

In the `AppSidebar` render where other menu items are listed, add:

```typescript
<SendEmailMenuItem onClick={handleClick} />
```

### Step 3: Add "Send Email" button to `src/components/admin/ticket-show.tsx`

Add import at top:

```typescript
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
```

Add `SendEmailButton` component:

```typescript
function SendEmailButton() {
  const record = useRecordContext();
  if (!record?.email) return null;
  return (
    <Button variant="outline" size="sm" className="gap-2" asChild>
      <Link to="/admin/email" search={{ email: record.email }}>
        <Mail className="size-4" />
        Send Email
      </Link>
    </Button>
  );
}
```

In `TicketShow`, inside the actions div alongside `CheckInButton`:

```typescript
<div className="pt-4 flex gap-3 flex-wrap">
  <CheckInButton />
  <SendEmailButton />
</div>
```

### Step 4: Commit

```bash
git add src/routes/admin/$.tsx src/components/admin/app-sidebar.tsx src/components/admin/ticket-show.tsx
git commit -m "feat: wire email route, sidebar entry, and ticket show button"
```

---

## Task 6: Run full test suite and build check

### Step 1: Run all tests

```bash
bun run test --run
```

Expected: All tests PASS (including new email-template + email tests).

### Step 2: Run build

```bash
bun run build
```

Expected: Clean build with no TypeScript errors.

### Step 3: Commit if any fixes were needed

```bash
git add -A
git commit -m "fix: address build or type errors in email feature"
```

---

## Summary

| Task | Files Created/Modified                                         | Tests        |
| ---- | -------------------------------------------------------------- | ------------ |
| 1    | `package.json`, `.env`                                         | —            |
| 2    | `src/lib/email-template.ts`, `src/lib/email-template.test.ts`  | 14           |
| 3    | `src/lib/email.ts`, `src/lib/email.test.ts`                    | 7            |
| 4    | `src/components/admin/email-page.tsx`                          | —            |
| 5    | `src/routes/admin/$.tsx`, `app-sidebar.tsx`, `ticket-show.tsx` | —            |
| 6    | —                                                              | Verification |

**Total new tests: 21**
