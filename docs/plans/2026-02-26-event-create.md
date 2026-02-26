# Event Create with Ticket Types — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a two-step stepper page that creates an event and its ticket types in one atomic server-side operation.

**Architecture:** Custom page at `/admin/event-create` (same pattern as `ticket-create-page.tsx`). A `createServerFn` handler inserts the event first, then inserts all ticket types linked to the new `event_id`, rolling back the event on partial failure. The UI is a controlled two-step form — step 1 collects event details, step 2 shows 4 pre-filled ticket type rows (editable/deletable) plus an "Add tier" button.

**Tech Stack:** TanStack Start `createServerFn`, `supabaseClient` (service role), `@tanstack/react-query` `useMutation`, shadcn/ui inputs, `useRedirect` from ra-core for post-create navigation, Tailwind CSS v4.

---

## Task 1: Server function — `src/lib/event-create.ts`

**Files:**
- Create: `src/lib/event-create.ts`
- Test: `src/lib/event-create.test.ts`

### Step 1: Write the failing test

Create `src/lib/event-create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock supabaseClient ──────────────────────────────────────────────────────
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();

const makeChain = (overrides: Record<string, unknown> = {}) => ({
  insert: mockInsert,
  select: mockSelect,
  single: mockSingle,
  delete: mockDelete,
  eq: mockEq,
  in: mockIn,
  ...overrides,
});

vi.mock("./supabase-provider", () => ({
  supabaseClient: {
    from: vi.fn((table: string) => {
      if (table === "events") return eventsChain;
      if (table === "ticket_types") return ticketTypesChain;
      return makeChain();
    }),
  },
}));

let eventsChain: ReturnType<typeof makeChain>;
let ticketTypesChain: ReturnType<typeof makeChain>;

import { createEventWithTicketTypesHandler } from "./event-create";

const EVENT_DATA = {
  title: "Test Event",
  description: "Desc",
  event_date: "2026-03-01T10:00:00Z",
  location: "Lagos",
  max_attendees: 500,
  price_in_kobo: 0,
};

const TICKET_TYPES = [
  { name: "General", price_in_kobo: 1_000_000, max_quantity: null, is_available: true },
  { name: "VIP",     price_in_kobo: 1_800_000, max_quantity: null, is_available: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  eventsChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  } as unknown as ReturnType<typeof makeChain>;

  ticketTypesChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  } as unknown as ReturnType<typeof makeChain>;
});

describe("createEventWithTicketTypesHandler", () => {
  it("inserts event then ticket types and returns eventId", async () => {
    const eventId = "event-uuid-1";
    (eventsChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: eventId },
      error: null,
    });
    (ticketTypesChain.select as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: TICKET_TYPES.map((t, i) => ({ ...t, id: `tt-${i}`, event_id: eventId })),
      error: null,
    });

    const result = await createEventWithTicketTypesHandler(EVENT_DATA, TICKET_TYPES);
    expect(result).toEqual({ eventId });
  });

  it("rolls back event when ticket type insert fails", async () => {
    const eventId = "event-uuid-2";
    (eventsChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: eventId },
      error: null,
    });
    (ticketTypesChain.select as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    await expect(createEventWithTicketTypesHandler(EVENT_DATA, TICKET_TYPES)).rejects.toThrow();
    expect(eventsChain.eq).toHaveBeenCalledWith("id", eventId);
  });

  it("throws when event insert fails", async () => {
    (eventsChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "event insert failed" },
    });

    await expect(createEventWithTicketTypesHandler(EVENT_DATA, TICKET_TYPES)).rejects.toThrow(
      "event insert failed",
    );
  });
});
```

### Step 2: Run test to verify it fails

```bash
bun run test src/lib/event-create.test.ts --run
```

Expected: FAIL — `createEventWithTicketTypesHandler` is not defined.

### Step 3: Write the server function

