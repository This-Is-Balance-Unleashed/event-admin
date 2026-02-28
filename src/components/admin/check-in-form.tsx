import { useState, useCallback, useRef } from "react";
import { searchTickets, checkInTicket } from "@/lib/check-in";
import type { CheckInTicket } from "@/lib/check-in";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScanLine, CheckCircle2, AlertCircle, Clock, XCircle, Search } from "lucide-react";
import { TicketStatusBadge } from "@/components/admin/ticket-status-badge";
import { QrScannerOverlay, ScanQrButton } from "@/components/admin/qr-scanner-overlay";

type Ticket = CheckInTicket;

const STATUS_ICON = {
  paid: <CheckCircle2 className="size-5 text-green-500" />,
  used: <CheckCircle2 className="size-5 text-muted-foreground" />,
  reserved: <Clock className="size-5 text-amber-500" />,
  failed: <XCircle className="size-5 text-red-500" />,
};

const STATUS_MESSAGE = {
  paid: "Ready to check in",
  used: (t: Ticket) =>
    `Already checked in at ${t.checked_in_at ? new Date(t.checked_in_at).toLocaleString() : "—"}`,
  reserved: "Payment not confirmed — cannot check in",
  failed: "Payment failed — cannot check in",
};

function TicketCard({
  ticket,
  onCheckIn,
  loading,
}: {
  ticket: Ticket;
  onCheckIn: (id: string) => void;
  loading: boolean;
}) {
  const statusMsg =
    typeof STATUS_MESSAGE[ticket.status] === "function"
      ? (STATUS_MESSAGE[ticket.status] as (t: Ticket) => string)(ticket)
      : STATUS_MESSAGE[ticket.status];

  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{ticket.name ?? "(no name)"}</CardTitle>
            <p className="text-sm text-muted-foreground">{ticket.email}</p>
          </div>
          <TicketStatusBadge status={ticket.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          {ticket.ticket_types?.name ?? "Unknown ticket type"} · ₦
          {(ticket.price_paid / 100).toLocaleString()}
        </div>
        <Separator />
        <div className="flex items-center gap-2 text-sm">
          {STATUS_ICON[ticket.status]}
          <span>{statusMsg}</span>
        </div>
        {ticket.status === "paid" && (
          <Button
            className="w-full gap-2 text-base h-12"
            onClick={() => onCheckIn(ticket.id)}
            disabled={loading}
          >
            <ScanLine className="size-5" />
            {loading ? "Checking in…" : "Confirm Check In"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function CheckInForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Ticket[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    setSuccess(null);
    try {
      const tickets = await searchTickets({ data: { query: q } });
      setResults(tickets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(q), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") search(query);
  };

  const handleQrScan = useCallback(
    (value: string) => {
      setScannerOpen(false);
      setQuery(value);
      search(value);
    },
    [search],
  );

  const handleCheckIn = async (id: string) => {
    setCheckingIn(id);
    setError(null);
    try {
      await checkInTicket({ data: { id } });
      setSuccess("Checked in successfully!");
      await search(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setCheckingIn(null);
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {scannerOpen && (
        <QrScannerOverlay onScan={handleQrScan} onClose={() => setScannerOpen(false)} />
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="pl-9 h-12 text-base"
            placeholder="Search by name, email or QR code…"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
        </div>
        <ScanQrButton onClick={() => setScannerOpen(true)} />
      </div>

      {searching && <p className="text-center text-sm text-muted-foreground">Searching…</p>}

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded p-3">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 rounded p-3">
          <CheckCircle2 className="size-4 shrink-0" />
          {success}
        </div>
      )}

      {results !== null && results.length === 0 && !searching && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No tickets found for &ldquo;{query}&rdquo;
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onCheckIn={handleCheckIn}
              loading={checkingIn === ticket.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
