import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";
import {
  TicketPlus,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  XCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  createTickets,
  fetchTicketTypes,
  fetchTicketEmails,
  type TicketCreateEntry,
} from "@/lib/ticket-create";
import { createGroupBooking } from "@/lib/group-ticket-create";

// ─── Parse bulk input ─────────────────────────────────────────────────────────

type ParsedEntry = { email: string; name: string; valid: boolean; duplicate: boolean };

function parseLines(text: string): Omit<ParsedEntry, "duplicate">[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawEmail, ...rest] = line.split(",").map((s) => s.trim());
      const email = rawEmail ?? "";
      const name = rest.join(", ");
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      return { email, name, valid };
    });
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function TypeSelect({
  value,
  onChange,
  types,
}: {
  value: string;
  onChange: (v: string) => void;
  types: Array<{ id: string; name: string; price_in_kobo: number }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Ticket type</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select ticket type…" />
        </SelectTrigger>
        <SelectContent>
          {types.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} — ₦{(t.price_in_kobo / 100).toLocaleString()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Single form ──────────────────────────────────────────────────────────────

function SingleForm({
  types,
  existingEmails,
  onSuccess,
}: {
  types: Array<{ id: string; name: string; price_in_kobo: number }>;
  existingEmails: Set<string>;
  onSuccess: () => void;
}) {
  const notify = useNotify();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");

  const isDuplicate = email.trim() && existingEmails.has(email.trim().toLowerCase());

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createTickets({
        data: {
          entries: [{ email: email.trim(), name: name.trim() || undefined }],
          ticketTypeId: typeId,
        },
      }),
    onSuccess: (result) => {
      if (result.errors.length) {
        notify(`Failed: ${result.errors[0].error}`, { type: "error" });
      } else {
        notify("Ticket created successfully", { type: "success" });
        setEmail("");
        setName("");
        onSuccess();
      }
    },
    onError: (err: Error) => notify(err.message, { type: "error" }),
  });

  const canSubmit = email.trim() && typeId && !isPending;

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label htmlFor="single-email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="single-email"
          type="email"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder="attendee@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && mutate()}
        />
        {isDuplicate && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="size-3.5 shrink-0" />
            This email already has a ticket in the system.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="single-name">Name</Label>
        <Input
          id="single-name"
          placeholder="Attendee name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <TypeSelect value={typeId} onChange={setTypeId} types={types} />
      <Button onClick={() => mutate()} disabled={!canSubmit} className="gap-2">
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <TicketPlus className="size-4" />
        )}
        {isPending ? "Creating…" : "Create Ticket"}
      </Button>
    </div>
  );
}

// ─── Bulk form ────────────────────────────────────────────────────────────────

