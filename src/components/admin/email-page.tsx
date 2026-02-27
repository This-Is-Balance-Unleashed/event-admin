import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  { key: "qrCode", label: "Action Button (QR / Zoom)" },
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

const ZOOM_URL = "https://zoom.us/j/99036993644?pwd=wrENKh7Ii7wOsP3U5dtJYxSKpV7hrc.1";

type EmailTemplateConfig = {
  key: string;
  label: string;
  subject: string;
  message: string;
  fields: IncludeFields;
  zoomUrl?: string;
};

const TEMPLATES: EmailTemplateConfig[] = [
  {
    key: "general",
    label: "General Ticket",
    subject: DEFAULT_SUBJECT,
    message: DEFAULT_MESSAGE,
    fields: DEFAULT_FIELDS,
  },
  {
    key: "virtual",
    label: "Virtual Ticket (Zoom)",
    subject: "Join Hit Refresh — Your Zoom Link",
    message: `You're registered for the virtual stream of Hit Refresh 2026!\n\nJoin Hit Refresh\nMeeting ID: 990 3699 3644\nPasscode: 775309`,
    fields: {
      name: true,
      ticketType: true,
      qrCode: true,
      dateVenue: true,
      pricePaid: false,
      reference: false,
    },
    zoomUrl: ZOOM_URL,
  },
];

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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [templateKey, setTemplateKey] = useState<string>("general");

  const ticketTypeOptions = useMemo(
    () => [...new Set(tickets.map((t) => t.ticketTypeName).filter(Boolean))] as string[],
    [tickets],
  );

  const applyTemplate = (key: string) => {
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setTemplateKey(key);
    setSubject(tpl.subject);
    setMessage(tpl.message);
    setIncludeFields(tpl.fields);
  };

  // Load all tickets once — filter client-side to avoid server param serialisation issues
  useEffect(() => {
    setLoading(true);
    fetchEmailTickets({ data: {} })
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        setTickets(rows);
        if (presetEmail) {
          const match = rows.find((t) => t.email === presetEmail);
          if (match) setSelectedIds(new Set([match.id]));
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        notify(`Failed to load tickets: ${msg}`, { type: "error" });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side filtering — instant, no server roundtrip
  const visibleTickets = tickets.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q || t.email.toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesType = typeFilter === "all" || t.ticketTypeName === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleStatusChange = (s: string) => {
    setStatusFilter(s);
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (visibleTickets.every((t) => selectedIds.has(t.id)) && visibleTickets.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleTickets.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleTickets.forEach((t) => next.add(t.id));
        return next;
      });
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
      const selectedTemplate = TEMPLATES.find((t) => t.key === templateKey);
      setPreviewHtml(
        buildEmailHtml(
          {
            email: preview.email,
            name: preview.name,
            ticketTypeName: preview.ticketTypeName,
            pricePaid: preview.pricePaid,
            reference: preview.reference,
            qrCodeUrl: preview.qrCodeUrl,
            zoomUrl: selectedTemplate?.zoomUrl,
          },
          includeFields,
          message,
          subject,
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRecipients.length, includeFields, message, subject, templateKey]);

  const handleSend = async () => {
    if (allRecipients.length === 0) return;
    setSending(true);
    try {
      const selectedTemplate = TEMPLATES.find((t) => t.key === templateKey);
      const result = await sendTicketEmails({
        data: {
          recipients: allRecipients.map((r) => ({
            email: r.email,
            name: r.name,
            ticketTypeName: r.ticketTypeName,
            pricePaid: r.pricePaid,
            reference: r.reference,
            qrCodeUrl: r.qrCodeUrl,
            zoomUrl: selectedTemplate?.zoomUrl,
          })),
          subject,
          message,
          includeFields,
        },
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify(`Send failed: ${msg}`, { type: "error", autoHideDuration: 10000 });
    } finally {
      setSending(false);
    }
  };

  const allSelected =
    visibleTickets.length > 0 && visibleTickets.every((t) => selectedIds.has(t.id));

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
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ticketTypeOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
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
                  ) : visibleTickets.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-muted-foreground text-xs">
                        {tickets.length === 0 ? "No tickets found" : "No tickets match your search"}
                      </td>
                    </tr>
                  ) : (
                    visibleTickets.map((t) => (
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
              {visibleTickets.length < tickets.length && ` (${visibleTickets.length} visible)`}
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
              <Label className="text-sm font-medium mb-1 block">Template</Label>
              <Select value={templateKey} onValueChange={applyTemplate}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
