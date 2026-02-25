import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";
import { NumberInput } from "@/components/admin/number-input";
import { BooleanInput } from "@/components/admin/boolean-input";

export function TicketTypeEdit() {
  return (
    <Edit>
      <SimpleForm>
        <BooleanInput source="is_available" />
        <NumberInput
          source="price_in_kobo"
          label="Price (kobo)"
          helperText="Enter in kobo: ₦1,000 = 100000"
          min={0}
        />
        <NumberInput
          source="max_quantity"
          label="Max Quantity"
          min={0}
          helperText="Leave blank for unlimited"
        />
      </SimpleForm>
    </Edit>
  );
}
