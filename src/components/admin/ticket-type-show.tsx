import { useRecordContext } from "ra-core";
import { Show } from "@/components/admin/show";
import { SimpleShowLayout } from "@/components/admin/simple-show-layout";
import { RecordField } from "@/components/admin/record-field";
import { DateField } from "@/components/admin/date-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Badge } from "@/components/ui/badge";

function PriceField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.price_in_kobo / 100).toLocaleString()}</span>;
}

function AvailableBadge() {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Badge variant={record.is_available ? "default" : "secondary"}>
      {record.is_available ? "Available" : "Unavailable"}
    </Badge>
  );
}

export function TicketTypeShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="name" />
        <RecordField source="event_id" label="Event">
          <ReferenceField source="event_id" reference="events" link="show">
            <TextField source="title" />
          </ReferenceField>
        </RecordField>
        <RecordField source="description" />
        <RecordField source="price_in_kobo" label="Price">
          <PriceField />
        </RecordField>
        <RecordField source="max_quantity" label="Max Quantity" />
        <RecordField source="sold_quantity" label="Sold" />
        <RecordField source="is_available" label="Available">
          <AvailableBadge />
        </RecordField>
        <RecordField source="sort_order" label="Sort Order" />
        <RecordField source="created_at" label="Created">
          <DateField source="created_at" showTime />
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
