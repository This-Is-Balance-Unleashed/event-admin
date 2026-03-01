# Ticket Status Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to change a ticket's status (reserved / paid / failed / used) from the ticket show page.

**Architecture:** Extend the existing `updateTicketHandler` server function to accept an optional `status` field, auto-writing `checked_in_at` when status becomes `used`. In the UI, add a status `<Select>` to the existing `EditTicketSection` in `ticket-show.tsx`; the existing Save Changes button commits all three fields (name, ticket type, status) in one call.

**Tech Stack:** TanStack Start server functions (`createServerFn`), ra-core (`useRecordContext`, `useNotify`, `useRefresh`), shadcn/ui `Select`, Vitest

---

### Task 1: Extend `updateTicketHandler` to accept `status`

**Files:**

- Modify: `src/lib/ticket-edit.ts`

**Step 1: Write the failing tests**

Add to `src/lib/ticket-edit.test.ts` inside the existing `describe("updateTicketHandler")` block:

```ts
it("updates status when provided", async () => {
  ticketsChain.eq.mockResolvedValueOnce({ error: null });
  await updateTicketHandler({ id: "t1", status: "paid" });
  expect(ticketsChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "paid" }));
});

it("sets checked_in_at when status is 'used'", async () => {
  ticketsChain.eq.mockResolvedValueOnce({ error: null });
  await updateTicketHandler({ id: "t1", status: "used" });
  const patch = ticketsChain.update.mock.calls[0][0];
  expect(patch.status).toBe("used");
  expect(typeof patch.checked_in_at).toBe("string"); // ISO date string
});

it("does not set checked_in_at for non-used statuses", async () => {
  ticketsChain.eq.mockResolvedValueOnce({ error: null });
  await updateTicketHandler({ id: "t1", status: "failed" });
  const patch = ticketsChain.update.mock.calls[0][0];
  expect(patch.checked_in_at).toBeUndefined();
});
```

**Step 2: Run tests to verify they fail**

```bash
bun run test src/lib/ticket-edit.test.ts
```

Expected: 3 new tests FAIL ("updates status when provided" etc.)

**Step 3: Extend `updateTicketHandler` in `src/lib/ticket-edit.ts`**

Change the handler input type and patch logic:

```ts
export async function updateTicketHandler(input: {
  id: string;
  name?: string;
  ticketTypeId?: string;
  status?: string;
}): Promise<void> {
  const patch: Record<string, string> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.ticketTypeId) patch.ticket_type_id = input.ticketTypeId;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "used") patch.checked_in_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseClient.from("tickets").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
}
```

Also extend the `createServerFn` inputValidator to include `status`:

```ts
export const updateTicket = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; name?: string; ticketTypeId?: string; status?: string }) => input,
  )
  .handler(({ data }) => updateTicketHandler(data));
```

**Step 4: Run tests to verify they pass**

```bash
bun run test src/lib/ticket-edit.test.ts
```

Expected: All tests PASS (was 7, now 10)

**Step 5: Commit**

```bash
git add src/lib/ticket-edit.ts src/lib/ticket-edit.test.ts
git commit -m "feat: extend updateTicketHandler to accept status field"
```

---

### Task 2: Add status Select to `EditTicketSection` in `ticket-show.tsx`

**Files:**

- Modify: `src/components/admin/ticket-show.tsx`

**Step 1: Add `status` state to `EditTicketSection`**

In the `EditTicketSection` function, add alongside the existing `name` and `ticketTypeId` state:

```ts
const [status, setStatus] = useState(record?.status ?? "");
```

Also ensure `status` is reset when the record changes — add it to the `useEffect`:

```ts
useEffect(() => {
  if (!record) return;
  setName(record.name ?? "");
  setTicketTypeId(record.ticket_type_id ?? "");
  setStatus(record.status ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [record?.id]);
```

**Step 2: Pass `status` to `updateTicket` in `handleSave`**

```ts
await updateTicket({
  data: {
    id: String(record.id),
    name: name || undefined,
    ticketTypeId: ticketTypeId || undefined,
    status: status || undefined,
  },
});
```

**Step 3: Add the status `<Select>` to the JSX**

Add this block between the Ticket Type `<div>` and the Save button, inside the existing `flex flex-col gap-3` container:

```tsx
<div>
  <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
  <Select value={status} onValueChange={setStatus}>
    <SelectTrigger className="h-8 text-sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {(["reserved", "paid", "failed", "used"] as const).map((s) => (
        <SelectItem key={s} value={s}>
          <TicketStatusBadge status={s} />
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

**Step 4: Run typecheck and lint**

```bash
bun run typecheck
bun run lint
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/components/admin/ticket-show.tsx
git commit -m "feat: add status selector to ticket show edit section"
```

---

### Task 3: Verify end-to-end

**Step 1: Run all tests**

```bash
bun run test
```

Expected: all tests pass.

**Step 2: Run build**

```bash
bun run build
```

Expected: build succeeds with no type errors.
