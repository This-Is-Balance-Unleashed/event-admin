# Paystack Payments Page — Design

**Date:** 2026-02-24
**Status:** Approved

## Overview

A read-only admin page that lists all Paystack transactions for the Hit Refresh Conference. Rendered inside the existing Admin shell (same sidebar/layout as Check-in) via a `CustomRoute`.

## Architecture

```
/admin/payments
  ├── CustomRoute inside <Admin> (src/routes/admin/$.tsx)
  ├── PaymentsPage component  (src/components/admin/payments-page.tsx)
  └── Server function          (src/lib/paystack.ts)
        └── createServerFn → GET https://api.paystack.co/transaction
```

The page follows the same pattern as `CheckInPage` — a custom route wired inside the `<Admin>` component via `CustomRoutes`, giving it the full sidebar/layout/auth context automatically.

## Data Flow

1. `src/lib/paystack.ts` exports a `createServerFn` that:
   - Reads `PAYSTACK_SECRET_KEY` (server-only env var, no `VITE_` prefix)
   - Calls `GET https://api.paystack.co/transaction` with `perPage` and `page` query params
   - Returns the `{ data, meta }` response from Paystack

2. `PaymentsPage` component:
   - Maintains `page` state (client-side)
   - Calls the server function via `useQuery` (TanStack Query, already available)
   - Renders a loading skeleton, error state, or the data table

3. No mutations — strictly read-only. No create/edit/delete controls.

## UI Spec

### Header

- Title: "Payments"
- Subtitle: total count from Paystack meta (e.g. "1,234 transactions")

### Table Columns

| Column    | Source field     | Format                                                 |
| --------- | ---------------- | ------------------------------------------------------ |
| Reference | `reference`      | monospace text                                         |
| Amount    | `amount`         | ₦ (divided by 100, formatted)                          |
| Status    | `status`         | badge: success (green), failed (red), abandoned (gray) |
| Customer  | `customer.email` | plain text                                             |
| Channel   | `channel`        | pill: card / bank / ussd                               |
| Date      | `paid_at`        | date + time                                            |

### Pagination

- Previous / Next buttons
- "Page X of Y" display derived from `meta.pageCount`
- `perPage` fixed at 50

### Sidebar

- Static `PaymentsMenuItem` added to `app-sidebar.tsx` matching `CheckInMenuItem` pattern
- Route: `/admin/payments`
- Icon: `CreditCard` (lucide-react)

## Environment

Add to `.env` (server-only, no `VITE_` prefix):

```
PAYSTACK_SECRET_KEY=sk_live_...
```

This key is never sent to the browser — only accessed inside the `createServerFn` which runs server-side.

## Files to Create / Modify

| File                                     | Action                                              |
| ---------------------------------------- | --------------------------------------------------- |
| `src/lib/paystack.ts`                    | Create — `createServerFn` wrapping Paystack API     |
| `src/components/admin/payments-page.tsx` | Create — page component                             |
| `src/components/admin/app-sidebar.tsx`   | Modify — add `PaymentsMenuItem`                     |
| `src/routes/admin/$.tsx`                 | Modify — add `<RouterRoute path="/payments" ... />` |
| `.env`                                   | Modify — add `PAYSTACK_SECRET_KEY`                  |

## Out of Scope

- Filtering by date range or status (can be added later)
- Search by reference/email
- Export to CSV
- Any write operations (refund, etc.)
