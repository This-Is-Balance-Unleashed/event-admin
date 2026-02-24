import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPaystackTransactionsHandler } from "./paystack-handler";

type PaystackTransaction = {
  id: number;
  reference: string;
  amount: number;
  status: string;
  channel: string;
  paid_at: string;
  customer: { email: string };
};

describe("fetchPaystackTransactions handler", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
  });

  it("calls Paystack API with correct auth header and pagination params", async () => {
    const mockTransactions: PaystackTransaction[] = [
      {
        id: 1,
        reference: "ref_abc",
        amount: 1000000,
        status: "success",
        channel: "card",
        paid_at: "2026-02-24T10:00:00Z",
        customer: { email: "test@example.com" },
      },
    ];
    const mockResponse = {
      status: true,
      data: mockTransactions,
      meta: { total: 1, skipped: 0, perPage: 50, page: 1, pageCount: 1 },
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchPaystackTransactionsHandler({
      data: { page: 1, perPage: 50 },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction?perPage=50&page=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_abc123",
        }),
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].reference).toBe("ref_abc");
  });

  it("throws when PAYSTACK_SECRET_KEY is not set", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    await expect(
      fetchPaystackTransactionsHandler({ data: { page: 1, perPage: 50 } }),
    ).rejects.toThrow("PAYSTACK_SECRET_KEY is not set");
  });

  it("throws on non-ok HTTP response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    await expect(
      fetchPaystackTransactionsHandler({ data: { page: 1, perPage: 50 } }),
    ).rejects.toThrow("Paystack API error: 401");
  });
});
