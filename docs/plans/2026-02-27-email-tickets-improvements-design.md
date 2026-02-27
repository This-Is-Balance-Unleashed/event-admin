# Email & Tickets Improvements — Design Doc
**Date:** 2026-02-27
**Branch:** feature/email

---

## Overview

Six grouped improvements across the email feature and ticket management:

1. Email template copy fixes (header name, date+time row)
2. Ticket-type filter on email recipients panel
3. Template switcher (General vs. Virtual/Zoom)
4. Edit Tickets — bulk reassign ticket type + update name
5. Single-ticket inline edit on show page
6. Exclude test tickets globally (paystack_reference starts with `test_`)

---

## 1. Email Template Fixes (`src/lib/email-template.ts`)

### Header
- Change `Hit Refresh Conference` → `Hit Refresh` in the `<p>` header tag only.
- `EVENT.name` constant stays as-is (used for `<title>` tag).

### Date+Time row
- Replace the two separate `fieldRow("Date", ...)` and `fieldRow("Venue", ...)` rows with:
  - `fieldRow("Date", "February 28, 2026 · Registration 8am | Event 9am")`
  - `fieldRow("Venue", EVENT.venue)` (unchanged)
- Both still gated on `fields.dateVenue`.

---

## 2. Ticket-Type Filter on Email Page (`src/components/admin/email-page.tsx`)

- State: `typeFilter: string` (default `"all"`)
- Derived options: unique `ticketTypeName` values from loaded `tickets` array — computed once after load.
- `visibleTickets` filter chain: `matchesSearch && matchesStatus && matchesType`
- UI: a 3rd `<Select>` in the filter row (after status), labelled placeholder "All types"

---

## 3. Template Switcher on Email Page

### Templates defined as constants
```ts
type EmailTemplate = {
  key: string;
  label: string;
  subject: string;
  message: string;
  fields: IncludeFields;
}
```

**General Ticket** (current default):
- Subject: `"Your Hit Refresh Conference Ticket"`
- Message: current thank-you text
- Fields: name✓ ticketType✓ qrCode✓ dateVenue✓ pricePaid✗ reference✗

**Virtual Ticket (Zoom)**:
- Subject: `"Join Hit Refresh — Your Zoom Link"`
- Message:
  ```
  You're registered for the virtual stream of Hit Refresh 2026!

  Join Hit Refresh
  Meeting ID: 990 3699 3644
  Passcode: 775309
  ```
- Fields: name✓ ticketType✓ qrCode✗ dateVenue✓ pricePaid✗ reference✗
- The email CTA button: instead of "View Your QR Code", shows "Join Hit Refresh" linking to the Zoom URL.

### Implementation approach
- Add `zoomUrl?: string` to `EmailRecipient` type.
- In `buildEmailHtml`: if `fields.qrCode && recipient.zoomUrl`, show Zoom button; if `fields.qrCode && recipient.qrCodeUrl`, show QR button (existing behaviour).
- When Virtual template is selected on email page, set `zoomUrl` on all recipients mapped to `sendTicketEmails`.
- The template switcher is a `<Select>` above the subject field; selecting a template calls `applyTemplate(t)` which sets subject, message, and includeFields state.

---

## 4. Edit Tickets — Bulk Page (`src/components/admin/edit-tickets-page.tsx`)

### Route
- `/admin/tickets/edit` — added to `$.tsx` alongside existing admin routes.
- Sidebar: "Edit Tickets" item under the Tickets section with `Pencil` icon.

### Data
New server function `bulkUpdateTickets` in `src/lib/ticket-edit.ts`:
```ts
type BulkUpdateInput = {
  ids: string[];
  ticketTypeId?: string;  // if set, update ticket_type_id for all ids
  names?: Record<string, string>; // id → name, patch individual names
}
```
Uses `supabaseClient.from("tickets").update(...).in("id", ids)` for type change.
For names, patches one-by-one (small N, acceptable).
Excludes `test_` tickets from the loaded list.

### UI layout
```
[ Search ] [ Status filter ] [ Type filter ]           [ Apply Changes ]

 ☐  Name              Email              Status   Type
 ☐  —                 jane@...           paid     General     [edit name inline]
 ☑  John Doe          john@...           paid     VIP
 ☑  —                 sam@...            reserved General     [edit name inline]

Selected: 2   Move to: [ Select type ▾ ]   [ Apply ]
```

- Inline name edit: tickets with no name show a text input in the name column.
- Floating action bar at bottom (sticky): appears only when rows are selected.
- No price_paid update — only `ticket_type_id`.

---

## 5. Single-Ticket Inline Edit (`src/components/admin/ticket-show.tsx`)

Below the existing action buttons row, add an "Edit" collapsible section:
- Fields: Name (text input), Ticket Type (Select populated from ticket_types)
- "Save Changes" button → calls a `updateTicket` server function (single record update)
- Uses same `ticket-edit.ts` server functions (single-record variant)

---

## 6. Exclude Test Tickets Globally

Filter rule: `paystack_reference NOT ILIKE 'test_%'`

| Location | Mechanism |
|---|---|
| `TicketList` (ra-core List) | `filter={{ "paystack_reference@not.ilike": "test_%" }}` prop |
| `fetchEmailTicketsHandler` | `.not("paystack_reference", "ilike", "test_%")` on supabase query |
| `check-in-form.tsx` `searchTickets` | Add `.not("paystack_reference", "ilike", "test_%")` |
| `reconciliation-page.tsx` ticket queries | Add the same `.not(...)` filter |
| `EditTicketsPage` load | Add `.not("paystack_reference", "ilike", "test_%")` |

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/email-template.ts` | Header text, date+time row, zoomUrl button |
| `src/lib/email-template.test.ts` | Update/add tests for above |
| `src/lib/email.ts` | fetchEmailTickets: exclude test_ refs |
| `src/lib/email.test.ts` | Test for test_ exclusion |
| `src/lib/ticket-edit.ts` | New: bulkUpdateTickets, updateTicket server fns |
| `src/lib/ticket-edit.test.ts` | New: tests for above |
| `src/components/admin/email-page.tsx` | Type filter, template switcher, zoomUrl mapping |
| `src/components/admin/ticket-list.tsx` | filter prop to exclude test_ refs |
| `src/components/admin/ticket-show.tsx` | Inline edit section below actions |
| `src/components/admin/edit-tickets-page.tsx` | New: bulk edit page |
| `src/components/admin/check-in-form.tsx` | Exclude test_ from search |
| `src/components/admin/reconciliation-page.tsx` | Exclude test_ from ticket queries |
| `src/components/admin/app-sidebar.tsx` | Edit Tickets menu item |
| `src/routes/admin/$.tsx` | Wire /tickets/edit route |
