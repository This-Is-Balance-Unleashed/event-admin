import { useRecordContext } from "ra-core";
import { Show } from "@/components/admin/show";
import { SimpleShowLayout } from "@/components/admin/simple-show-layout";
import { RecordField } from "@/components/admin/record-field";
import { DateField } from "@/components/admin/date-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { TextField } from "@/components/admin/text-field";
import { DataTable } from "@/components/admin/data-table";
import { EditButton } from "@/components/admin/edit-button";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  paid: "default",
  pending: "secondary",
  failed: "destructive",
};

function StatusBadge() {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Badge variant={STATUS_VARIANT[record.status] ?? "secondary"} className="capitalize">
      {record.status}
    </Badge>
  );
}

function TotalField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.total_price_paid / 100).toLocaleString()}</span>;
}

function DiscountField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.discount_applied / 100).toLocaleString()}</span>;
}

function PrimaryContactBadge() {
  const record = useRecordContext();
  if (!record) return null;
  return record.is_primary_contact ? <Badge variant="outline">Primary</Badge> : null;
}

function PerksField() {
  const record = useRecordContext();
  if (!record?.selected_perks) return <span className="text-muted-foreground">—</span>;
  return (
    <pre className="text-xs bg-muted rounded p-2 overflow-auto max-w-lg">
      {JSON.stringify(record.selected_perks, null, 2)}
    </pre>
  );
}

function AssignedTicketCell() {
  const record = useRecordContext();
  if (!record?.assigned_ticket_id) return <span className="text-muted-foreground">—</span>;
  return (
    <ReferenceField source="assigned_ticket_id" reference="tickets" link="show">
      <TextField source="name" />
    </ReferenceField>
  );
}

export function GroupBookingShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="booking_reference" label="Reference" />
        <RecordField source="booking_type" label="Type" />
        <RecordField source="status" label="Status">
          <StatusBadge />
        </RecordField>
        <RecordField source="company_name" label="Company" />
        <RecordField source="group_name" label="Group Name" />
        <RecordField source="primary_contact_name" label="Contact Name" />
        <RecordField source="primary_contact_email" label="Contact Email" />
        <RecordField source="primary_contact_phone" label="Contact Phone" />
        <RecordField source="ticket_type_id" label="Ticket Type">
          <ReferenceField source="ticket_type_id" reference="ticket_types" link="show">
            <TextField source="name" />
          </ReferenceField>
        </RecordField>
        <RecordField source="quantity" label="Quantity" />
        <RecordField source="total_price_paid" label="Total Paid">
          <TotalField />
        </RecordField>
        <RecordField source="discount_applied" label="Discount Applied">
          <DiscountField />
        </RecordField>
        <RecordField source="paystack_reference" label="Paystack Ref" />
        <RecordField source="team_preferences" label="Team Preferences" />
        <RecordField source="selected_perks" label="Selected Perks">
          <PerksField />
        </RecordField>
        <RecordField source="created_at" label="Created">
          <DateField source="created_at" showTime />
        </RecordField>

        {/* Embedded group members sub-table */}
        <RecordField label="Members">
          <ReferenceManyField reference="group_members" target="group_booking_id" label="Members">
            <DataTable>
              <DataTable.Col source="member_position" label="#" />
              <DataTable.Col source="name" />
              <DataTable.Col source="email" />
              <DataTable.Col source="is_primary_contact" label="Primary">
                <PrimaryContactBadge />
              </DataTable.Col>
              <DataTable.Col source="assigned_ticket_id" label="Ticket">
                <AssignedTicketCell />
              </DataTable.Col>
              <DataTable.Col label="">
                <EditButton />
              </DataTable.Col>
            </DataTable>
          </ReferenceManyField>
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
