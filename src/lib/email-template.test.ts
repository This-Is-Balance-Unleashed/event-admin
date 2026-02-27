import { describe, it, expect } from "vitest";
import { buildEmailHtml } from "./email-template";

const baseRecipient = {
  name: "Jane Doe",
  email: "jane@test.com",
  ticketTypeName: "General Admission",
  pricePaid: 1000000,
  reference: "PSK-ABC123",
  qrCodeUrl: "https://example.com/qr/abc123",
};

const allFields = {
  name: true,
  ticketType: true,
  qrCode: true,
  dateVenue: true,
  pricePaid: true,
  reference: true,
};

describe("buildEmailHtml", () => {
  it("includes the custom message", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "Hello from admin", "Your Ticket");
    expect(html).toContain("Hello from admin");
  });

  it("includes name when field is enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("Jane Doe");
  });

  it("omits name when field is disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, name: false }, "", "");
    expect(html).not.toContain("Attendee Name");
  });

  it("includes ticket type when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("General Admission");
  });

  it("omits ticket type when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, ticketType: false }, "", "");
    expect(html).not.toContain("Ticket Type");
  });

  it("includes price paid formatted as naira when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("₦10,000");
  });

  it("omits price when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, pricePaid: false }, "", "");
    expect(html).not.toContain("Price Paid");
  });

  it("includes QR code link when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("https://example.com/qr/abc123");
  });

  it("omits QR code when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, qrCode: false }, "", "");
    expect(html).not.toContain("https://example.com/qr/abc123");
  });

  it("includes reference when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("PSK-ABC123");
  });

  it("includes event date and venue when enabled", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("February 28, 2026");
    expect(html).toContain("Pistis Annex");
  });

  it("omits event date/venue when disabled", () => {
    const html = buildEmailHtml(baseRecipient, { ...allFields, dateVenue: false }, "", "");
    expect(html).not.toContain("February 28, 2026");
  });

  it("returns a valid HTML string with doctype", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toMatch(/^<!DOCTYPE html>/i);
  });

  it("uses brand green color in output", () => {
    const html = buildEmailHtml(baseRecipient, allFields, "", "");
    expect(html).toContain("#39B54A");
  });
});
