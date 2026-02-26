import { required } from "ra-core";
import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";
import { NumberInput } from "@/components/admin/number-input";
import { DateTimeInput } from "@/components/admin/date-time-input";

export function EventEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="title" validate={required()} />
        <TextInput source="description" multiline />
        <DateTimeInput source="event_date" validate={required()} />
        <TextInput source="location" />
        <NumberInput source="max_attendees" min={1} />
        <NumberInput
          source="price_in_kobo"
          label="Base Price (kobo)"
          helperText="Enter in kobo: ₦1,000 = 100000"
          min={0}
        />
      </SimpleForm>
    </Edit>
  );
}
