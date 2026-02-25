import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Must mock qrcode BEFORE importing the handler (hoisting)
vi.mock("qrcode", () => ({
  default: {
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-qr-png")),
  },
}));

import {
  parseReference,
  getReconciliationDataHandler,
  resolveTicketsHandler,
} from "./reconciliation-handler";

// ─── parseReference (pure function, no mocks needed) ───────────────────────

describe("parseReference", () => {
  it("strips trailing -N suffix and returns position", () => {
    expect(parseReference("1771972002656_gbs248-2")).toEqual({
      baseRef: "1771972002656_gbs248",
      position: 2,
    });
  });

  it("handles -1 single-ticket suffix", () => {
    expect(parseReference("1771944180130_npmaz-1")).toEqual({
      baseRef: "1771944180130_npmaz",
      position: 1,
    });
  });

  it("returns position 1 and original string when no -N suffix", () => {
    expect(parseReference("plainref")).toEqual({
      baseRef: "plainref",
      position: 1,
    });
  });
});

// ─── getReconciliationDataHandler ──────────────────────────────────────────

describe("getReconciliationDataHandler", () => {
  const PAYSTACK_SUCCESS_PAGE = {
    status: true,
    data: [{ reference: "1771972002656_gbs248", amount: 205000, channel: "bank_transfer", paid_at: "2026-02-24T10:00:00Z" }],
    meta: { page: 1, pageCount: 1 },
  };

  const SUPABASE_RESERVED_TICKETS = [
    {
      id: "ticket-uuid-1",
      email: "test@example.com",
      name: "Test User",
      paystack_reference: "1771972002656_gbs248-1",
      ticket_type_id: "type-uuid",
      price_paid: 205000,
      status: "reserved",
      group_booking_id: null,
      event_id: "event-uuid",
    },
    {
      id: "ticket-uuid-2",
      email: "test@example.com",
      name: "Test User",
      paystack_reference: "1771972002656_gbs248-2",
      ticket_type_id: "type-uuid",
      price_paid: 205000,
      status: "reserved",
      group_booking_id: null,
      event_id: "event-uuid",
    },
  ];

  function makeMockClient(ticketData: unknown[], ticketError = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: ticketData, error: ticketError }),
      }),
    } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
  });

  it("returns affected tickets whose base reference matches a Paystack success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => PAYSTACK_SUCCESS_PAGE,
    } as Response);

    const client = makeMockClient(SUPABASE_RESERVED_TICKETS);
    const result = await getReconciliationDataHandler(client);

    expect(result).toHaveLength(2);
    expect(result[0].base_reference).toBe("1771972002656_gbs248");
    expect(result[0].position).toBe(1);
    expect(result[1].position).toBe(2);
  });

  it("excludes reserved tickets that have no matching Paystack success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, data: [], meta: { page: 1, pageCount: 1 } }),
    } as Response);

    const client = makeMockClient(SUPABASE_RESERVED_TICKETS);
    const result = await getReconciliationDataHandler(client);

    expect(result).toHaveLength(0);
  });

  it("throws when PAYSTACK_SECRET_KEY is not set", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const client = makeMockClient([]);
    await expect(getReconciliationDataHandler(client)).rejects.toThrow("PAYSTACK_SECRET_KEY is not set");
  });
});

// ─── resolveTicketsHandler ─────────────────────────────────────────────────

describe("resolveTicketsHandler", () => {
  const TICKET = {
    id: "ticket-uuid-1",
    email: "test@example.com",
    name: "Test User",
    paystack_reference: "1771972002656_gbs248-1",
    event_id: "event-uuid",
    group_booking_id: null,
    ticket_secret: null,
    qr_code_url: null,
  };

  function makeMockClient(ticketData: unknown[]) {
    const storageChain = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://storage.test/qr.png" } }),
    };
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "tickets") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: ticketData, error: null }),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "group_bookings") {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
      storage: { from: vi.fn().mockReturnValue(storageChain) },
    } as unknown as SupabaseClient;
  }

  it("generates ticket_secret, uploads QR, and updates ticket", async () => {
    const client = makeMockClient([TICKET]);
    const result = await resolveTicketsHandler(client, ["ticket-uuid-1"]);

    expect(result.resolved).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify QRCode was called with correct ticket_secret format
    const QRCode = (await import("qrcode")).default;
    expect(QRCode.toBuffer).toHaveBeenCalledWith(
      "1771972002656_gbs248::event-uuid::ticket-1",
      expect.objectContaining({ errorCorrectionLevel: "H", type: "png", width: 400 }),
    );
  });

  it("returns error entry (does not throw) when upload fails", async () => {
    const failingStorage = {
      upload: vi.fn().mockResolvedValue({ error: new Error("Upload failed") }),
      getPublicUrl: vi.fn(),
    };
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [TICKET], error: null }),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      storage: { from: vi.fn().mockReturnValue(failingStorage) },
    } as unknown as SupabaseClient;

    const result = await resolveTicketsHandler(client, ["ticket-uuid-1"]);

    expect(result.resolved).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].ticketId).toBe("ticket-uuid-1");
  });
});
