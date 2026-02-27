# Email Feature Design — Send Ticket Emails via Resend

**Date:** 2026-02-27
**Status:** Approved

---

## Overview

Allow admins to send branded HTML ticket confirmation emails to one or multiple attendees directly from the admin panel. Recipients can be selected from the ticket list or pasted as free-form emails. The admin edits the subject, a custom message, and chooses which ticket fields to include before sending.

---

## Architecture

### New files

| File                                  | Purpose                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/email.ts`                    | `sendTicketEmails` + `fetchEmailTickets` server functions (Resend) |
| `src/components/admin/email-page.tsx` | Full compose + send UI                                             |

### Modified files

| File                                   | Change                                    |
| -------------------------------------- | ----------------------------------------- |
| `src/routes/admin/$.tsx`               | Add `/email` custom route                 |
| `src/components/admin/app-sidebar.tsx` | Add `SendEmailMenuItem`                   |
| `.env`                                 | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |

### Data flow

1. Page loads → `fetchEmailTickets` server fn fetches tickets from Supabase (search/filter params)
2. Admin selects recipients (checkboxes / select-all / paste emails), picks included fields, edits subject + message
3. On send → `sendTicketEmails` server fn builds one branded HTML email per recipient, calls Resend batch API
4. Result: `X sent, Y failed` with per-failure details displayed

### Single-ticket path

Navigating from the ticket show page passes `?email=foo@bar.com` as a query param → `/admin/email?email=foo@bar.com` → page auto-selects that row on load.

---

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  Send Ticket Emails                                     │
├──────────────────────────┬──────────────────────────────┤
│  1. Recipients           │  3. Compose                  │
│  ┌────────────────────┐  │  Subject: [____________]     │
│  │ Search  [_______]  │  │                              │
│  │ Filter: All|Paid.. │  │  Custom message:             │
│  │ ☑ Select All (42)  │  │  [____________________]     │
│  │ ─────────────────  │  │  [____________________]     │
│  │ ☐ Jane Doe         │  │                              │
│  │    jane@email.com  │  │  Include fields:             │
│  │ ☐ John Smith       │  │  ☑ Name  ☑ Ticket Type      │
│  │    john@email.com  │  │  ☑ QR Code  ☑ Date/Venue    │
│  │ ...                │  │  ☐ Price Paid  ☐ Reference   │
│  └────────────────────┘  │                              │
│  42 selected             │  4. Preview                  │
│                          │  ┌──────────────────────┐   │
│  2. Or paste emails      │  │ [Branded email HTML] │   │
│  [___________________]   │  │ rendered inline      │   │
│                          │  └──────────────────────┘   │
│                          │  [    Send to 42     ]       │
└──────────────────────────┴──────────────────────────────┘
```

- **Left panel**: ticket selector table (virtualized >50 rows), search + status filter, select-all toggle, OR free-form email paste area for ad-hoc recipients
- **Right panel**: subject input, custom message textarea, field checkboxes, live HTML preview, send button showing recipient count
- Single-ticket: `?email=` query param auto-selects the matching row

---

## Email Template

Branded HTML email built server-side:

| Section            | Content                                                          |
| ------------------ | ---------------------------------------------------------------- |
| Header             | Hit Refresh logo on `#39B54A` green background                   |
| Hero               | "It's Time To Breathe Again" (serif heading)                     |
| Event info         | Feb 28, 2026 · Pistis Annex, Lekki, Lagos                        |
| Custom message     | Admin's typed message as a paragraph                             |
| Conditional fields | Name, Ticket Type, Price (₦X,XXX), Reference, QR Code CTA button |
| Footer             | `events@balanceunleashed.org`, social links                      |

**Colors:** `#39B54A` green · `#FF8E00` orange accent · `#f5f1ed` background · `#1a1a1a` text
**Fonts:** Young Serif (heading fallback: Georgia) · DM Sans (body fallback: Arial)

### Included field checkboxes (admin picks before send)

- Name
- Ticket type
- QR Code (as CTA button)
- Event date & venue
- Price paid
- Ticket reference number

---

## Server Function Contracts

### `fetchEmailTickets({ search?, status? })`

- Queries `tickets` table (with joins to `ticket_types`)
- Returns: `Array<{ id, email, name, status, ticket_type_name, price_paid, paystack_reference, qr_code_url }>`

### `sendTicketEmails({ recipients, subject, message, includeFields })`

- `recipients`: `Array<{ email, name?, ticketTypeName?, pricePaid?, reference?, qrCodeUrl? }>`
- `subject`: string
- `message`: string (admin's custom text)
- `includeFields`: `{ name, ticketType, qrCode, dateVenue, pricePaid, reference }`
- Uses Resend batch send API (`resend.batch.send`)
- Returns: `{ sent: number, failed: Array<{ email, error }> }`

---

## Environment Variables

```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=events@balanceunleashed.org
```

---

## Error Handling

- Resend API errors are caught per-recipient and surfaced in `failed[]`
- Network-level failure throws and shows a toast
- Empty recipient list is blocked at the UI level (send button disabled)

---

## Out of Scope

- Email open/click tracking
- Scheduling / delayed sends
- Email templates stored in the database
- Unsubscribe list management
