import { describe, it, expect, vi, beforeEach } from "vitest";

const makeChain = (overrides: Record<string, unknown> = {}) => ({
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  ...overrides,
});

vi.mock("./supabase-provider", () => ({
  supabaseClient: {
    from: vi.fn((table: string) => {
      if (table === "events") return eventsChain;
      if (table === "ticket_types") return ticketTypesChain;
      return makeChain();
    }),
  },
}));

let eventsChain: ReturnType<typeof makeChain>;
let ticketTypesChain: ReturnType<typeof makeChain>;

import { createEventWithTicketTypesHandler } from "./event-create";

const EVENT_DATA = {
  title: "Test Event",
  description: "Desc",
  event_date: "2026-03-01T10:00:00Z",
  location: "Lagos",
  max_attendees: 500,
  price_in_kobo: 0,
};

const TICKET_TYPES = [
  { name: "General", price_in_kobo: 1_000_000, max_quantity: null, is_available: true },
  { name: "VIP",     price_in_kobo: 1_800_000, max_quantity: null, is_available: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  eventsChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  } as unknown as ReturnType<typeof makeChain>;

  ticketTypesChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  } as unknown as ReturnType<typeof makeChain>;
});

describe("createEventWithTicketTypesHandler", () => {
  it("inserts event then ticket types and returns eventId", async () => {
    const eventId = "event-uuid-1";
    (eventsChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: eventId },
      error: null,
    });
    (ticketTypesChain.select as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: TICKET_TYPES.map((t, i) => ({ ...t, id: `tt-${i}`, event_id: eventId })),
      error: null,
    });

    const result = await createEventWithTicketTypesHandler(EVENT_DATA, TICKET_TYPES);
    expect(result).toEqual({ eventId });
  });

  it("rolls back event when ticket type insert fails", async () => {
    const eventId = "event-uuid-2";
    (eventsChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: eventId },
      error: null,
    });
    (ticketTypesChain.select as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    await expect(createEventWithTicketTypesHandler(EVENT_DATA, TICKET_TYPES)).rejects.toThrow();
    expect(eventsChain.eq).toHaveBeenCalledWith("id", eventId);
  });

  it("throws when event insert fails", async () => {
    (eventsChain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "event insert failed" },
    });

    await expect(createEventWithTicketTypesHandler(EVENT_DATA, TICKET_TYPES)).rejects.toThrow(
      "event insert failed",
    );
  });
});
