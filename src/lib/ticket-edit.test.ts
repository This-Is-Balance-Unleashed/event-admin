import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase-provider", () => ({
  supabaseClient: {
    from: vi.fn((table: string) => {
      if (table === "tickets") return ticketsChain;
      if (table === "ticket_types") return typesChain;
      return {};
    }),
  },
}));

let ticketsChain: Record<string, ReturnType<typeof vi.fn>>;
let typesChain: Record<string, ReturnType<typeof vi.fn>>;

import {
  fetchEditableTicketsHandler,
  updateTicketHandler,
  bulkUpdateTicketTypeHandler,
} from "./ticket-edit";

beforeEach(() => {
  vi.clearAllMocks();

  ticketsChain = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };

  typesChain = {
    select: vi.fn().mockResolvedValue({
      data: [
        { id: "tt1", name: "General" },
        { id: "tt2", name: "VIP" },
      ],
      error: null,
    }),
  };
});

describe("fetchEditableTicketsHandler", () => {
  it("returns tickets with ticket type names merged", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: [
        {
          id: "t1",
          email: "a@b.com",
          name: "Alice",
          status: "paid",
          ticket_type_id: "tt1",
          paystack_reference: "PSK-1",
        },
      ],
      error: null,
    });

    const result = await fetchEditableTicketsHandler();
    expect(result).toHaveLength(1);
    expect(result[0].ticketTypeName).toBe("General");
  });

  it("excludes test_ tickets client-side", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: [
        {
          id: "t1",
          email: "a@b.com",
          name: "Alice",
          status: "paid",
          ticket_type_id: "tt1",
          paystack_reference: "PSK-REAL",
        },
        {
          id: "t2",
          email: "b@b.com",
          name: "Bot",
          status: "paid",
          ticket_type_id: "tt1",
          paystack_reference: "test_abc",
        },
      ],
      error: null,
    });

    const result = await fetchEditableTicketsHandler();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });

  it("throws on supabase error", async () => {
    ticketsChain.order.mockResolvedValueOnce({ data: null, error: { message: "DB error" } });
    await expect(fetchEditableTicketsHandler()).rejects.toThrow("DB error");
  });
});

describe("updateTicketHandler", () => {
  it("updates name when provided", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: null });
    await expect(updateTicketHandler({ id: "t1", name: "Bob" })).resolves.toBeUndefined();
    expect(ticketsChain.update).toHaveBeenCalledWith(expect.objectContaining({ name: "Bob" }));
  });

  it("updates ticket_type_id when ticketTypeId provided", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: null });
    await updateTicketHandler({ id: "t1", ticketTypeId: "tt2" });
    expect(ticketsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_type_id: "tt2" }),
    );
  });

  it("no-ops when no fields given", async () => {
    await updateTicketHandler({ id: "t1" });
    expect(ticketsChain.update).not.toHaveBeenCalled();
  });

  it("throws on supabase error", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: { message: "Update failed" } });
    await expect(updateTicketHandler({ id: "t1", name: "Bob" })).rejects.toThrow("Update failed");
  });

  it("updates status when provided", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: null });
    await updateTicketHandler({ id: "t1", status: "paid" });
    expect(ticketsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" }),
    );
  });

  it("sets checked_in_at when status is 'used'", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: null });
    await updateTicketHandler({ id: "t1", status: "used" });
    const patch = ticketsChain.update.mock.calls[0][0];
    expect(patch.status).toBe("used");
    expect(patch.checked_in_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("does not set checked_in_at for non-used statuses", async () => {
    ticketsChain.eq.mockResolvedValueOnce({ error: null });
    await updateTicketHandler({ id: "t1", status: "failed" });
    const patch = ticketsChain.update.mock.calls[0][0];
    expect(patch.checked_in_at).toBeNull();
  });
});

describe("bulkUpdateTicketTypeHandler", () => {
  it("updates ticket_type_id for all ids", async () => {
    ticketsChain.in.mockResolvedValueOnce({ error: null });
    await bulkUpdateTicketTypeHandler({ ids: ["t1", "t2"], ticketTypeId: "tt2" });
    expect(ticketsChain.update).toHaveBeenCalledWith({ ticket_type_id: "tt2" });
    expect(ticketsChain.in).toHaveBeenCalledWith("id", ["t1", "t2"]);
  });

  it("no-ops for empty ids array", async () => {
    await bulkUpdateTicketTypeHandler({ ids: [], ticketTypeId: "tt2" });
    expect(ticketsChain.update).not.toHaveBeenCalled();
  });

  it("throws on supabase error", async () => {
    ticketsChain.in.mockResolvedValueOnce({ error: { message: "Bulk update failed" } });
    await expect(bulkUpdateTicketTypeHandler({ ids: ["t1"], ticketTypeId: "tt2" })).rejects.toThrow(
      "Bulk update failed",
    );
  });
});
