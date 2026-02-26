# Event Create with Ticket Types — Design

**Date:** 2026-02-26
**Status:** Approved

## Overview

A multi-step stepper page that creates a new event and its ticket types in a single guided flow. Uses a server function to chain both inserts atomically.

## Architecture

- **Custom page** at `/admin/event-create` — same pattern as `ticket-create-page`, `reconciliation-page`
- Not using ra-core `<Create>` — it only handles a single resource; we need two
- **Server function** `createEventWithTicketTypes` in `src/lib/event-create.ts`:
  1. INSERT into `events` → get new `event_id`
  2. INSERT all ticket types linked to `event_id`
  3. On ticket type failure: DELETE the event (rollback)
  4. Returns `{ eventId }` on success
- **Redirect** to the new event's show page (`/admin/events/{id}/show`) on success
- **Sidebar entry** "Create Event" (CalendarPlus icon) added in `app-sidebar.tsx`
- **Route** registered in `src/routes/admin/$.tsx` as `/event-create`

## Step 1 — Event Details

Fields:
- `title` — text, required
- `description` — textarea, optional
- `event_date` — datetime picker, required
- `location` — text, optional
- `max_attendees` — number, optional
- `price_in_kobo` — number with live ₦ naira preview (value / 100), optional

Validation before advancing to step 2: `title` and `event_date` must be non-empty.

## Step 2 — Ticket Types

Starts pre-filled with 4 standard tiers:

| Name       | Price (kobo) | Max Qty | Available |
|------------|-------------|---------|-----------|
| General    | 1,000,000   | —       | true      |
| VIP        | 1,800,000   | —       | true      |
| Corporate  | 7,000,000   | —       | true      |
| Virtual    | 650,000     | —       | true      |

Each row editable inline:
- `name` — text input
- `price_in_kobo` — number input with live ₦ preview
- `max_quantity` — number input (blank = unlimited)
- `is_available` — checkbox toggle
- Delete (trash icon) — removes the row; at least 1 row required

**Add tier** button appends a blank row at the bottom.

Sort order is assigned automatically (1-indexed by row position at submit time).

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/lib/event-create.ts` | Create — server function |
| `src/components/admin/event-create-page.tsx` | Create — stepper UI |
| `src/routes/admin/$.tsx` | Modify — add `/event-create` custom route |
| `src/components/admin/app-sidebar.tsx` | Modify — add CreateEventMenuItem |

## Error Handling

- Step 1 validation: inline field errors before user can advance
- Server errors: displayed as a banner on step 2's submit button area
- Partial failure (event created, ticket types failed): server rolls back the event; user sees the error and can retry
