import QRCode from "qrcode";
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";

export type TicketCreateEntry = {
  email: string;
  name?: string;
};

export type TicketCreateResult = {
  created: number;
  errors: Array<{ email: string; error: string }>;
};

function toMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

async function createTicketsHandler(
  entries: TicketCreateEntry[],
  ticketTypeId: string,
): Promise<TicketCreateResult> {
  if (entries.length === 0) return { created: 0, errors: [] };

  // 1. Fetch ticket type for price
  const { data: ticketType, error: typeError } = await supabaseClient
    .from("ticket_types")
    .select("id, price_in_kobo")
    .eq("id", ticketTypeId)
    .single();

  if (typeError || !ticketType) {
    throw new Error("Ticket type not found");
  }

  // 2. Fetch event id (single event)
  const { data: event, error: eventError } = await supabaseClient
    .from("events")
    .select("id")
    .limit(1)
    .single();

  if (eventError || !event) {
    throw new Error("Event not found");
  }

  const created: number[] = [];
  const errors: Array<{ email: string; error: string }> = [];
  const batchTimestamp = Date.now();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    try {
      const ref = `MANUAL-${batchTimestamp}-${i + 1}`;

      // INSERT ticket
      const { data: ticket, error: insertError } = await supabaseClient
        .from("tickets")
        .insert({
          email: entry.email,
          name: entry.name || null,
          status: "paid",
          price_paid: ticketType.price_in_kobo,
          ticket_type_id: ticketTypeId,
          event_id: event.id,
          paystack_reference: ref,
          user_id: null,
        })
        .select("id")
        .single();

      if (insertError || !ticket) throw new Error(toMessage(insertError) || "Insert failed");

      // Generate ticket_secret and QR code
      const ticketSecret = `${ref}::${event.id}::ticket-1`;
      const qrBuffer = await QRCode.toBuffer(ticketSecret, {
        errorCorrectionLevel: "H",
        type: "png",
        width: 400,
        margin: 2,
      });

      const filePath = `tickets/${ref}-ticket-1.png`;
      const { error: uploadError } = await supabaseClient.storage
        .from("qr-codes")
        .upload(filePath, qrBuffer, { contentType: "image/png", upsert: true });

      if (uploadError) throw new Error(toMessage(uploadError));

      const {
        data: { publicUrl },
      } = supabaseClient.storage.from("qr-codes").getPublicUrl(filePath);

      const { error: updateError } = await supabaseClient
        .from("tickets")
        .update({ ticket_secret: ticketSecret, qr_code_url: publicUrl })
        .eq("id", ticket.id);

      if (updateError) throw new Error(toMessage(updateError));

      created.push(1);
    } catch (err) {
      errors.push({ email: entry.email, error: toMessage(err) });
    }
  }

  return { created: created.length, errors };
}

export const createTickets = createServerFn({ method: "POST" })
  .inputValidator((input: { entries: TicketCreateEntry[]; ticketTypeId: string }) => input)
  .handler(({ data }) => createTicketsHandler(data.entries, data.ticketTypeId));

/** Fetch all ticket types for the type selector (server-side, service role) */
async function fetchTicketTypesHandler(): Promise<
  Array<{ id: string; name: string; price_in_kobo: number }>
> {
  const { data, error } = await supabaseClient
    .from("ticket_types")
    .select("id, name, price_in_kobo")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(toMessage(error));
  return data ?? [];
}

export const fetchTicketTypes = createServerFn().handler(fetchTicketTypesHandler);
