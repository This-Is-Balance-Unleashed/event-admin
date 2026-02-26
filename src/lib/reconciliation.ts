import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import {
  getReconciliationDataHandler,
  resolveTicketsHandler,
  getUnprovisionedGroupBookingsHandler,
  resolveGroupBookingHandler,
} from "./reconciliation-handler";

export type {
  AffectedTicket,
  ResolveResult,
  UnprovisionedGroupBooking,
  GroupResolveResult,
} from "./reconciliation-handler";

export const fetchReconciliationData = createServerFn().handler(() =>
  getReconciliationDataHandler(supabaseClient),
);

export const resolveTickets = createServerFn({ method: "POST" })
  .inputValidator((input: { ticketIds: string[] }) => input)
  .handler(({ data }) => resolveTicketsHandler(supabaseClient, data.ticketIds));

export const fetchUnprovisionedGroupBookings = createServerFn().handler(() =>
  getUnprovisionedGroupBookingsHandler(supabaseClient),
);

export const resolveGroupBookings = createServerFn({ method: "POST" })
  .inputValidator((input: { groupBookingIds: string[] }) => input)
  .handler(({ data }) => resolveGroupBookingHandler(supabaseClient, data.groupBookingIds));
