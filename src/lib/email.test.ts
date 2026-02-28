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

  it("excludes tickets with paystack_reference starting with test_", async () => {
    ticketsChain.order.mockResolvedValueOnce({
      data: [
        {
          id: "t-real",
          email: "real@test.com",
          name: "Real User",
          status: "paid",
          price_paid: 1000000,
          paystack_reference: "PSK-REAL",
          qr_code_url: null,
          ticket_type_id: "tt1",
        },
        {
          id: "t-test",
          email: "test@test.com",
          name: "Test User",
          status: "paid",
          price_paid: 0,
          paystack_reference: "test_abc123",
          qr_code_url: null,
          ticket_type_id: "tt1",
        },
      ],
      error: null,
    });

    const result = await fetchEmailTicketsHandler({});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t-real");
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

  it("splits 150 recipients into two batch calls of 100 and 50", async () => {
    const manyRecipients = Array.from({ length: 150 }, (_, i) => ({
      email: `user${i}@test.com`,
      name: `User ${i}`,
    }));

    // First batch (100) succeeds, second batch (50) succeeds
    mockBatchSend
      .mockResolvedValueOnce({ data: { data: Array(100).fill({ id: "x" }) }, error: null })
      .mockResolvedValueOnce({ data: { data: Array(50).fill({ id: "x" }) }, error: null });

    const result = await sendTicketEmailsHandler({
      recipients: manyRecipients,
      subject: "Batch test",
      message: "",
      includeFields,
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(2);
    expect(mockBatchSend.mock.calls[0][0]).toHaveLength(100);
    expect(mockBatchSend.mock.calls[1][0]).toHaveLength(50);
    expect(result.sent).toBe(150);
    expect(result.failed).toHaveLength(0);
  });

  it("marks only the failing batch's recipients as failed", async () => {
    const manyRecipients = Array.from({ length: 120 }, (_, i) => ({
      email: `user${i}@test.com`,
      name: `User ${i}`,
    }));

    // First batch succeeds, second fails
    mockBatchSend
      .mockResolvedValueOnce({ data: { data: Array(100).fill({ id: "x" }) }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Rate limit" } });

    const result = await sendTicketEmailsHandler({
      recipients: manyRecipients,
      subject: "Partial fail",
      message: "",
      includeFields,
    });

    expect(result.sent).toBe(100);
    expect(result.failed).toHaveLength(20);
    expect(result.failed[0].email).toBe("user100@test.com");
    expect(result.failed[0].error).toContain("Rate limit");
  });

  it("flags invalid email addresses without calling Resend", async () => {
    const result = await sendTicketEmailsHandler({
      recipients: [{ email: "not-an-email", name: "Bad Guy" }],
      subject: "Test",
      message: "",
      includeFields,
    });

    expect(mockBatchSend).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].email).toBe("not-an-email");
    expect(result.failed[0].error).toContain("Invalid email address");
  });

  it("sends valid addresses and flags invalid ones in a mixed list", async () => {
    mockBatchSend.mockResolvedValueOnce({ data: { data: [{ id: "msg1" }] }, error: null });

    const result = await sendTicketEmailsHandler({
      recipients: [
        { email: "good@example.com", name: "Good" },
        { email: "bad-address", name: "Bad" },
        { email: "Jane Doe <jane@example.com>", name: "Jane" },
        { email: "missing-at-sign.com", name: "Missing AT" },
      ],
      subject: "Mixed",
      message: "",
      includeFields,
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    const sentEmails = mockBatchSend.mock.calls[0][0];
    expect(sentEmails).toHaveLength(2); // good@example.com and Jane Doe <...>
    expect(result.failed).toHaveLength(2);
    expect(result.failed.map((f) => f.email)).toContain("bad-address");
    expect(result.failed.map((f) => f.email)).toContain("missing-at-sign.com");
  });

  it("returns early with all failed when every address is invalid", async () => {
    const result = await sendTicketEmailsHandler({
      recipients: [
        { email: "nope", name: "A" },
        { email: "also nope", name: "B" },
      ],
      subject: "All bad",
      message: "",
      includeFields,
    });

    expect(mockBatchSend).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.failed).toHaveLength(2);
  });

  it("100 recipients exactly uses a single batch call", async () => {
    const exactHundred = Array.from({ length: 100 }, (_, i) => ({
      email: `user${i}@test.com`,
    }));

    mockBatchSend.mockResolvedValueOnce({
      data: { data: Array(100).fill({ id: "x" }) },
      error: null,
    });

    const result = await sendTicketEmailsHandler({
      recipients: exactHundred,
      subject: "Exact 100",
      message: "",
      includeFields,
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(100);
  });
});
