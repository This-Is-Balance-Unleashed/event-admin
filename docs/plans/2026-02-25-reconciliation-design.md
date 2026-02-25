# Payment Reconciliation Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

A production bug caused the Paystack webhook to fail silently, leaving tickets stuck in `reserved` status with no QR codes generated. Evidence from exported data:
- 99 Supabase tickets: all `reserved`, all `qr_code_url = null`
- 186 Paystack transactions: 41 `success`, 142 `abandoned`, 4 `failed`

**Affected records:** reserved Supabase tickets whose `paystack_reference` base (without `-N` suffix) matches a Paystack `success` transaction reference.

## Approach

Dedicated `/admin/reconciliation` custom route (Option A — same pattern as PaymentsPage). Two server functions cross-reference live Paystack API with live Supabase data. Bulk checkbox-select UI lets admin pick affected tickets and resolve in one action.

## Data Flow

### Reference Matching
Supabase ticket `paystack_reference` format: `{base_ref}-{N}` (e.g. `1771972002656_gbs248-2`)
Paystack API `Reference` format: `{base_ref}` (e.g. `1771972002656_gbs248`)

Matching logic (done in-memory, JavaScript):
1. Fetch all Paystack `success` transactions (paginated, all pages)
2. Fetch all `reserved` tickets from Supabase
3. For each reserved ticket, strip trailing `-N` from `paystack_reference` → base ref
4. If base ref exists in Paystack success set → ticket is "affected"

### QR Code Generation (replicates unleashed-app verify route logic)
- `ticket_secret` format: `${base_reference}::${event_id}::ticket-${position}`
  - `position` = the numeric suffix from the ticket's `paystack_reference` (e.g. `2` from `-2`)
- Generate PNG buffer: `await QRCode.toBuffer(ticket_secret, { type: 'png' })`
- Upload to Supabase Storage bucket `qr-codes`, path `tickets/${base_reference}-ticket-${position}.png`
  - Note: `user_id` is null for all affected tickets; using `tickets/` prefix instead
- Get public URL from storage
- Update ticket: `status = 'paid'`, `qr_code_url = <public_url>`, `ticket_secret = <value>`

### Group Booking Handling
If ticket has `group_booking_id`:
- Resolve all tickets in the same group (not just the one selected)
- Set `group_bookings.status = 'paid'` for the group record

## Files

| File | Action |
|------|--------|
| `src/lib/reconciliation-handler.ts` | Create — pure handler functions (testable) |
| `src/lib/reconciliation.test.ts` | Create — unit tests for handler |
| `src/lib/reconciliation.ts` | Create — thin `createServerFn` wrappers |
| `src/components/admin/reconciliation-page.tsx` | Create — UI component |
| `src/components/admin/app-sidebar.tsx` | Modify — add ReconciliationMenuItem |
| `src/routes/admin/$.tsx` | Modify — add /reconciliation route |

## New Dependency

Install `qrcode` + `@types/qrcode` (already in unleashed-app at `^1.5.4`):
```bash
bun add qrcode && bun add -d @types/qrcode
```

## UI Specification

**Header row:**
- Title: "Payment Reconciliation"
- Count chip: "N tickets need resolution" (updates after resolve)
- Refresh button: re-fetches live data

**Table columns:**
☑ Select | Email | Name | Reference | Ticket Type | Amount (₦) | Paystack | Supabase | Group?

**Bulk controls (above table):**
- "Select All" checkbox
- "Resolve Selected" button — disabled when nothing selected, shows spinner during mutation
- Resolves all selected ticket IDs in a single server function call

**Row states:**
- Pending: normal row, checkbox enabled
- Resolving: row dimmed with spinner
- Resolved (after refresh): green "Resolved" badge, checkbox disabled

**Error handling:**
- Per-ticket error shown inline (partial success allowed)
- Top-level error banner if the fetch itself fails

## Out of Scope (Future)

- Email notification to affected users (planned as follow-on feature)
- `partnership_inquiries` resource (unrelated)
- Preventing the root webhook bug (separate issue in unleashed-app)
