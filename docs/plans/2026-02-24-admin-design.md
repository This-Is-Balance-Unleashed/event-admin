# Admin Design: Tickets, Coupons & Check-in Validation

**Date:** 2026-02-24
**Project:** event-admin (shadcn-admin-kit + TanStack Start)
**Target:** Hit Refresh Conference (unleashed-app Supabase project)

---

## Goals

1. **Tickets resource** — list and view all ticket purchases, filterable by status/email/name, with inline check-in action
2. **Coupons resource** — full CRUD (list, create, edit, delete)
3. **Check-in validation page** — dedicated door-staff UI to search by QR ticket secret, name, or email and mark tickets as used

---

## Architecture: Approach A — ra-supabase Direct

- **Data provider:** `supabaseDataProvider` from `ra-supabase`, using the Supabase service role key so RLS is bypassed and all records are visible
- **Auth:** Disabled for now (`requireAuth` not set) — add later
- **Framework:** TanStack Start (SSR) + TanStack Router file-based routing
- **UI:** shadcn-admin-kit components (`<List>`, `<DataTable>`, `<Edit>`, `<SimpleForm>`, etc.)

### Environment Variables (event-admin)

```
VITE_SUPABASE_URL=<same as unleashed-app NEXT_PUBLIC_SUPABASE_URL>
VITE_SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

---

## File Structure

```
src/
├── lib/
│   └── supabase-provider.ts        # dataProvider + supabaseClient setup
├── routes/
│   └── admin/
│       ├── index.tsx               # Admin root — wires <Admin> + Resources
│       ├── tickets/
│       │   ├── index.tsx           # TicketList
│       │   └── $id.tsx             # TicketShow
│       ├── coupons/
│       │   ├── index.tsx           # CouponList
│       │   ├── create.tsx          # CouponCreate
│       │   └── $id.tsx             # CouponEdit
│       └── checkin/
│           └── index.tsx           # Check-in page (standalone, no Layout)
└── components/admin/
    └── check-in-form.tsx           # Search + result card + confirm button
```

---

## Resource: Tickets

### List view
- **Columns:** name, email, ticket_type_id (referenced), status (badge), price_paid, created_at, checked_in_at
- **Filters:** status (select), email (search input), name (search input)
- **Bulk actions:** none (read-mostly)
- **Row actions:** Show detail, Check In (only visible when status = 'paid')

### Show view
- All ticket fields displayed
- **Check In button** — calls Supabase `update` to set `status = 'used'` and `checked_in_at = now()`
- Shows ticket type name via `<ReferenceField>` to `ticket_types`

---

## Resource: Coupons

### List view
- **Columns:** code, discount_type, discount_value, is_active (toggle), times_used / max_uses, expires_at
- **Row actions:** Edit, Delete
- **Top action:** Create button

### Create / Edit form
- `code` — text input (uppercase enforced)
- `discount_type` — select (percent / fixed)
- `discount_value` — number input
- `is_active` — boolean toggle
- `expires_at` — date-time input
- `max_uses` — number input (0 = unlimited)

---

## Check-in Page

Standalone full-screen page at `/admin/checkin` (uses the admin Layout but content is a custom component).

### UX Flow
1. Single search box — user types a QR ticket secret, attendee name, or email
2. Debounced query against `tickets` table — matches on `ticket_secret`, `name`, or `email`
3. Result card shows: name, email, ticket type, current status (color-coded badge)
4. If status is `paid` → big green **"Check In"** button
5. If status is `used` → red banner "Already checked in at [time]"
6. If status is `reserved` / `failed` → amber warning "Payment not confirmed"
7. On confirm → updates `status = 'used'`, `checked_in_at = now()` → success toast

### Multi-result handling
- If email/name matches multiple tickets, show a list of result cards
- Each card has its own Check In button

---

## Data Flow

```
Check-in page
  └─ search input (debounced 300ms)
      └─ supabaseClient.from('tickets').select().or(...)
          └─ result cards
              └─ Check In button
                  └─ supabaseClient.from('tickets').update({ status, checked_in_at }).eq('id', ...)
                      └─ success toast → reset search
```

For the tickets/coupons List and Edit, all data flows through ra-core's standard `dataProvider` calls.

---

## Sidebar Navigation

The `AppSidebar` (already exists in `components/admin/app-sidebar.tsx`) will be updated to include:
- Tickets (with ticket icon)
- Coupons (with tag icon)
- Check In (with scan/qr icon — highlighted as a primary action)

---

## UX Quality Notes

- Status badges use semantic color: green (paid/used), amber (reserved), red (failed)
- Check-in page is optimised for mobile (door staff on phones)
- Search is instant (debounced), no submit button needed
- Keyboard: Enter on search triggers immediate lookup
- Large touch targets on the check-in page for quick scanning
