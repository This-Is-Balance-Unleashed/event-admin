import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";

export type CheckInTicket = {
  id: string;
  name: string | null;
  email: string;
  status: "reserved" | "paid" | "failed" | "used";
  price_paid: number;
  checked_in_at: string | null;
  ticket_type_id: string;
  ticket_types: { name: string } | null;
};

async function searchTicketsHandler(q: string): Promise<CheckInTicket[]> {
  if (!q.trim() || q.trim().length < 2) return [];

  // Split into words so no spaces appear in ILIKE values — supabase-js encodes
  // spaces as '+' via URLSearchParams but PostgREST treats '+' as a literal plus
  // in or() filter values, so '%Faith+Oluwibe%' never matches 'Faith Oluwibe'.
  const words = q.trim().split(/\s+/);
  const orParts = [
    `ticket_secret.eq.${q.trim()}`,
    ...words.flatMap((w) => [`name.ilike.%${w}%`, `email.ilike.%${w}%`]),
  ];

  const { data, error } = await supabaseClient
    .from("tickets")
    .select("id, name, email, status, price_paid, checked_in_at, ticket_type_id")
    .or(orParts.join(","))
    .not("paystack_reference", "ilike", "test_%")
    .limit(10);

  if (error) throw new Error("Search failed: " + error.message);
  if (!data || data.length === 0) return [];

  // Enrich with ticket type names — one extra round-trip, not N+1.
  const typeIds = [...new Set(data.map((t) => t.ticket_type_id as string))];
  const { data: types } = await supabaseClient
    .from("ticket_types")
    .select("id, name")
    .in("id", typeIds);

  const typeMap = new Map<string, string>(
    ((types ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]),
  );

  return (data as Array<Omit<CheckInTicket, "ticket_types"> & { ticket_type_id: string }>).map(
    (t) => ({
      ...t,
      ticket_types: typeMap.has(t.ticket_type_id) ? { name: typeMap.get(t.ticket_type_id)! } : null,
    }),
  );
}

async function checkInTicketHandler(id: string): Promise<void> {
  const { error } = await supabaseClient
    .from("tickets")
    .update({ status: "used", checked_in_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error("Check-in failed: " + error.message);
}

export const searchTickets = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => input)
  .handler(({ data }) => searchTicketsHandler(data.query));

export const checkInTicket = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(({ data }) => checkInTicketHandler(data.id));
