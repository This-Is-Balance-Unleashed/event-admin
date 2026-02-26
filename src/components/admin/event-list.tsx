import { useRecordContext } from "ra-core";
import { List } from "@/components/admin/list";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { ShowButton } from "@/components/admin/show-button";
import { EditButton } from "@/components/admin/edit-button";

function PriceCell() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.price_in_kobo / 100).toLocaleString()}</span>;
}

export function EventList() {
  return (
    <List sort={{ field: "event_date", order: "DESC" }}>
      <DataTable>
        <DataTable.Col source="title" />
        <DataTable.Col source="event_date" label="Date">
          <DateField source="event_date" />
        </DataTable.Col>
        <DataTable.Col source="location" />
        <DataTable.Col source="max_attendees" label="Max Attendees" />
        <DataTable.Col source="price_in_kobo" label="Price">
          <PriceCell />
        </DataTable.Col>
        <DataTable.Col label="">
          <ShowButton />
          <EditButton />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
