import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";
import { TicketPlus, CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
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
import { createTickets, fetchTicketTypes, type TicketCreateEntry } from "@/lib/ticket-create";

// ─── Parse bulk input ─────────────────────────────────────────────────────────

type ParsedEntry = { email: string; name: string; valid: boolean };

function parseLines(text: string): ParsedEntry[] {
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
  onSuccess,
}: {
  types: Array<{ id: string; name: string; price_in_kobo: number }>;
  onSuccess: () => void;
}) {
  const notify = useNotify();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");

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
  onSuccess,
}: {
  types: Array<{ id: string; name: string; price_in_kobo: number }>;
  onSuccess: () => void;
}) {
  const notify = useNotify();
  const [raw, setRaw] = useState("");
  const [typeId, setTypeId] = useState("");
  const [result, setResult] = useState<{
    created: number;
    errors: Array<{ email: string; error: string }>;
  } | null>(null);

  const parsed = useMemo(() => parseLines(raw), [raw]);
  const validCount = parsed.filter((e) => e.valid).length;
  const invalidCount = parsed.filter((e) => !e.valid).length;

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const entries: TicketCreateEntry[] = parsed
        .filter((e) => e.valid)
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

  const canSubmit = validCount > 0 && typeId && !isPending;

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
          <div className="flex gap-2 text-xs">
            <span className="text-green-700">{validCount} valid</span>
            {invalidCount > 0 && <span className="text-destructive">{invalidCount} invalid</span>}
          </div>
        )}
      </div>

      <TypeSelect value={typeId} onChange={setTypeId} types={types} />

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            Preview — {parsed.length} {parsed.length === 1 ? "entry" : "entries"}
          </div>
          <div className="divide-y max-h-52 overflow-y-auto">
            {parsed.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                {entry.valid ? (
                  <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="size-3.5 text-destructive shrink-0" />
                )}
                <span className={entry.valid ? "" : "text-destructive"}>{entry.email}</span>
                {entry.name && <span className="text-muted-foreground truncate">{entry.name}</span>}
                {!entry.valid && (
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
          : `Create ${validCount > 0 ? validCount : ""} Ticket${validCount !== 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TicketCreatePage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"single" | "bulk">("single");

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["ticket-types-for-create"],
    queryFn: () => fetchTicketTypes(),
    staleTime: 10 * 60_000,
  });

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
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
        <button
          onClick={() => setMode("single")}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
            mode === "single"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Single
        </button>
        <button
          onClick={() => setMode("bulk")}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
            mode === "bulk"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Bulk
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading ticket types…</p>
      ) : mode === "single" ? (
        <SingleForm types={types} onSuccess={onSuccess} />
      ) : (
        <BulkForm types={types} onSuccess={onSuccess} />
      )}
    </div>
  );
}
