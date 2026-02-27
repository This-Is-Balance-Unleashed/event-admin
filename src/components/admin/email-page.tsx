import { useState, useEffect, useCallback, useRef } from "react";
import { useNotify } from "ra-core";
import { Mail, Send, CheckSquare, Square, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchEmailTickets, sendTicketEmails, type EmailTicket } from "@/lib/email";
import type { IncludeFields } from "@/lib/email-template";

const DEFAULT_SUBJECT = "Your Hit Refresh Conference Ticket";
const DEFAULT_MESSAGE = `Thank you for registering for Hit Refresh Conference 2026!

We're excited to see you on February 28th at Pistis Annex, Marwa, Lekki, Lagos.

Please keep this email handy — your QR code is your entry pass. Show it at the entrance on the day.

See you there!`;

const FIELD_OPTIONS: { key: keyof IncludeFields; label: string }[] = [
  { key: "name", label: "Attendee Name" },
  { key: "ticketType", label: "Ticket Type" },
  { key: "qrCode", label: "QR Code Button" },
  { key: "dateVenue", label: "Event Date & Venue" },
  { key: "pricePaid", label: "Price Paid" },
  { key: "reference", label: "Payment Reference" },
];

const DEFAULT_FIELDS: IncludeFields = {
  name: true,
  ticketType: true,
  qrCode: true,
  dateVenue: true,
  pricePaid: false,
  reference: false,
};

