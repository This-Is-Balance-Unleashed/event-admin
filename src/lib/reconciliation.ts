import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import { getReconciliationDataHandler, resolveTicketsHandler } from "./reconciliation-handler";

export type { AffectedTicket, ResolveResult } from "./reconciliation-handler";

export const fetchReconciliationData = createServerFn().handler(() =>
  getReconciliationDataHandler(supabaseClient),
);

export const resolveTickets = createServerFn({ method: "POST" })
  .inputValidator((input: { ticketIds: string[] }) => input)
  .handler(({ data }) => resolveTicketsHandler(supabaseClient, data.ticketIds));