function BulkForm({
  types,
  existingEmails,
  onSuccess,
}: {
  types: Array<{ id: string; name: string; price_in_kobo: number }>;
  existingEmails: Set<string>;
  onSuccess: () => void;
}) {
  const notify = useNotify();
  const [raw, setRaw] = useState("");
  const [typeId, setTypeId] = useState("");
  const [result, setResult] = useState<{
    created: number;
    errors: Array<{ email: string; error: string }>;
  } | null>(null);

  const parsed = useMemo<ParsedEntry[]>(() => {
    return parseLines(raw).map((entry) => ({
      ...entry,
      duplicate: entry.valid && existingEmails.has(entry.email.toLowerCase()),
    }));
  }, [raw, existingEmails]);

  const newCount = parsed.filter((e) => e.valid && !e.duplicate).length;
  const duplicateCount = parsed.filter((e) => e.duplicate).length;
  const invalidCount = parsed.filter((e) => !e.valid).length;

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const entries: TicketCreateEntry[] = parsed
        .filter((e) => e.valid && !e.duplicate)
        .map((e) => ({ email: e.email, name: e.name || undefined }));
      return createTickets({ data: { entries, ticketTypeId: typeId } });
    },
    onSuccess: (res) => {
      setResult(res);
      if (res.created > 0) {
        notify(`${res.created} ticket${res.created !== 1 ? "s" : ""} created`, { type: "success" });
        setRaw("");
        onSuccess();
      }
      if (res.errors.length) {
        notify(`${res.errors.length} failed`, { type: "warning" });
      }
    },
    onError: (err: Error) => notify(err.message, { type: "error" }),
  });

  const canSubmit = newCount > 0 && typeId && !isPending;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="bulk-input">
          Emails <span className="text-destructive">*</span>
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            One per line — <code>email</code> or <code>email, name</code>
          </span>
        </Label>
        <Textarea
          id="bulk-input"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="font-mono text-sm min-h-40 resize-y"
          placeholder={"john@example.com, John Doe\njane@example.com\nbob@example.com, Bob Smith"}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setResult(null);
          }}
          spellCheck={false}
        />
        {parsed.length > 0 && (
          <div className="flex gap-3 text-xs">
            {newCount > 0 && <span className="text-green-700">{newCount} new</span>}
            {duplicateCount > 0 && (
              <span className="text-amber-600">{duplicateCount} already have tickets</span>
            )}
            {invalidCount > 0 && (
              <span className="text-destructive">{invalidCount} invalid email</span>
            )}
          </div>
        )}
      </div>

      <TypeSelect value={typeId} onChange={setTypeId} types={types} />

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            Preview — {parsed.length} {parsed.length === 1 ? "entry" : "entries"}
            {duplicateCount > 0 && (
              <span className="ml-2 text-amber-600">· {duplicateCount} will be skipped</span>
            )}
          </div>
          <div className="divide-y max-h-64 overflow-y-auto">
            {parsed.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                {entry.duplicate ? (
                  <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                ) : entry.valid ? (
                  <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="size-3.5 text-destructive shrink-0" />
                )}
                <span
                  className={
                    entry.duplicate ? "text-amber-700" : entry.valid ? "" : "text-destructive"
                  }
                >
                  {entry.email}
                </span>
                {entry.name && <span className="text-muted-foreground truncate">{entry.name}</span>}
                {entry.duplicate && (
                  <Badge
                    variant="outline"
                    className="ml-auto text-[10px] py-0 border-amber-400 text-amber-700"
                  >
                    already exists
                  </Badge>
                )}
                {!entry.valid && !entry.duplicate && (
                  <Badge variant="destructive" className="ml-auto text-[10px] py-0">
                    invalid email
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error summary from last run */}
      {result && result.errors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
          <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
            <AlertCircle className="size-4" />
            {result.errors.length} ticket{result.errors.length !== 1 ? "s" : ""} failed
          </p>
          <ul className="text-xs text-destructive/80 space-y-0.5 list-disc list-inside">
            {result.errors.map((e, i) => (
              <li key={i}>
                {e.email}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={() => mutate()} disabled={!canSubmit} className="gap-2">
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <TicketPlus className="size-4" />
        )}
        {isPending
          ? "Creating tickets…"
          : `Create ${newCount > 0 ? newCount : ""} Ticket${newCount !== 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}

// ─── Group / Corporate form ───────────────────────────────────────────────────

function GroupForm({
  types,
  existingEmails,
  onSuccess,
}: {
  types: Array<{ id: string; name: string; price_in_kobo: number }>;
  existingEmails: Set<string>;
  onSuccess: () => void;
}) {
  const notify = useNotify();
  const [bookingType, setBookingType] = useState<"corporate" | "group">("corporate");
  const [companyOrGroupName, setCompanyOrGroupName] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [typeId, setTypeId] = useState("");
  const [raw, setRaw] = useState("");
  const [totalPriceStr, setTotalPriceStr] = useState("");
  const [result, setResult] = useState<{
    groupBookingId: string;
    created: number;
    errors: Array<{ email: string; error: string }>;
  } | null>(null);

  const parsed = useMemo<ParsedEntry[]>(() => {
    return parseLines(raw).map((entry) => ({
      ...entry,
      duplicate: entry.valid && existingEmails.has(entry.email.toLowerCase()),
    }));
  }, [raw, existingEmails]);

  const newCount = parsed.filter((e) => e.valid && !e.duplicate).length;
  const duplicateCount = parsed.filter((e) => e.duplicate).length;
  const invalidCount = parsed.filter((e) => !e.valid).length;

  const selectedType = types.find((t) => t.id === typeId);

  // Auto-fill total price when ticket type or member count changes
  useEffect(() => {
    if (selectedType && newCount > 0) {
      setTotalPriceStr(String(Math.round((selectedType.price_in_kobo * newCount) / 100)));
    }
  }, [typeId, newCount, selectedType]);

  const totalPriceNaira = parseFloat(totalPriceStr) || 0;
  const totalPricePaidKobo = Math.round(totalPriceNaira * 100);
  const perPersonNaira = newCount > 0 ? Math.floor(totalPricePaidKobo / newCount) / 100 : 0;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createGroupBooking({
        data: {
          bookingType,
          companyOrGroupName: companyOrGroupName.trim(),
          primaryContactName: primaryContactName.trim(),
          primaryContactEmail: primaryContactEmail.trim(),
          ticketTypeId: typeId,
          totalPricePaidKobo,
          members: parsed
            .filter((e) => e.valid && !e.duplicate)
            .map((e) => ({ email: e.email, name: e.name || undefined })),
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      if (res.created > 0) {
        notify(
          `${res.created} ticket${res.created !== 1 ? "s" : ""} created for ${companyOrGroupName}`,
          { type: "success" },
        );
        setRaw("");
        setTotalPriceStr("");
        setCompanyOrGroupName("");
        setPrimaryContactName("");
        setPrimaryContactEmail("");
        onSuccess();
      }
      if (res.errors.length) {
        notify(`${res.errors.length} member${res.errors.length !== 1 ? "s" : ""} failed`, {
          type: "warning",
        });
      }
    },
    onError: (err: Error) => notify(err.message, { type: "error" }),
  });

  const canSubmit =
    companyOrGroupName.trim() &&
    primaryContactName.trim() &&
    primaryContactEmail.trim() &&
    typeId &&
    totalPricePaidKobo > 0 &&
    newCount > 0 &&
    !isPending;

  return (
    <div className="space-y-5">
      {/* Booking type toggle */}
      <div className="space-y-1.5">
        <Label>Booking type</Label>
        <div className="flex gap-1 rounded-lg border p-1 w-fit">
          <button
            onClick={() => setBookingType("corporate")}
            className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
              bookingType === "corporate"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Corporate Refresh
          </button>
          <button
            onClick={() => setBookingType("group")}
            className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
              bookingType === "group"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Group Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Company / Group name */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="group-org-name">
            {bookingType === "corporate" ? "Company name" : "Group name"}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="group-org-name"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            placeholder={bookingType === "corporate" ? "e.g. Utiva" : "e.g. Harde Business School"}
            value={companyOrGroupName}
            onChange={(e) => setCompanyOrGroupName(e.target.value)}
          />
        </div>

        {/* Primary contact name */}
        <div className="space-y-1.5">
          <Label htmlFor="group-contact-name">
            Primary contact name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="group-contact-name"
            placeholder="Full name"
            value={primaryContactName}
            onChange={(e) => setPrimaryContactName(e.target.value)}
          />
        </div>

        {/* Primary contact email */}
        <div className="space-y-1.5">
          <Label htmlFor="group-contact-email">
            Primary contact email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="group-contact-email"
            type="email"
            placeholder="contact@company.com"
            value={primaryContactEmail}
            onChange={(e) => setPrimaryContactEmail(e.target.value)}
          />
        </div>
      </div>

      <TypeSelect value={typeId} onChange={setTypeId} types={types} />

      {/* Total price paid */}
      <div className="space-y-1.5">
        <Label htmlFor="group-total-price">
          Total amount paid (₦) <span className="text-destructive">*</span>
        </Label>
        <Input
          id="group-total-price"
          type="number"
          min={0}
          placeholder="e.g. 71750"
          value={totalPriceStr}
          onChange={(e) => setTotalPriceStr(e.target.value)}
        />
        {totalPricePaidKobo > 0 && newCount > 0 && (
          <p className="text-xs text-muted-foreground">
            ₦{perPersonNaira.toLocaleString()} per person ({newCount} member
            {newCount !== 1 ? "s" : ""})
          </p>
        )}
      </div>

      {/* Members list */}
      <div className="space-y-1.5">
        <Label htmlFor="group-members">
          Members <span className="text-destructive">*</span>
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            One per line — <code>email</code> or <code>email, name</code>
          </span>
        </Label>
        <Textarea
          id="group-members"
          className="font-mono text-sm min-h-36 resize-y"
          placeholder={
            "hr@company.com, Jane Doe\nmarketing@company.com, John Smith\nceo@company.com"
          }
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setResult(null);
          }}
          spellCheck={false}
        />
        {parsed.length > 0 && (
          <div className="flex gap-3 text-xs">
            {newCount > 0 && <span className="text-green-700">{newCount} new</span>}
            {duplicateCount > 0 && (
              <span className="text-amber-600">{duplicateCount} already have tickets</span>
            )}
            {invalidCount > 0 && (
              <span className="text-destructive">{invalidCount} invalid email</span>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Users className="size-3.5" />
            {parsed.length} member{parsed.length !== 1 ? "s" : ""}
            {duplicateCount > 0 && (
              <span className="text-amber-600 ml-1">· {duplicateCount} will be skipped</span>
            )}
          </div>
          <div className="divide-y max-h-52 overflow-y-auto">
            {parsed.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                {entry.duplicate ? (
                  <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                ) : entry.valid ? (
                  <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="size-3.5 text-destructive shrink-0" />
                )}
                <span
                  className={
                    entry.duplicate ? "text-amber-700" : entry.valid ? "" : "text-destructive"
                  }
                >
                  {entry.email}
                </span>
                {entry.name && <span className="text-muted-foreground truncate">{entry.name}</span>}
                {entry.duplicate && (
                  <Badge
                    variant="outline"
                    className="ml-auto text-[10px] py-0 border-amber-400 text-amber-700"
                  >
                    already exists
                  </Badge>
                )}
                {!entry.valid && !entry.duplicate && (
                  <Badge variant="destructive" className="ml-auto text-[10px] py-0">
                    invalid email
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error summary */}
      {result && result.errors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
          <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
            <AlertCircle className="size-4" />
            {result.errors.length} member{result.errors.length !== 1 ? "s" : ""} failed
          </p>
          <ul className="text-xs text-destructive/80 space-y-0.5 list-disc list-inside">
            {result.errors.map((e, i) => (
              <li key={i}>
                {e.email}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={() => mutate()} disabled={!canSubmit} className="gap-2">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
        {isPending
          ? "Creating…"
          : `Create ${newCount > 0 ? newCount : ""} Ticket${newCount !== 1 ? "s" : ""} for ${bookingType === "corporate" ? "Corporate" : "Group"}`}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TicketCreatePage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"single" | "bulk" | "group">("single");

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["ticket-types-for-create"],
    queryFn: () => fetchTicketTypes(),
    staleTime: 10 * 60_000,
  });

  const { data: existingEmailsArray = [] } = useQuery({
    queryKey: ["existing-ticket-emails"],
    queryFn: () => fetchTicketEmails(),
    staleTime: 2 * 60_000,
  });

  const existingEmails = useMemo(() => new Set(existingEmailsArray), [existingEmailsArray]);

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
    queryClient.invalidateQueries({ queryKey: ["existing-ticket-emails"] });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 rounded-full p-3">
          <TicketPlus className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Manually issue tickets — QR codes are generated automatically
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg border p-1 w-fit">
        {(["single", "bulk", "group"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              mode === m
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "single" ? "Single" : m === "bulk" ? "Bulk" : "Group / Corporate"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading ticket types…</p>
      ) : mode === "single" ? (
        <SingleForm types={types} existingEmails={existingEmails} onSuccess={onSuccess} />
      ) : mode === "bulk" ? (
        <BulkForm types={types} existingEmails={existingEmails} onSuccess={onSuccess} />
      ) : (
        <GroupForm types={types} existingEmails={existingEmails} onSuccess={onSuccess} />
      )}
    </div>
  );
}
