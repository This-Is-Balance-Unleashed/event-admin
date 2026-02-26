import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";
import { SelectInput } from "@/components/admin/select-input";

const statusChoices = [
  { id: "pending", name: "Pending" },
  { id: "paid", name: "Paid" },
  { id: "failed", name: "Failed" },
];

export function GroupBookingEdit() {
  return (
    <Edit>
      <SimpleForm>
        <SelectInput source="status" choices={statusChoices} />
      </SimpleForm>
    </Edit>
  );
}
