import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";

export function GroupMemberEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="name" />
        <TextInput source="email" />
      </SimpleForm>
    </Edit>
  );
}
