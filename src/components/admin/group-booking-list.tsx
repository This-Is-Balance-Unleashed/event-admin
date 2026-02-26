import { useRecordContext } from "ra-core";
import { List } from "@/components/admin/list";
import { DataTable } from "@/components/admin/data-table";
import { DateField } from "@/components/admin/date-field";
import { ShowButton } from "@/components/admin/show-button";
import { EditButton } from "@/components/admin/edit-button";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  paid: "default",
  pending: "secondary",
  failed: "destructive",
};

const statusChoices = [
  { id: "pending", name: "Pending" },
  { id: "paid", name: "Paid" },
  { id: "failed", name: "Failed" },
];

const typeChoices = [
  { id: "corporate", name: "Corporate" },
  { id: "group", name: "Group" },
];

const listFilters = [
  <SearchInput source="primary_contact_email" key="email" alwaysOn />,
  <SelectInput source="status" choices={statusChoices} key="status" />,
  <SelectInput source="booking_type" choices={typeChoices} key="type" />,
];

function StatusBadge() {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Badge variant={STATUS_VARIANT[record.status] ?? "secondary"} className="capitalize">
      {record.status}
    </Badge>
  );
}

function TypeBadge() {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Badge variant="outline" className="capitalize">
      {record.booking_type}
    </Badge>
  );
}

function NameCell() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>{record.company_name ?? record.group_name ?? "—"}</span>;
}

function TotalCell() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.total_price_paid / 100).toLocaleString()}</span>;
}

export function GroupBookingList() {
  return (
    <List filters={listFilters} sort={{ field: "created_at", order: "DESC" }}>
      <DataTable>
        <DataTable.Col source="booking_reference" label="Reference" />
        <DataTable.Col source="booking_type" label="Type">
          <TypeBadge />
        </DataTable.Col>
        <DataTable.Col source="company_name" label="Company / Group">
          <NameCell />
        </DataTable.Col>
        <DataTable.Col source="primary_contact_email" label="Contact" />
        <DataTable.Col source="quantity" label="Qty" />
        <DataTable.Col source="total_price_paid" label="Total">
          <TotalCell />
        </DataTable.Col>
        <DataTable.Col source="status" label="Status">
          <StatusBadge />
        </DataTable.Col>
        <DataTable.Col source="created_at" label="Date">
          <DateField source="created_at" />
        </DataTable.Col>
        <DataTable.Col label="">
          <ShowButton />
          <EditButton />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
