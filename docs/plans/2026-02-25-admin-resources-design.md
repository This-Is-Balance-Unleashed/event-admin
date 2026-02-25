# Admin Resources Design: events, ticket_types, group_bookings, group_members

**Date:** 2026-02-25
**Status:** Approved

## Overview

Add 4 new resources to the Hit Refresh admin panel. All get list + show + edit. `group_members` has no sidebar entry — it is embedded in the group booking detail page and registered as a silent Resource for ra-supabase's `ReferenceManyField` support.

## Architecture

4 new `Resource` entries in `src/routes/admin/$.tsx`. Component files go in `src/components/admin/`. `group_members` is embedded inside `group-booking-show.tsx` using `ReferenceManyField`.

## Schema Reference

### events

`id, organizer_id (→ auth.users), title, description, price_in_kobo, event_date, location, max_attendees, created_at, updated_at`

### ticket_types

`id, event_id (→ events), name, description, price_in_kobo, max_quantity, sold_quantity, is_available, sort_order, created_at, updated_at`

### group_bookings

`id, booking_reference, booking_type (corporate|group), company_name, company_logo_url, group_name, primary_contact_name, primary_contact_email, primary_contact_phone, selected_perks (JSONB), team_preferences, ticket_type_id (→ ticket_types), quantity, total_price_paid, discount_applied, paystack_reference, status (pending|paid|failed), coupon_id (→ coupons), created_at, updated_at`

### group_members

`id, group_booking_id (→ group_bookings), name, email, is_primary_contact, member_position, assigned_ticket_id (→ tickets), created_at`

## Resource Designs

### 1. events

**Sidebar:** "Events", icon: `Calendar` (lucide-react)
**Operations:** list, show, edit (no create — events are managed in the main app)
**Record representation:** `title`

**Files to create:**

- `src/components/admin/event-list.tsx`
- `src/components/admin/event-show.tsx`
- `src/components/admin/event-edit.tsx`

**List columns:** Title | Date (`event_date`) | Location | Max Attendees | Price (₦, from `price_in_kobo`) | Created At

**Show fields:** All columns + ticket types count via `ReferenceManyCount` on `ticket_types`

**Edit fields:** title, description, event_date, location, max_attendees, price_in_kobo

- `price_in_kobo` displayed/entered as ₦ (divide/multiply by 100 for display)
- `organizer_id`, `created_at`, `updated_at` are read-only — not in edit form

---

### 2. ticket_types

**Sidebar:** "Ticket Types", icon: `Tags` (lucide-react)
**Operations:** list, show, edit (no create)
**Record representation:** `name`

**Files to create:**

- `src/components/admin/ticket-type-list.tsx`
- `src/components/admin/ticket-type-show.tsx`
- `src/components/admin/ticket-type-edit.tsx`

**List columns:** Name | Event (ReferenceField → events.title) | Price (₦) | Sold / Max | Available badge

**Show fields:** All columns + event reference link

**Edit fields:** is_available (BooleanInput toggle), price_in_kobo (NumberInput), max_quantity (NumberInput)

- `name`, `sold_quantity`, `sort_order`, `event_id` are NOT in the edit form (operational integrity)

---

### 3. group_bookings

**Sidebar:** "Group Bookings", icon: `Users` (lucide-react)
**Operations:** list, show, edit (no create)
**Record representation:** `booking_reference`

**Files to create:**

- `src/components/admin/group-booking-list.tsx`
- `src/components/admin/group-booking-show.tsx`
- `src/components/admin/group-booking-edit.tsx`

**List columns:** Reference | Type (corporate/group badge) | Company / Group Name | Contact Email | Qty | Total (₦) | Status badge (pending/paid/failed) | Date

**Show fields:** Full detail including selected_perks (raw JSON display), team_preferences + embedded group_members sub-table

**Edit fields:** status only (SelectInput: pending | paid | failed)

**group_members sub-table** (in show page, via `ReferenceManyField`):
Columns: Position | Name | Email | Primary Contact (badge) | Assigned Ticket (ReferenceField → tickets, link to show)

---

### 4. group_members (silent resource)

**Sidebar:** None — no hasList, no list prop
**Operations:** edit only (accessed from group_booking show page inline)
**Record representation:** `name`

**Files to create:**

- `src/components/admin/group-member-edit.tsx`

**Edit fields:** name, email (position and group_booking_id not editable)

---

## Files to Create / Modify

| File                                          | Action                          |
| --------------------------------------------- | ------------------------------- |
| `src/components/admin/event-list.tsx`         | Create                          |
| `src/components/admin/event-show.tsx`         | Create                          |
| `src/components/admin/event-edit.tsx`         | Create                          |
| `src/components/admin/ticket-type-list.tsx`   | Create                          |
| `src/components/admin/ticket-type-show.tsx`   | Create                          |
| `src/components/admin/ticket-type-edit.tsx`   | Create                          |
| `src/components/admin/group-booking-list.tsx` | Create                          |
| `src/components/admin/group-booking-show.tsx` | Create                          |
| `src/components/admin/group-booking-edit.tsx` | Create                          |
| `src/components/admin/group-member-edit.tsx`  | Create                          |
| `src/routes/admin/$.tsx`                      | Modify — add 4 Resource entries |

## Out of Scope

- Create operations for any resource (managed in main app)
- Bulk edit / bulk delete
- Export to CSV
- `partnership_inquiries` resource (separate task)
- Events are single-instance (one per organizer) — no pagination concerns
