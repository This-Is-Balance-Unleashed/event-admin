import { required } from "ra-core";
import { Create } from "@/components/admin/create";
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

export function CouponCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput
          source="code"
          validate={required()}
          parse={(v: string) => v.toUpperCase()}
          helperText="Will be auto-uppercased"
        />
        <SelectInput source="discount_type" choices={discountTypeChoices} validate={required()} />
        <NumberInput
          source="discount_value"
          validate={required()}
          helperText="For percent: enter 10 for 10%. For fixed: enter amount in kobo (e.g. 100000 = ₦1,000)"
          min={0}
        />
        <NumberInput source="max_uses" defaultValue={0} helperText="0 means unlimited" min={0} />
        <BooleanInput source="is_active" defaultValue={true} />
        <DateTimeInput source="expires_at" helperText="Leave blank for no expiry" />
      </SimpleForm>
    </Create>
  );
}
