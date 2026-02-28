import QRCode from "qrcode";
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";

export interface GroupBookingMember {
  email: string;
  name?: string;
}

export interface GroupBookingCreateInput {
  bookingType: "corporate" | "group";
  companyOrGroupName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  ticketTypeId: string;
  members: GroupBookingMember[];
  /** Total amount the group actually paid, in kobo. Divided equally among members. */
  totalPricePaidKobo: number;
  paystackReference?: string;
}

export interface GroupBookingCreateResult {
  groupBookingId: string;
  created: number;
  errors: Array<{ email: string; error: string }>;
}

function toMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

async function createGroupBookingAdminHandler(
  input: GroupBookingCreateInput,
): Promise<GroupBookingCreateResult> {
  const {
    bookingType,
    companyOrGroupName,
    primaryContactName,
    primaryContactEmail,
    ticketTypeId,
    members,
    totalPricePaidKobo,
    paystackReference,
  } = input;

  if (members.length === 0) {
    throw new Error("At least one member is required");
  }

  // 1. Fetch ticket type for price
  const { data: ticketType, error: typeError } = await supabaseClient
    .from("ticket_types")
    .select("id, price_in_kobo")
    .eq("id", ticketTypeId)
    .single();

  if (typeError || !ticketType) throw new Error("Ticket type not found");

  // 2. Fetch event ID
  const { data: event, error: eventError } = await supabaseClient
    .from("events")
    .select("id")
    .limit(1)
    .single();

  if (eventError || !event) throw new Error("Event not found");

  // 3. Build booking reference
  const batchTimestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const bookingReference = paystackReference ?? `ADMIN-GB${batchTimestamp}_${randomSuffix}`;

  // Per-ticket share of the total — rounded down (last member absorbs any rounding)
  const perTicketPrice = Math.floor(totalPricePaidKobo / members.length);

  // 4. Insert group_booking (status='paid' — already provisioned by admin)
  const bookingPayload: Record<string, unknown> = {
    booking_reference: bookingReference,
    booking_type: bookingType,
    primary_contact_name: primaryContactName,
    primary_contact_email: primaryContactEmail,
    primary_contact_phone: "",
    ticket_type_id: ticketTypeId,
    quantity: members.length,
    total_price_paid: totalPricePaidKobo,
    discount_applied: 0,
    status: "paid",
    paystack_reference: bookingReference,
  };

  if (bookingType === "corporate") {
    bookingPayload.company_name = companyOrGroupName;
  } else {
    bookingPayload.group_name = companyOrGroupName;
  }

  const { data: groupBooking, error: bookingError } = await supabaseClient
    .from("group_bookings")
    .insert(bookingPayload)
    .select("id")
    .single();

  if (bookingError || !groupBooking) {
    throw new Error(toMessage(bookingError) || "Failed to create group booking");
  }

  const groupBookingId = groupBooking.id;
  let created = 0;
  const errors: Array<{ email: string; error: string }> = [];

  // 5. For each member: create group_member + ticket + QR
  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const memberPosition = i + 1;

    try {
      // Insert group_member
      const { data: groupMember, error: memberError } = await supabaseClient
        .from("group_members")
        .insert({
          group_booking_id: groupBookingId,
          name: member.name || null,
          email: member.email,
          member_position: memberPosition,
        })
        .select("id")
        .single();

      if (memberError || !groupMember) {
        throw new Error(toMessage(memberError) || "Failed to create group member");
      }

      // Insert ticket
      const ticketRef = `${bookingReference}-${memberPosition}`;
      const { data: ticket, error: insertError } = await supabaseClient
        .from("tickets")
        .insert({
          email: member.email,
          name: member.name || null,
          status: "paid",
          price_paid: perTicketPrice,
          ticket_type_id: ticketTypeId,
          event_id: event.id,
          paystack_reference: ticketRef,
          group_booking_id: groupBookingId,
          user_id: null,
        })
        .select("id")
        .single();

      if (insertError || !ticket) {
        throw new Error(toMessage(insertError) || "Insert failed");
      }

      // Generate QR code
      const ticketSecret = `${bookingReference}::${event.id}::ticket-${memberPosition}`;
      const qrBuffer = await QRCode.toBuffer(ticketSecret, {
        errorCorrectionLevel: "H",
        type: "png",
        width: 400,
        margin: 2,
      });

      const filePath = `tickets/${bookingReference}-ticket-${memberPosition}.png`;
      const { error: uploadError } = await supabaseClient.storage
        .from("qr-codes")
        .upload(filePath, qrBuffer, { contentType: "image/png", upsert: true });

      if (uploadError) throw new Error(toMessage(uploadError));

      const {
        data: { publicUrl },
      } = supabaseClient.storage.from("qr-codes").getPublicUrl(filePath);

      // Update ticket with secret + QR URL
      const { error: updateError } = await supabaseClient
        .from("tickets")
        .update({ ticket_secret: ticketSecret, qr_code_url: publicUrl })
        .eq("id", ticket.id);

      if (updateError) throw new Error(toMessage(updateError));

      // Link ticket to group_member
      const { error: linkError } = await supabaseClient
        .from("group_members")
        .update({ assigned_ticket_id: ticket.id })
        .eq("id", groupMember.id);

      if (linkError) throw new Error(toMessage(linkError));

      created++;
    } catch (err) {
      errors.push({ email: member.email, error: toMessage(err) });
    }
  }

  return { groupBookingId, created, errors };
}

export const createGroupBooking = createServerFn({ method: "POST" })
  .inputValidator((input: GroupBookingCreateInput) => input)
  .handler(({ data }) => createGroupBookingAdminHandler(data));
