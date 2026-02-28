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

const defaultFields = {
  name: false,
  ticketType: false,
  qrCode: false,
  dateVenue: true,
  pricePaid: false,
  reference: false,
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

  // Header says "Hit Refresh" not "Hit Refresh Conference"
  it('header says "Hit Refresh" not "Hit Refresh Conference"', () => {
    const html = buildEmailHtml({ email: "a@b.com" }, defaultFields, "", "Test");
    expect(html).toContain(">Hit Refresh<");
    expect(html).not.toContain(">Hit Refresh Conference<");
  });

  // Date row includes time info
  it("date row includes registration and event time", () => {
    const html = buildEmailHtml({ email: "a@b.com" }, defaultFields, "", "Test");
    expect(html).toContain("Registration 8am");
    expect(html).toContain("Event 9am");
  });

  // Zoom button renders when zoomUrl is set
  it("renders zoom button when zoomUrl is set and qrCode is true", () => {
    const html = buildEmailHtml(
      { email: "a@b.com", zoomUrl: "https://zoom.us/test" },
      { ...defaultFields, qrCode: true },
      "",
      "Test",
    );
    expect(html).toContain("Join Hit Refresh");
    expect(html).toContain("https://zoom.us/test");
    expect(html).not.toContain("View Your QR Code");
  });

  // QR button still works when qrCodeUrl is set (no zoomUrl)
  it("renders QR button when qrCodeUrl is set and no zoomUrl", () => {
    const html = buildEmailHtml(
      { email: "a@b.com", qrCodeUrl: "https://qr.example.com/1" },
      { ...defaultFields, qrCode: true },
      "",
      "Test",
    );
    expect(html).toContain("View Your QR Code");
    expect(html).not.toContain("Join Hit Refresh");
  });
});
