import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Resend
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    batch: {
      send: vi.fn(),
    },
  })),
}));

// Mock supabase
vi.mock("./supabase-provider", () => ({
  supabaseClient: {
    from: vi.fn((table: string) => {
      if (table === "tickets") return ticketsChain;
      if (table === "ticket_types") return ticketTypesChain;
      return {};
    }),
  },
}));

let ticketsChain: Record<string, ReturnType<typeof vi.fn>>;
let ticketTypesChain: Record<string, ReturnType<typeof vi.fn>>;
let mockBatchSend: ReturnType<typeof vi.fn>;

import { fetchEmailTicketsHandler, sendTicketEmailsHandler } from "./email";
import { Resend } from "resend";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "test-key";

  ticketsChain = {
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  };

  ticketTypesChain = {
    select: vi.fn().mockResolvedValue({
      data: [{ id: "tt1", name: "General" }],
      error: null,
    }),
  };

  mockBatchSend = vi.fn();
  (Resend as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    batch: { send: mockBatchSend },
  }));
});

describe("fetchEmailTicketsHandler", () => {
  it("returns formatted ticket rows", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: [
        {
          id: "t1",
          email: "jane@test.com",
          name: "Jane Doe",
          status: "paid",
          price_paid: 1000000,
          paystack_reference: "PSK-ABC",
          qr_code_url: "https://example.com/qr/1",
          ticket_type_id: "tt1",
        },
      ],
      error: null,
    });

    const result = await fetchEmailTicketsHandler({});
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("jane@test.com");
    expect(result[0].ticketTypeName).toBe("General"); // resolved via typeMap
  });

  it("throws on Supabase error", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: null,
      error: { message: "DB error" },
    });

    await expect(fetchEmailTicketsHandler({})).rejects.toThrow("DB error");
  });
});

describe("sendTicketEmailsHandler", () => {
  const recipients = [
    {
      email: "jane@test.com",
      name: "Jane Doe",
      ticketTypeName: "General",
      pricePaid: 1000000,
      reference: "PSK-ABC",
      qrCodeUrl: "https://example.com/qr/1",
    },
  ];

  const includeFields = {
    name: true,
    ticketType: true,
    qrCode: true,
    dateVenue: true,
    pricePaid: true,
    reference: true,
  };

  it("calls Resend batch.send with one email per recipient", async () => {
    mockBatchSend.mockResolvedValueOnce({ data: { data: [{ id: "msg1" }] }, error: null });

    const result = await sendTicketEmailsHandler({
      recipients,
      subject: "Your ticket",
      message: "Hello!",
      includeFields,
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    const calls = mockBatchSend.mock.calls[0][0];
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("jane@test.com");
    expect(calls[0].subject).toBe("Your ticket");
    expect(result.sent).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it("returns failed entry when Resend errors", async () => {
    mockBatchSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid API key" },
    });

    const result = await sendTicketEmailsHandler({
      recipients,
      subject: "Your ticket",
      message: "",
      includeFields,
    });

    expect(result.sent).toBe(0);
    expect(result.failed[0].email).toBe("jane@test.com");
    expect(result.failed[0].error).toContain("Invalid API key");
  });

  it("returns empty result for empty recipients", async () => {
    const result = await sendTicketEmailsHandler({
      recipients: [],
      subject: "Test",
      message: "",
      includeFields,
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toHaveLength(0);
    expect(mockBatchSend).not.toHaveBeenCalled();
  });
});
