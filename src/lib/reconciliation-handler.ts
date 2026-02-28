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

export interface UnprovisionedGroupBooking {
  id: string;
  booking_reference: string;
  company_name: string;
  primary_contact_name: string;
  primary_contact_email: string;
  paystack_reference: string;
  ticket_type_id: string;
  total_price_paid: number;
  status: string;
  paystack_amount: number;
  paystack_date: string;
  members: Array<{ id: string; name: string; email: string; member_position: number }>;
}

export interface GroupResolveResult {
  groupBookingId: string;
  ticketsCreated: number;
  errors: Array<{ memberId: string; error: string }>;
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

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Fetches all Paystack "success" transactions (paginated) and returns a map
 * of reference → { amount, channel, paid_at }.
 */
async function fetchAllPaystackSuccessRefs(
  key: string,
): Promise<Map<string, { amount: number; channel: string; paid_at: string }>> {
  const successRefs = new Map<string, { amount: number; channel: string; paid_at: string }>();
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await fetch(
      `https://api.paystack.co/transaction?perPage=${perPage}&page=${page}&status=success`,
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
    );
    if (!res.ok) throw new Error(`Paystack API error: ${res.status}`);
    const body = (await res.json()) as {
      status: boolean;
      data: Array<{ reference: string; amount: number; channel: string; paid_at: string }>;
      meta: { page: number; pageCount: number };
    };
    if (!body.status) throw new Error("Paystack API returned status false");
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

  return successRefs;
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
  const successRefs = await fetchAllPaystackSuccessRefs(key);

  // 2. Fetch all reserved tickets from Supabase
  const { data: tickets, error } = await client
    .from("tickets")
    .select(
      "id, email, name, paystack_reference, ticket_type_id, price_paid, status, group_booking_id, event_id",
    )
    .eq("status", "reserved")
    .not("paystack_reference", "ilike", "test_%");

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
 * Detects group bookings that were paid on Paystack but have zero tickets
 * created in the tickets table (webhook failure before provisioning).
 */
export async function getUnprovisionedGroupBookingsHandler(
  client: SupabaseClient,
): Promise<UnprovisionedGroupBooking[]> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");

  const successRefs = await fetchAllPaystackSuccessRefs(key);

  // Query group_bookings where status != 'paid'
  const { data: groupBookings, error } = await client
    .from("group_bookings")
    .select(
      "id, booking_reference, company_name, primary_contact_name, primary_contact_email, paystack_reference, ticket_type_id, total_price_paid, status",
    )
    .neq("status", "paid");

  if (error) throw error;
  if (!groupBookings) return [];

  const unprovisioned: UnprovisionedGroupBooking[] = [];

  for (const booking of groupBookings) {
    const paystackData = successRefs.get(booking.paystack_reference);
    if (!paystackData) continue;

    // Count tickets for this group booking
    const { count, error: countError } = await client
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("group_booking_id", booking.id);

    if (countError) continue;
    if (count !== 0) continue;

    // Fetch members ordered by member_position
    const { data: members, error: membersError } = await client
      .from("group_members")
      .select("id, name, email, member_position")
      .eq("group_booking_id", booking.id)
      .order("member_position");

    if (membersError) continue;

    unprovisioned.push({
      ...booking,
      paystack_amount: paystackData.amount,
      paystack_date: paystackData.paid_at,
      members: members ?? [],
    });
  }

  return unprovisioned;
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
  if (ticketIds.length === 0) return { resolved: 0, errors: [] };

  // 1. Fetch ticket details for given IDs
  const { data: tickets, error } = await client
    .from("tickets")
    .select(
      "id, email, name, paystack_reference, event_id, group_booking_id, ticket_secret, qr_code_url",
    )
    .in("id", ticketIds);

  if (error) throw error;
  if (!tickets || tickets.length === 0) return { resolved: 0, errors: [] };

  // 2. Expand: include all sibling tickets from the same group bookings
  const groupIds = [
    ...new Set(tickets.filter((t) => t.group_booking_id).map((t) => t.group_booking_id as string)),
  ];

  let allTickets = [...tickets];
  if (groupIds.length > 0) {
    const { data: groupTickets } = await client
      .from("tickets")
      .select(
        "id, email, name, paystack_reference, event_id, group_booking_id, ticket_secret, qr_code_url",
      )
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
      const ticketSecret =
        ticket.ticket_secret ?? `${baseRef}::${ticket.event_id}::ticket-${position}`;

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
        const { error: groupUpdateError } = await client
          .from("group_bookings")
          .update({ status: "paid" })
          .eq("id", ticket.group_booking_id);
        if (groupUpdateError) throw groupUpdateError;
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

/**
 * Creates tickets for group booking members that were paid but never provisioned.
 * Per-member partial failure is allowed; group status only flips to 'paid' when
 * all members succeed.
 */
export async function resolveGroupBookingHandler(
  client: SupabaseClient,
  groupBookingIds: string[],
): Promise<GroupResolveResult[]> {
  if (groupBookingIds.length === 0) return [];

  // Fetch event_id
  const { data: event, error: eventError } = await client
    .from("events")
    .select("id")
    .limit(1)
    .single();

  if (eventError) throw eventError;
  const eventId = event.id;

  const results: GroupResolveResult[] = [];

  for (const groupBookingId of groupBookingIds) {
    const errors: Array<{ memberId: string; error: string }> = [];
    let ticketsCreated = 0;

    // Fetch booking record
    const { data: booking, error: bookingError } = await client
      .from("group_bookings")
      .select("id, paystack_reference, ticket_type_id, total_price_paid")
      .eq("id", groupBookingId)
      .single();

    if (bookingError) {
      results.push({
        groupBookingId,
        ticketsCreated: 0,
        errors: [{ memberId: "booking", error: bookingError.message }],
      });
      continue;
    }

    // Fetch members ordered by member_position
    const { data: members, error: membersError } = await client
      .from("group_members")
      .select("id, name, email, member_position")
      .eq("group_booking_id", groupBookingId)
      .order("member_position");

    if (membersError) {
      results.push({
        groupBookingId,
        ticketsCreated: 0,
        errors: [{ memberId: "members", error: membersError.message }],
      });
      continue;
    }

    const memberList = members ?? [];
    const memberCount = memberList.length;

    for (const member of memberList) {
      try {
        const memberRef = `${booking.paystack_reference}-${member.member_position}`;
        const pricePaid = Math.floor(booking.total_price_paid / memberCount);

        // INSERT ticket
        const { data: newTicket, error: insertError } = await client
          .from("tickets")
          .insert({
            paystack_reference: memberRef,
            status: "paid",
            price_paid: pricePaid,
            group_booking_id: groupBookingId,
            user_id: null,
            email: member.email,
            name: member.name,
            ticket_type_id: booking.ticket_type_id,
            event_id: eventId,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        const ticketId = newTicket.id;
        const ticketSecret = `${booking.paystack_reference}::${eventId}::ticket-${member.member_position}`;

        // Generate QR code
        const qrBuffer = await QRCode.toBuffer(ticketSecret, {
          errorCorrectionLevel: "H",
          type: "png",
          width: 400,
          margin: 2,
        });

        // Upload to storage
        const filePath = `tickets/${booking.paystack_reference}-ticket-${member.member_position}.png`;
        const { error: uploadError } = await client.storage
          .from("qr-codes")
          .upload(filePath, qrBuffer, { contentType: "image/png", upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const {
          data: { publicUrl },
        } = client.storage.from("qr-codes").getPublicUrl(filePath);

        // Update ticket: qr_code_url, ticket_secret
        const { error: updateTicketError } = await client
          .from("tickets")
          .update({ qr_code_url: publicUrl, ticket_secret: ticketSecret })
          .eq("id", ticketId);

        if (updateTicketError) throw updateTicketError;

        // Update group_members.assigned_ticket_id
        const { error: updateMemberError } = await client
          .from("group_members")
          .update({ assigned_ticket_id: ticketId })
          .eq("id", member.id);

        if (updateMemberError) throw updateMemberError;

        ticketsCreated++;
      } catch (err) {
        errors.push({
          memberId: member.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Only mark group paid when all members succeeded
    if (errors.length === 0) {
      await client.from("group_bookings").update({ status: "paid" }).eq("id", groupBookingId);
    }

    results.push({ groupBookingId, ticketsCreated, errors });
  }

  return results;
}
