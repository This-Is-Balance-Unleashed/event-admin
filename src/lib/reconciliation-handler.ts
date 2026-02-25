import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AffectedTicket {
  id: string;
  email: string;
  name: string;
  paystack_reference: string;
  ticket_type_id: string;
  price_paid: number;
  status: string;
  group_booking_id: string | null;
  event_id: string;
  // Derived from paystack_reference
  base_reference: string;
  position: number;
  // From Paystack API
  paystack_amount: number;
  paystack_channel: string;
  paystack_date: string;
  is_group: boolean;
}

export interface ResolveResult {
  resolved: number;
  errors: Array<{ ticketId: string; error: string }>;
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Strips the trailing -N suffix added by the purchase route.
 * "1771972002656_gbs248-2" → { baseRef: "1771972002656_gbs248", position: 2 }
 */
export function parseReference(paystackReference: string): { baseRef: string; position: number } {
  const match = paystackReference.match(/^(.+)-(\d+)$/);
  if (!match) return { baseRef: paystackReference, position: 1 };
  return { baseRef: match[1], position: parseInt(match[2], 10) };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/**
 * Fetches all Paystack "success" transactions (paginated) and cross-references
 * with all "reserved" Supabase tickets to find the affected set.
 */
export async function getReconciliationDataHandler(
  client: SupabaseClient,
): Promise<AffectedTicket[]> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");

  // 1. Fetch ALL Paystack success transactions (paginate through all pages)
  const successRefs = new Map<string, { amount: number; channel: string; paid_at: string }>();
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await fetch(
      `https://api.paystack.co/transaction?perPage=${perPage}&page=${page}&status=success`,
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
    );
    if (!res.ok) throw new Error(`Paystack API error: ${res.status}`);
    const body = await res.json();
    for (const tx of body.data) {
      successRefs.set(tx.reference, {
        amount: tx.amount,
        channel: tx.channel,
        paid_at: tx.paid_at,
      });
    }
    if (body.meta.page >= body.meta.pageCount) break;
    page++;
  }

  // 2. Fetch all reserved tickets from Supabase
  const { data: tickets, error } = await client
    .from("tickets")
    .select("id, email, name, paystack_reference, ticket_type_id, price_paid, status, group_booking_id, event_id")
    .eq("status", "reserved");

  if (error) throw error;
  if (!tickets) return [];

  // 3. Cross-reference: match base references
  const affected: AffectedTicket[] = [];
  for (const ticket of tickets) {
    const { baseRef, position } = parseReference(ticket.paystack_reference);
    const paystackData = successRefs.get(baseRef);
    if (!paystackData) continue;

    affected.push({
      ...ticket,
      base_reference: baseRef,
      position,
      paystack_amount: paystackData.amount,
      paystack_channel: paystackData.channel,
      paystack_date: paystackData.paid_at,
      is_group: !!ticket.group_booking_id,
    });
  }

  return affected;
}

/**
 * For each given ticket ID:
 *   - Expands group bookings (resolves all siblings)
 *   - Generates ticket_secret and QR code PNG
 *   - Uploads to Supabase storage "qr-codes" bucket
 *   - Updates ticket: status='paid', qr_code_url, ticket_secret
 *   - Updates group_bookings.status='paid' if applicable
 * Returns { resolved, errors } — partial success is allowed.
 */
export async function resolveTicketsHandler(
  client: SupabaseClient,
  ticketIds: string[],
): Promise<ResolveResult> {
  // 1. Fetch ticket details for given IDs
  const { data: tickets, error } = await client
    .from("tickets")
    .select("id, email, name, paystack_reference, event_id, group_booking_id, ticket_secret, qr_code_url")
    .in("id", ticketIds);

  if (error) throw error;
  if (!tickets || tickets.length === 0) return { resolved: 0, errors: [] };

  // 2. Expand: include all sibling tickets from the same group bookings
  const groupIds = [...new Set(
    tickets.filter((t) => t.group_booking_id).map((t) => t.group_booking_id as string),
  )];

  let allTickets = [...tickets];
  if (groupIds.length > 0) {
    const { data: groupTickets } = await client
      .from("tickets")
      .select("id, email, name, paystack_reference, event_id, group_booking_id, ticket_secret, qr_code_url")
      .in("group_booking_id", groupIds);

    if (groupTickets) {
      const seen = new Set(tickets.map((t) => t.id));
      for (const gt of groupTickets) {
        if (!seen.has(gt.id)) allTickets.push(gt);
      }
    }
  }

  // 3. Process each ticket — partial failure allowed
  let resolved = 0;
  const errors: Array<{ ticketId: string; error: string }> = [];

  for (const ticket of allTickets) {
    try {
      const { baseRef, position } = parseReference(ticket.paystack_reference);
      const ticketSecret = ticket.ticket_secret ?? `${baseRef}::${ticket.event_id}::ticket-${position}`;

      // Generate QR code PNG buffer (same options as unleashed-app verify route)
      const qrBuffer = await QRCode.toBuffer(ticketSecret, {
        errorCorrectionLevel: "H",
        type: "png",
        width: 400,
        margin: 2,
      });

      // Upload to Supabase storage
      // Note: user_id is null for affected tickets; using "tickets/" prefix instead
      const filePath = `tickets/${baseRef}-ticket-${position}.png`;
      const { error: uploadError } = await client.storage
        .from("qr-codes")
        .upload(filePath, qrBuffer, { contentType: "image/png", upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = client.storage.from("qr-codes").getPublicUrl(filePath);

      // Update ticket record
      const { error: updateError } = await client
        .from("tickets")
        .update({ status: "paid", qr_code_url: publicUrl, ticket_secret: ticketSecret })
        .eq("id", ticket.id);

      if (updateError) throw updateError;

      // Update group booking status if applicable
      if (ticket.group_booking_id) {
        await client
          .from("group_bookings")
          .update({ status: "paid" })
          .eq("id", ticket.group_booking_id);
      }

      resolved++;
    } catch (err) {
      errors.push({
        ticketId: ticket.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { resolved, errors };
}
