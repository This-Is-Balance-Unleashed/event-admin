import { useState, useEffect } from "react";
import { useRecordContext, useUpdate, useNotify, useRefresh } from "ra-core";
import QRCode from "react-qr-code";
import { Show } from "@/components/admin/show";
import { DateField } from "@/components/admin/date-field";
import { EmailField } from "@/components/admin/email-field";
import { RecordField } from "@/components/admin/record-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketStatusBadge } from "@/components/admin/ticket-status-badge";
import { ScanLine, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { tanStackRouterProvider } from "ra-router-tanstack";
import { updateTicket } from "@/lib/ticket-edit";
import { fetchTicketTypes } from "@/lib/ticket-create";

const { Link } = tanStackRouterProvider;

const TICKET_STATUSES = ["reserved", "paid", "failed", "used"] as const;
type TicketStatus = (typeof TICKET_STATUSES)[number];

function CheckInButton() {
  const record = useRecordContext();
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();

  if (!record) return null;

  if (record.status === "used") {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <CheckCircle2 className="size-4 text-green-500" />
        Checked in at {new Date(record.checked_in_at).toLocaleString()}
      </div>
    );
  }

  if (record.status !== "paid") {
    return (
      <div className="flex items-center gap-2 text-amber-600 text-sm">
        <AlertCircle className="size-4" />
        Cannot check in — ticket status is &ldquo;{record.status}&rdquo;
      </div>
    );
  }

  const handleCheckIn = () => {
    update(
      "tickets",
      {
        id: record.id,
        data: { status: "used", checked_in_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          notify("Ticket checked in successfully", { type: "success" });
          refresh();
        },
        onError: () => notify("Check-in failed", { type: "error" }),
      },
    );
  };

  return (
    <Button onClick={handleCheckIn} disabled={isPending} size="lg" className="gap-2">
      <ScanLine className="size-4" />
      {isPending ? "Checking in…" : "Check In"}
    </Button>
  );
}

function StatusBadgeField() {
  const record = useRecordContext();
  if (!record) return null;
  return <TicketStatusBadge status={record.status} />;
}

function PricePaidField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.price_paid / 100).toLocaleString()}</span>;
}

function TicketQRCode() {
  const record = useRecordContext();
  if (!record?.ticket_secret) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="border rounded-lg p-4 bg-white">
        <QRCode value={record.ticket_secret} size={160} />
      </div>
      <p className="text-xs text-muted-foreground font-mono">{record.ticket_secret}</p>
    </div>
  );
}

function SendEmailButton() {
  const record = useRecordContext();
  if (!record?.email) return null;
  return (
    <Button variant="outline" size="sm" className="gap-2" asChild>
      <Link to="/admin/email" search={`?email=${encodeURIComponent(record.email)}`}>
        <Mail className="size-4" />
        Send Email
      </Link>
    </Button>
  );
}

type TicketType = { id: string; name: string };

function EditTicketSection() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">((record?.status as TicketStatus) ?? "");
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!record) return;
    setName(record.name ?? "");
    setTicketTypeId(record.ticket_type_id ?? "");
    setStatus(record.status ?? "");
    fetchTicketTypes().then((types) => setTicketTypes(Array.isArray(types) ? types : []));
    // Dependencies intentionally limited to record.id to avoid re-fetching on every record update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  if (!record) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTicket({
        data: {
          id: String(record.id),
          name: name || undefined,
          ticketTypeId: ticketTypeId || undefined,
          status: status !== "" ? status : undefined,
        },
      });
      notify("Ticket updated", { type: "success" });
      refresh();
    } catch (e) {
      notify(`Update failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-4 border-t mt-2">
      <p className="text-sm font-medium mb-3">Edit Ticket</p>
      <div className="flex flex-col gap-3 max-w-sm">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Attendee name"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Ticket Type</Label>
          <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ticketTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <TicketStatusBadge status={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-fit">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export function TicketShow() {
  return (
    <Show>
      <div className="flex flex-col gap-4">
        <RecordField source="name" />
        <RecordField source="email" label="Email">
          <EmailField source="email" />
        </RecordField>
        <RecordField source="status" label="Status">
          <StatusBadgeField />
        </RecordField>
        <RecordField source="ticket_type_id" label="Ticket Type">
          <ReferenceField source="ticket_type_id" reference="ticket_types" link={false}>
            <TextField source="name" />
          </ReferenceField>
        </RecordField>
        <RecordField source="price_paid" label="Price Paid">
          <PricePaidField />
        </RecordField>
        <RecordField source="paystack_reference" label="Payment Ref" />
        <RecordField source="created_at" label="Purchased At">
          <DateField source="created_at" showTime />
        </RecordField>
        <RecordField source="checked_in_at" label="Checked In At">
          <DateField source="checked_in_at" showTime emptyText="Not yet checked in" />
        </RecordField>
        <RecordField source="ticket_secret" label="QR Code">
          <TicketQRCode />
        </RecordField>
        <div className="pt-4 flex gap-3 flex-wrap">
          <CheckInButton />
          <SendEmailButton />
        </div>
        <EditTicketSection />
      </div>
    </Show>
  );
}
