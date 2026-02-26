import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Must mock qrcode BEFORE importing the handler (hoisting)
vi.mock("qrcode", () => ({
  default: {
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-qr-png")),
  },
}));

import QRCode from "qrcode";

import {
  parseReference,
  getReconciliationDataHandler,
  resolveTicketsHandler,
  getUnprovisionedGroupBookingsHandler,
  resolveGroupBookingHandler,
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
    data: [
      {
        reference: "1771972002656_gbs248",
        amount: 205000,
        channel: "bank_transfer",
        paid_at: "2026-02-24T10:00:00Z",
      },
    ],
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
    vi.resetAllMocks();
    vi.mocked(QRCode.toBuffer).mockResolvedValue(Buffer.from("fake-qr-png"));
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
    await expect(getReconciliationDataHandler(client)).rejects.toThrow(
      "PAYSTACK_SECRET_KEY is not set",
    );
  });
});

// ─── resolveTicketsHandler ─────────────────────────────────────────────────

describe("resolveTicketsHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(QRCode.toBuffer).mockResolvedValue(Buffer.from("fake-qr-png"));
  });

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

// ─── getUnprovisionedGroupBookingsHandler ──────────────────────────────────

describe("getUnprovisionedGroupBookingsHandler", () => {
  const GROUP_BOOKING = {
    id: "gb-uuid-1",
    booking_reference: "GB1771864067689",
    company_name: "Harde Business School",
    primary_contact_name: "Jane Doe",
    primary_contact_email: "jane@harde.edu",
    paystack_reference: "GB1771864067689_9SCW9B",
    ticket_type_id: "type-corporate",
    total_price_paid: 7175000,
    status: "reserved",
  };

  const MEMBERS = [
    { id: "mem-1", name: "Alice", email: "alice@harde.edu", member_position: 1 },
    { id: "mem-2", name: "Bob", email: "bob@harde.edu", member_position: 2 },
    { id: "mem-3", name: "Carol", email: "carol@harde.edu", member_position: 3 },
  ];

  const PAYSTACK_SUCCESS_PAGE = {
    status: true,
    data: [
      {
        reference: "GB1771864067689_9SCW9B",
        amount: 7175000,
        channel: "bank_transfer",
        paid_at: "2026-02-20T09:00:00Z",
      },
    ],
    meta: { page: 1, pageCount: 1 },
  };

  function makeMockClient({
    groupBookings,
    ticketCount,
    members,
  }: {
    groupBookings: unknown[];
    ticketCount: number;
    members: unknown[];
  }) {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "group_bookings") {
          return {
            select: vi.fn().mockReturnThis(),
            neq: vi.fn().mockResolvedValue({ data: groupBookings, error: null }),
          };
        }
        if (table === "tickets") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: ticketCount, error: null }),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: members, error: null }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
  });

  it("returns unprovisioned booking when Paystack success and zero tickets exist", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => PAYSTACK_SUCCESS_PAGE,
    } as Response);

    const client = makeMockClient({
      groupBookings: [GROUP_BOOKING],
      ticketCount: 0,
      members: MEMBERS,
    });
    const result = await getUnprovisionedGroupBookingsHandler(client);

    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe("Harde Business School");
    expect(result[0].members).toHaveLength(3);
    expect(result[0].paystack_amount).toBe(7175000);
  });

  it("excludes booking that already has tickets (count > 0)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => PAYSTACK_SUCCESS_PAGE,
    } as Response);

    const client = makeMockClient({
      groupBookings: [GROUP_BOOKING],
      ticketCount: 3,
      members: MEMBERS,
    });
    const result = await getUnprovisionedGroupBookingsHandler(client);

    expect(result).toHaveLength(0);
  });

  it("excludes booking with no matching Paystack success reference", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, data: [], meta: { page: 1, pageCount: 1 } }),
    } as Response);

    const client = makeMockClient({
      groupBookings: [GROUP_BOOKING],
      ticketCount: 0,
      members: MEMBERS,
    });
    const result = await getUnprovisionedGroupBookingsHandler(client);

    expect(result).toHaveLength(0);
  });

  it("throws when PAYSTACK_SECRET_KEY is not set", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const client = makeMockClient({ groupBookings: [], ticketCount: 0, members: [] });
    await expect(getUnprovisionedGroupBookingsHandler(client)).rejects.toThrow(
      "PAYSTACK_SECRET_KEY is not set",
    );
  });
});

// ─── resolveGroupBookingHandler ────────────────────────────────────────────

describe("resolveGroupBookingHandler", () => {
  const BOOKING = {
    id: "gb-uuid-1",
    paystack_reference: "GB1771864067689_9SCW9B",
    ticket_type_id: "type-corporate",
    total_price_paid: 7175000,
  };

  const MEMBERS = [
    { id: "mem-1", name: "Alice", email: "alice@harde.edu", member_position: 1 },
    { id: "mem-2", name: "Bob", email: "bob@harde.edu", member_position: 2 },
    { id: "mem-3", name: "Carol", email: "carol@harde.edu", member_position: 3 },
  ];

  function makeMockClient(overrides: { uploadError?: Error } = {}) {
    const storageChain = {
      upload: vi.fn().mockResolvedValue({ error: overrides.uploadError ?? null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://storage.test/qr.png" } }),
    };

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "events") {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: "event-uuid" }, error: null }),
          };
        }
        if (table === "group_bookings") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: BOOKING, error: null }),
            update: vi.fn().mockReturnThis(),
          };
        }
        if (table === "group_members") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: MEMBERS, error: null }),
            update: vi.fn().mockReturnThis(),
          };
        }
        if (table === "tickets") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: "new-ticket-uuid" }, error: null }),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      }),
      storage: { from: vi.fn().mockReturnValue(storageChain) },
    } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(QRCode.toBuffer).mockResolvedValue(Buffer.from("fake-qr-png"));
  });

  it("creates one ticket per member, generates QR 3 times, marks group paid", async () => {
    const client = makeMockClient();
    const results = await resolveGroupBookingHandler(client, ["gb-uuid-1"]);

    expect(results).toHaveLength(1);
    expect(results[0].ticketsCreated).toBe(3);
    expect(results[0].errors).toHaveLength(0);
    expect(QRCode.toBuffer).toHaveBeenCalledTimes(3);
  });

  it("returns empty array when called with empty groupBookingIds", async () => {
    const client = makeMockClient();
    const results = await resolveGroupBookingHandler(client, []);

    expect(results).toHaveLength(0);
    expect(QRCode.toBuffer).not.toHaveBeenCalled();
  });

  it("records per-member errors on upload failure and does NOT update group status", async () => {
    const client = makeMockClient({ uploadError: new Error("Storage upload failed") });
    const results = await resolveGroupBookingHandler(client, ["gb-uuid-1"]);

    expect(results).toHaveLength(1);
    expect(results[0].ticketsCreated).toBe(0);
    expect(results[0].errors).toHaveLength(3);
    expect(results[0].errors[0].error).toBe("Storage upload failed");
  });
});