Create `src/lib/event-create.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";

export type EventCreateData = {
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  max_attendees?: number | null;
  price_in_kobo?: number;
};

export type TicketTypeInput = {
  name: string;
  price_in_kobo: number;
  max_quantity: number | null;
  is_available: boolean;
};

function toMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

export async function createEventWithTicketTypesHandler(
  eventData: EventCreateData,
  ticketTypes: TicketTypeInput[],
): Promise<{ eventId: string }> {
  // 1. Insert event
  const { data: event, error: eventError } = await supabaseClient
    .from("events")
    .insert({
      title: eventData.title,
      description: eventData.description || null,
      event_date: eventData.event_date,
      location: eventData.location || null,
      max_attendees: eventData.max_attendees ?? null,
      price_in_kobo: eventData.price_in_kobo ?? 0,
    })
    .select("id")
    .single();

  if (eventError || !event) throw new Error(toMessage(eventError) || "Event insert failed");

  const eventId = event.id as string;

  // 2. Insert ticket types linked to new event
  const { error: typesError } = await supabaseClient
    .from("ticket_types")
    .insert(
      ticketTypes.map((t, i) => ({
        name: t.name,
        price_in_kobo: t.price_in_kobo,
        max_quantity: t.max_quantity ?? null,
        is_available: t.is_available,
        sort_order: i + 1,
        event_id: eventId,
      })),
    )
    .select();

  if (typesError) {
    // Rollback: delete the event
    await supabaseClient.from("events").delete().eq("id", eventId);
    throw new Error(toMessage(typesError));
  }

  return { eventId };
}

export const createEventWithTicketTypes = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { eventData: EventCreateData; ticketTypes: TicketTypeInput[] }) => input,
  )
  .handler(({ data }) =>
    createEventWithTicketTypesHandler(data.eventData, data.ticketTypes),
  );
```

### Step 4: Run tests to verify they pass

```bash
bun run test src/lib/event-create.test.ts --run
```

Expected: 3 tests PASS.

### Step 5: Commit

```bash
git add src/lib/event-create.ts src/lib/event-create.test.ts
git commit -m "feat: add createEventWithTicketTypes server function"
```

---

## Task 2: UI — `src/components/admin/event-create-page.tsx`

**Files:**
- Create: `src/components/admin/event-create-page.tsx`

No automated test for UI — verify manually via build + dev server.

### Step 1: Write the component

Create `src/components/admin/event-create-page.tsx`:

