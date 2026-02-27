import { useRecordContext, useUpdate, useNotify, useRefresh } from "ra-core";
import QRCode from "react-qr-code";
import { Show } from "@/components/admin/show";
import { DateField } from "@/components/admin/date-field";
import { EmailField } from "@/components/admin/email-field";
import { RecordField } from "@/components/admin/record-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Button } from "@/components/ui/button";
import { TicketStatusBadge } from "@/components/admin/ticket-status-badge";
import { ScanLine, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { tanStackRouterProvider } from "ra-router-tanstack";

const { Link } = tanStackRouterProvider;

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
      </div>
    </Show>
  );
}
