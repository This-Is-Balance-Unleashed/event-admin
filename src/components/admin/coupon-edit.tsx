import { required } from "ra-core";
import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";
import { NumberInput } from "@/components/admin/number-input";
import { SelectInput } from "@/components/admin/select-input";
import { BooleanInput } from "@/components/admin/boolean-input";
import { DateTimeInput } from "@/components/admin/date-time-input";

const discountTypeChoices = [
  { id: "percent", name: "Percentage (%)" },
  { id: "fixed", name: "Fixed Amount (₦ in kobo)" },
];

export function CouponEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="code" validate={required()} parse={(v: string) => v.toUpperCase()} />
        <SelectInput source="discount_type" choices={discountTypeChoices} validate={required()} />
        <NumberInput source="discount_value" validate={required()} min={0} />
        <NumberInput source="max_uses" min={0} helperText="0 = unlimited" />
        <BooleanInput source="is_active" />
        <DateTimeInput source="expires_at" />
      </SimpleForm>
    </Edit>
  );
}