```typescript
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNotify, useRedirect } from "ra-core";
import { CalendarPlus, Loader2, Trash2, Plus, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createEventWithTicketTypes,
  type EventCreateData,
  type TicketTypeInput,
} from "@/lib/event-create";

// ─── Default tiers ─────────────────────────────────────────────────────────

const DEFAULT_TIERS: TicketTypeInput[] = [
  { name: "General",   price_in_kobo: 1_000_000, max_quantity: null, is_available: true },
  { name: "VIP",       price_in_kobo: 1_800_000, max_quantity: null, is_available: true },
  { name: "Corporate", price_in_kobo: 7_000_000, max_quantity: null, is_available: true },
  { name: "Virtual",   price_in_kobo:   650_000, max_quantity: null, is_available: true },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function nairaDisplay(kobo: number) {
  if (!kobo || isNaN(kobo)) return "";
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

// ─── Step 1: Event details ───────────────────────────────────────────────────

type EventForm = {
  title: string;
  description: string;
  event_date: string;
  location: string;
  max_attendees: string;
  price_in_kobo: string;
};

function EventDetailsStep({
  form,
  onChange,
  onNext,
}: {
  form: EventForm;
  onChange: (patch: Partial<EventForm>) => void;
  onNext: () => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof EventForm, string>>>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.event_date) e.event_date = "Date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor="ev-title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ev-title"
          autoFocus
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Hit Refresh Conference 2026"
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-desc">Description</Label>
        <Textarea
          id="ev-desc"
          rows={3}
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Event description…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-date">
          Date & Time <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ev-date"
          type="datetime-local"
          value={form.event_date}
          onChange={(e) => onChange({ event_date: e.target.value })}
        />
        {errors.event_date && <p className="text-xs text-destructive">{errors.event_date}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-location">Location</Label>
        <Input
          id="ev-location"
          value={form.location}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="Lagos, Nigeria"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-max">Max Attendees</Label>
          <Input
            id="ev-max"
            type="number"
            min={1}
            value={form.max_attendees}
            onChange={(e) => onChange({ max_attendees: e.target.value })}
            placeholder="500"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-price">Base Price (kobo)</Label>
          <Input
            id="ev-price"
            type="number"
            min={0}
            value={form.price_in_kobo}
            onChange={(e) => onChange({ price_in_kobo: e.target.value })}
            placeholder="0"
          />
          {form.price_in_kobo && (
            <p className="text-xs text-muted-foreground">{nairaDisplay(Number(form.price_in_kobo))}</p>
          )}
        </div>
      </div>

      <div className="pt-2">
        <Button onClick={handleNext} className="gap-2">
          Ticket Types
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Ticket types ────────────────────────────────────────────────────

function TicketTypesStep({
  tiers,
  onChange,
  onBack,
  onSubmit,
  isSubmitting,
  submitError,
}: {
  tiers: TicketTypeInput[];
  onChange: (tiers: TicketTypeInput[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}) {
  const update = (i: number, patch: Partial<TicketTypeInput>) =>
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const remove = (i: number) => onChange(tiers.filter((_, idx) => idx !== i));

  const addRow = () =>
    onChange([...tiers, { name: "", price_in_kobo: 0, max_quantity: null, is_available: true }]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_140px_100px_60px_36px] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
          <span>Name</span>
          <span>Price (kobo)</span>
          <span>Max Qty</span>
          <span>Live?</span>
          <span />
        </div>

        {/* Tier rows */}
        <div className="divide-y">
          {tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_100px_60px_36px] gap-2 px-3 py-2 items-center">
              <Input
                className="h-8 text-sm"
                value={tier.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Tier name"
              />
              <div className="space-y-0.5">
                <Input
                  className="h-8 text-sm font-mono"
                  type="number"
                  min={0}
                  value={tier.price_in_kobo}
                  onChange={(e) => update(i, { price_in_kobo: Number(e.target.value) })}
                />
                <p className="text-[10px] text-muted-foreground leading-none">
                  {nairaDisplay(tier.price_in_kobo)}
                </p>
              </div>
              <Input
                className="h-8 text-sm"
                type="number"
                min={0}
                value={tier.max_quantity ?? ""}
                onChange={(e) =>
                  update(i, { max_quantity: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="∞"
              />
              <div className="flex justify-center">
                <Checkbox
                  checked={tier.is_available}
                  onCheckedChange={(v) => update(i, { is_available: !!v })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => remove(i)}
                disabled={tiers.length === 1}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
        <Plus className="size-4" />
        Add tier
      </Button>

      {submitError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3 border border-red-200">
          <AlertCircle className="size-4 shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || tiers.length === 0 || tiers.some((t) => !t.name.trim())}
          className="gap-2"
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarPlus className="size-4" />
          )}
          {isSubmitting ? "Creating event…" : "Create Event"}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const EMPTY_FORM: EventForm = {
  title: "",
  description: "",
  event_date: "",
  location: "",
  max_attendees: "",
  price_in_kobo: "",
};

export function EventCreatePage() {
  const notify = useNotify();
  const redirect = useRedirect();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [tiers, setTiers] = useState<TicketTypeInput[]>(DEFAULT_TIERS);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createEventWithTicketTypes({
        data: {
          eventData: {
            title: form.title.trim(),
            description: form.description.trim() || undefined,
            event_date: new Date(form.event_date).toISOString(),
            location: form.location.trim() || undefined,
            max_attendees: form.max_attendees ? Number(form.max_attendees) : null,
            price_in_kobo: form.price_in_kobo ? Number(form.price_in_kobo) : 0,
          },
          ticketTypes: tiers,
        },
      }),
    onSuccess: ({ eventId }) => {
      notify("Event created successfully", { type: "success" });
      redirect("show", "events", eventId);
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const STEPS = ["Event Details", "Ticket Types"];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 rounded-full p-3">
          <CalendarPlus className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Event</h1>
          <p className="text-sm text-muted-foreground">
            Set up a new event and its ticket tiers
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2;
          const active = step === stepNum;
          const done = step > stepNum;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`size-7 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {stepNum}
              </div>
              <span
                className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRight className="size-4 text-muted-foreground mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === 1 ? (
        <EventDetailsStep
          form={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          onNext={() => setStep(2)}
        />
      ) : (
        <TicketTypesStep
          tiers={tiers}
          onChange={setTiers}
          onBack={() => setStep(1)}
          onSubmit={() => { setSubmitError(null); mutate(); }}
          isSubmitting={isPending}
          submitError={submitError}
        />
      )}
    </div>
  );
}
```

### Step 2: Verify build passes

```bash
bun run build 2>&1 | grep -E "error|Error|✓"
```

Expected: `✓ built in` with no TypeScript errors.

### Step 3: Commit

```bash
git add src/components/admin/event-create-page.tsx
git commit -m "feat: add EventCreatePage stepper component"
```

---

## Task 3: Wire up route and sidebar

**Files:**
- Modify: `src/routes/admin/$.tsx`
- Modify: `src/components/admin/app-sidebar.tsx`

### Step 1: Add the route

In `src/routes/admin/$.tsx`, add the import at the top with the other custom pages:

```typescript
import { EventCreatePage } from "@/components/admin/event-create-page";
```

Inside `<CustomRoutes>`:

```typescript
<RouterRoute path="/event-create" element={<EventCreatePage />} />
```

### Step 2: Add the sidebar entry

In `src/components/admin/app-sidebar.tsx`, add `CalendarPlus` to the lucide import:

```typescript
import { CalendarPlus, CreditCard, RefreshCw, ScanLine, ShieldCheck, TicketPlus } from "lucide-react";
```

Add `CreateEventMenuItem` component after `ResourceMenuItem`:

```typescript
export const CreateEventMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: "/admin/event-create", end: false });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/admin/event-create" onClick={onClick}>
          <CalendarPlus />
          Create Event
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
```

In `AppSidebar`, add after the resource list and before `CheckInMenuItem`:

```typescript
<CreateEventMenuItem onClick={handleClick} />
```

### Step 3: Verify build passes

```bash
bun run build 2>&1 | grep -E "error|Error|✓"
```

Expected: `✓ built in` with no errors.

### Step 4: Commit

```bash
git add src/routes/admin/$.tsx src/components/admin/app-sidebar.tsx
git commit -m "feat: wire event-create route and sidebar entry"
```

---

## Task 4: Final verification

### Step 1: Run all tests

```bash
bun run test --run
```

Expected: all existing tests pass plus 3 new `event-create` tests.

### Step 2: Full build

```bash
bun run build
```

Expected: client and SSR builds complete with no errors.

### Step 3: Manual smoke test checklist

- [ ] Navigate to `/admin/event-create` via sidebar
- [ ] Step 1: leave title blank → click "Ticket Types" → see validation error
- [ ] Step 1: fill title + date → advance to step 2
- [ ] Step 2: 4 pre-filled rows visible; edit a name and price
- [ ] Step 2: add a 5th tier via "Add tier" button
- [ ] Step 2: delete a tier (trash icon)
- [ ] Step 2: submit → redirects to new event show page
- [ ] Verify ticket types appear on event show page

### Step 4: Commit if anything was tweaked

```bash
git add -p
git commit -m "fix: event-create smoke test fixes"
```
