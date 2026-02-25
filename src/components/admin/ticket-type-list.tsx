import { useRecordContext } from "ra-core";
import { List } from "@/components/admin/list";
import { DataTable } from "@/components/admin/data-table";
import { ShowButton } from "@/components/admin/show-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Badge } from "@/components/ui/badge";

function PriceCell() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.price_in_kobo / 100).toLocaleString()}</span>;
}

function SoldCell() {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <span className="tabular-nums">
      {record.sold_quantity} / {record.max_quantity ?? "∞"}
    </span>
  );
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

export function TicketTypeList() {
  return (
    <List sort={{ field: "sort_order", order: "ASC" }}>
      <DataTable>
        <DataTable.Col source="name" />
        <DataTable.Col source="event_id" label="Event">
          <ReferenceField source="event_id" reference="events" link="show">
            <TextField source="title" />
          </ReferenceField>
        </DataTable.Col>
        <DataTable.Col source="price_in_kobo" label="Price">
          <PriceCell />
        </DataTable.Col>
        <DataTable.Col source="sold_quantity" label="Sold / Max">
          <SoldCell />
        </DataTable.Col>
        <DataTable.Col source="is_available" label="Available">
          <AvailableBadge />
        </DataTable.Col>
        <DataTable.Col label="">
          <ShowButton />
          <EditButton />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
