import { useRecordContext } from "ra-core";
import { Show } from "@/components/admin/show";
import { SimpleShowLayout } from "@/components/admin/simple-show-layout";
import { RecordField } from "@/components/admin/record-field";
import { DateField } from "@/components/admin/date-field";
import { ReferenceManyCount } from "@/components/admin/reference-many-count";

function PriceField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.price_in_kobo / 100).toLocaleString()}</span>;
}

export function EventShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="title" />
        <RecordField source="description" />
        <RecordField source="event_date" label="Date">
          <DateField source="event_date" showTime />
        </RecordField>
        <RecordField source="location" />
        <RecordField source="max_attendees" label="Max Attendees" />
        <RecordField source="price_in_kobo" label="Base Price">
          <PriceField />
        </RecordField>
        <RecordField label="Ticket Types">
          <ReferenceManyCount reference="ticket_types" target="event_id" />
        </RecordField>
        <RecordField source="created_at" label="Created">
          <DateField source="created_at" showTime />
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
