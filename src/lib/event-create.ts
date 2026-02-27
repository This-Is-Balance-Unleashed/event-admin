import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";

export type EventCreateData = {
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  max_attendees?: number | null;
  price_in_kobo?: number;
};

export type TicketTypeInput = {
  name: string;
  price_in_kobo: number;
  max_quantity: number | null;
  is_available: boolean;
};

function toMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

export async function createEventWithTicketTypesHandler(
  eventData: EventCreateData,
  ticketTypes: TicketTypeInput[],
): Promise<{ eventId: string }> {
  if (ticketTypes.length === 0) throw new Error("At least one ticket type is required");
  // 1. Insert event
  const { data: event, error: eventError } = await supabaseClient
    .from("events")
    .insert({
      title: eventData.title,
      description: eventData.description || null,
      event_date: eventData.event_date,
      location: eventData.location || null,
      max_attendees: eventData.max_attendees ?? null,
      price_in_kobo: eventData.price_in_kobo ?? 0,
    })
    .select("id")
    .single();

  if (eventError || !event) throw new Error(toMessage(eventError) || "Event insert failed");

  const eventId = event.id;

  // 2. Insert ticket types linked to new event
  const { error: typesError } = await supabaseClient
    .from("ticket_types")
    .insert(
      ticketTypes.map((t, i) => ({
        name: t.name,
        price_in_kobo: t.price_in_kobo,
        max_quantity: t.max_quantity ?? null,
        is_available: t.is_available,
        sort_order: i + 1,
        event_id: eventId,
      })),
    )
    .select();

  if (typesError) {
    // Rollback: delete the event
    const { error: rollbackError } = await supabaseClient.from("events").delete().eq("id", eventId);
    const rollbackNote = rollbackError ? ` (rollback also failed: ${toMessage(rollbackError)})` : "";
    throw new Error(toMessage(typesError) + rollbackNote);
  }

  return { eventId };
}

export const createEventWithTicketTypes = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { eventData: EventCreateData; ticketTypes: TicketTypeInput[] }) => input,
  )
  .handler(({ data }) =>
    createEventWithTicketTypesHandler(data.eventData, data.ticketTypes),
  );