export function EmailPage() {
  const notify = useNotify();

  // Lazy state init — only runs client-side, safe during SSR
  const [presetEmail] = useState(() => {
    if (typeof window === "undefined" || !window.location) return "";
    return new URLSearchParams(window.location.search).get("email") ?? "";
  });

  const [tickets, setTickets] = useState<EmailTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pasteEmails, setPasteEmails] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [includeFields, setIncludeFields] = useState<IncludeFields>(DEFAULT_FIELDS);
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTickets = useCallback(
    async (q: string, s: string) => {
      setLoading(true);
      try {
        const data = await fetchEmailTickets({
          search: q || undefined,
          status: s === "all" ? undefined : s,
        });
        setTickets(Array.isArray(data) ? data : []);
        if (presetEmail) {
          const match = data.find((t) => t.email === presetEmail);
          if (match) setSelectedIds(new Set([match.id]));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notify(`Failed to load tickets: ${msg}`, { type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [presetEmail, notify],
  );

  useEffect(() => {
    loadTickets("", "all");
  }, [loadTickets]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => loadTickets(q, statusFilter), 300);
  };

  const handleStatusChange = (s: string) => {
    setStatusFilter(s);
    loadTickets(search, s);
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === tickets.length && tickets.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map((t) => t.id)));
    }
  };

  const toggleField = (key: keyof IncludeFields) => {
    setIncludeFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedTickets = tickets.filter((t) => selectedIds.has(t.id));
  const pastedList = pasteEmails
    .split(/[\n,;]/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"))
    .map((e) => ({ id: `paste-${e}`, email: e, status: "unknown" }) as EmailTicket);
  const allRecipients = [
    ...selectedTickets,
    ...pastedList.filter((p) => !selectedTickets.find((t) => t.email === p.email)),
  ];

  // Live preview — dynamic import keeps template out of initial bundle
  useEffect(() => {
    import("@/lib/email-template").then(({ buildEmailHtml }) => {
      const preview = allRecipients[0] ?? {
        email: "preview@example.com",
        name: "Preview Attendee",
        ticketTypeName: "General Admission",
        pricePaid: 1000000,
        reference: "PSK-PREVIEW",
        qrCodeUrl: "https://example.com/qr/preview",
      };
      setPreviewHtml(
        buildEmailHtml(
          {
            email: preview.email,
            name: preview.name,
            ticketTypeName: preview.ticketTypeName,
            pricePaid: preview.pricePaid,
            reference: preview.reference,
            qrCodeUrl: preview.qrCodeUrl,
          },
          includeFields,
          message,
          subject,
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRecipients.length, includeFields, message, subject]);

  const handleSend = async () => {
    if (allRecipients.length === 0) return;
    setSending(true);
    try {
      const result = await sendTicketEmails({
        recipients: allRecipients.map((r) => ({
          email: r.email,
          name: r.name,
          ticketTypeName: r.ticketTypeName,
          pricePaid: r.pricePaid,
          reference: r.reference,
          qrCodeUrl: r.qrCodeUrl,
        })),
        subject,
        message,
        includeFields,
      });
      if (result.failed.length > 0) {
        notify(
          `Sent ${result.sent}, failed ${result.failed.length}: ${result.failed.map((f) => f.email).join(", ")}`,
          { type: "warning", autoHideDuration: 8000 },
        );
      } else {
        notify(`Successfully sent ${result.sent} email${result.sent !== 1 ? "s" : ""}`, {
          type: "success",
        });
      }
    } catch {
      notify("Send failed — check server logs", { type: "error" });
    } finally {
      setSending(false);
    }
  };

  const allSelected = tickets.length > 0 && selectedIds.size === tickets.length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Mail className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Send Ticket Emails</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Recipients */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b">
              <h2 className="font-medium mb-3 flex items-center gap-2">
                <Users className="size-4" /> Recipients
              </h2>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by email…"
                    value={search}
                    onChange={handleSearchChange}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <Select value={statusFilter} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-28 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="p-2 w-8">
                      <button
                        onClick={toggleAll}
                        className="flex items-center justify-center"
                        aria-label="Toggle select all"
                      >
                        {allSelected ? (
                          <CheckSquare className="size-4 text-primary" />
                        ) : (
                          <Square className="size-4 text-muted-foreground" />
                        )}
                      </button>
                    </th>
                    <th className="p-2 text-left font-medium text-muted-foreground">
                      Name / Email
                    </th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-muted-foreground text-xs">
                        Loading…
                      </td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-muted-foreground text-xs">
                        No tickets found
                      </td>
                    </tr>
                  ) : (
                    tickets.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => toggleRow(t.id)}
                        className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <td className="p-2 w-8">
                          <Checkbox
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleRow(t.id)}
                          />
                        </td>
                        <td className="p-2">
                          <p className="font-medium leading-none">{t.name || "—"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.email}</p>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {t.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t text-xs text-muted-foreground">
              {selectedIds.size} of {tickets.length} selected
            </div>
          </div>

          {/* Paste area */}
          <div className="rounded-lg border bg-card p-4">
            <Label className="text-sm font-medium mb-2 block">
              Or paste email addresses (one per line)
            </Label>
            <Textarea
              placeholder={"jane@example.com\njohn@example.com"}
              value={pasteEmails}
              onChange={(e) => setPasteEmails(e.target.value)}
              className="text-sm font-mono h-20 resize-none"
            />
            {pastedList.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {pastedList.length} additional email{pastedList.length !== 1 ? "s" : ""} detected
              </p>
            )}
          </div>
        </div>

        {/* RIGHT — Compose + Preview */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-card p-4 flex flex-col gap-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject…"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Custom Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="text-sm h-28 resize-none"
                placeholder="Your message to attendees…"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Include Fields</Label>
              <div className="grid grid-cols-2 gap-2">
                {FIELD_OPTIONS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer text-sm select-none"
                  >
                    <Checkbox
                      checked={includeFields[key]}
                      onCheckedChange={() => toggleField(key)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="rounded-lg border bg-card">
            <div className="p-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Preview {allRecipients[0] ? `— ${allRecipients[0].email}` : "(placeholder)"}
            </div>
            <div className="h-72 overflow-auto">
              {previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full border-0"
                  title="Email preview"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Loading preview…
                </div>
              )}
            </div>
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={allRecipients.length === 0 || !subject || sending}
            size="lg"
            className="gap-2 w-full"
          >
            <Send className="size-4" />
            {sending
              ? "Sending…"
              : allRecipients.length === 0
                ? "Select recipients to send"
                : `Send to ${allRecipients.length} recipient${allRecipients.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
