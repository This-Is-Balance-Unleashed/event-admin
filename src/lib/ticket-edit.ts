import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";

export type EditableTicket = {
  id: string;
  name?: string;
  email: string;
  status: string;
  ticket_type_id: string;
  ticketTypeName?: string;
  paystack_reference?: string;
};

export async function fetchEditableTicketsHandler(): Promise<EditableTicket[]> {
  const { data, error } = await supabaseClient
    .from("tickets")
    .select("id, name, email, status, ticket_type_id, paystack_reference")
    .not("paystack_reference", "ilike", "test_%")
    .order("created_at", { ascending: false });

  if (error || !data) throw new Error(error?.message ?? "Failed to load tickets");

  const realData = data.filter(
    (row) => !row.paystack_reference?.toLowerCase().startsWith("test_"),
  );

  const { data: types } = await supabaseClient.from("ticket_types").select("id, name");
  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name as string]));

  return realData.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    status: row.status,
    ticket_type_id: row.ticket_type_id,
    ticketTypeName: typeMap.get(row.ticket_type_id) ?? undefined,
    paystack_reference: row.paystack_reference ?? undefined,
  }));
}

export async function updateTicketHandler(input: {
  id: string;
  name?: string;
  ticketTypeId?: string;
}): Promise<void> {
  const patch: Record<string, string> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.ticketTypeId) patch.ticket_type_id = input.ticketTypeId;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabaseClient.from("tickets").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function bulkUpdateTicketTypeHandler(input: {
  ids: string[];
  ticketTypeId: string;
}): Promise<void> {
  if (input.ids.length === 0) return;
  const { error } = await supabaseClient
    .from("tickets")
    .update({ ticket_type_id: input.ticketTypeId })
    .in("id", input.ids);
  if (error) throw new Error(error.message);
}

export const fetchEditableTickets = createServerFn({ method: "POST" }).handler(() =>
  fetchEditableTicketsHandler(),
);

export const updateTicket = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; name?: string; ticketTypeId?: string }) => input,
  )
  .handler(({ data }) => updateTicketHandler(data));

export const bulkUpdateTicketType = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[]; ticketTypeId: string }) => input)
  .handler(({ data }) => bulkUpdateTicketTypeHandler(data));
