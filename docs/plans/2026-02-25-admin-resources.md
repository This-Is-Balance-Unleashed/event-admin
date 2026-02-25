# Admin Resources Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `events`, `ticket_types`, `group_bookings`, and `group_members` as fully managed resources in the Hit Refresh admin panel.

**Architecture:** Each resource gets list + show + edit component files in `src/components/admin/` (kebab-case filenames, PascalCase exports). All follow the established ra-core pattern: `List`+`DataTable` for listing, `Show`+`SimpleShowLayout`+`RecordField` for detail, `Edit`+`SimpleForm` for editing. `group_members` has no sidebar entry — registered as a silent Resource (no `list` prop) and embedded in the group booking show page via `ReferenceManyField`. All 4 Resources are wired in `src/routes/admin/$.tsx`.

**Tech Stack:** ra-core, ra-supabase, shadcn-admin-kit component library (`@/components/admin/*`), lucide-react icons, TanStack Start

---

### Context: Component patterns in this codebase

**List pattern** (see `src/components/admin/ticket-list.tsx`):
```tsx
import { List } from "@/components/admin/list";
import { DataTable } from "@/components/admin/data-table";

export function MyList() {
  return (
    <List sort={{ field: "created_at", order: "DESC" }}>
      <DataTable>
        <DataTable.Col source="field_name" />
        <DataTable.Col source="field_name" label="Custom Label">
          <CustomCellComponent />  {/* uses useRecordContext() */}
        </DataTable.Col>
        <DataTable.Col label=""><ShowButton /><EditButton /></DataTable.Col>
      </DataTable>
    </List>
  );
}
```

**Show pattern** (see `src/components/admin/ticket-show.tsx`):
```tsx
import { Show } from "@/components/admin/show";
import { SimpleShowLayout } from "@/components/admin/simple-show-layout";
import { RecordField } from "@/components/admin/record-field";

export function MyShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="field_name" />
        <RecordField source="field_name" label="Custom">
          <CustomDisplayComponent />
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
```

**Edit pattern** (see `src/components/admin/coupon-edit.tsx`):
```tsx
import { Edit } from "@/components/admin/edit";
import { SimpleForm } from "@/components/admin/simple-form";

export function MyEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="field_name" />
      </SimpleForm>
    </Edit>
  );
}
```

**Cell components** always use `useRecordContext()` from `ra-core` and return null if no record.

---

### Task 1: events resource (list, show, edit)

**Files:**
- Create: `src/components/admin/event-list.tsx`
- Create: `src/components/admin/event-show.tsx`
- Create: `src/components/admin/event-edit.tsx`

**Step 1: Create `src/components/admin/event-list.tsx`**

```tsx
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
```

**Step 2: Create `src/components/admin/event-show.tsx`**

```tsx
import { useRecordContext } from "ra-core";
import { Show } from "@/components/admin/show";
import { SimpleShowLayout } from "@/components/admin/simple-show-layout";
import { RecordField } from "@/components/admin/record-field";
import { DateField } from "@/components/admin/date-field";
import { ReferenceManyCount } from "@/components/admin/reference-many-count";

function PriceField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.price_in_kobo / 100).toLocaleString()}</span>;
}

export function EventShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="title" />
        <RecordField source="description" />
        <RecordField source="event_date" label="Date">
          <DateField source="event_date" showTime />
        </RecordField>
        <RecordField source="location" />
        <RecordField source="max_attendees" label="Max Attendees" />
        <RecordField source="price_in_kobo" label="Base Price">
          <PriceField />
        </RecordField>
        <RecordField source="ticket_types_count" label="Ticket Types">
          <ReferenceManyCount reference="ticket_types" target="event_id" />
        </RecordField>
        <RecordField source="created_at" label="Created">
          <DateField source="created_at" showTime />
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
```

**Step 3: Create `src/components/admin/event-edit.tsx`**

```tsx
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
        <DateTimeInput source="event_date" />
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
```

**Step 4: Run typecheck**

```bash
bun run build 2>&1 | grep -E "error|warning" | head -20
```
Expected: No errors in the 3 new files.

**Step 5: Commit**

```bash
git -C /Users/oluwasetemi/i/balanced/event-admin add \
  src/components/admin/event-list.tsx \
  src/components/admin/event-show.tsx \
  src/components/admin/event-edit.tsx
git -C /Users/oluwasetemi/i/balanced/event-admin commit -m "feat: add event list, show, and edit components"
```

---

### Task 2: ticket_types resource (list, show, edit)

**Files:**
- Create: `src/components/admin/ticket-type-list.tsx`
- Create: `src/components/admin/ticket-type-show.tsx`
- Create: `src/components/admin/ticket-type-edit.tsx`

**Step 1: Create `src/components/admin/ticket-type-list.tsx`**

```tsx
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
```

**Step 2: Create `src/components/admin/ticket-type-show.tsx`**

```tsx
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
```

**Step 3: Create `src/components/admin/ticket-type-edit.tsx`**

```tsx
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
```

**Step 4: Run typecheck**

```bash
bun run build 2>&1 | grep -E "error" | head -20
```
Expected: No errors.

**Step 5: Commit**

```bash
git -C /Users/oluwasetemi/i/balanced/event-admin add \
  src/components/admin/ticket-type-list.tsx \
  src/components/admin/ticket-type-show.tsx \
  src/components/admin/ticket-type-edit.tsx
git -C /Users/oluwasetemi/i/balanced/event-admin commit -m "feat: add ticket_types list, show, and edit components"
```

---

### Task 3: group_bookings list and edit

**Files:**
- Create: `src/components/admin/group-booking-list.tsx`
- Create: `src/components/admin/group-booking-edit.tsx`

**Step 1: Create `src/components/admin/group-booking-list.tsx`**

```tsx
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
```

**Step 2: Create `src/components/admin/group-booking-edit.tsx`**

```tsx
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
```

**Step 3: Commit**

```bash
git -C /Users/oluwasetemi/i/balanced/event-admin add \
  src/components/admin/group-booking-list.tsx \
  src/components/admin/group-booking-edit.tsx
git -C /Users/oluwasetemi/i/balanced/event-admin commit -m "feat: add group_bookings list and edit components"
```

---

### Task 4: group_booking show page (with embedded members)

**Files:**
- Create: `src/components/admin/group-booking-show.tsx`

This is the most complex component. It uses `ReferenceManyField` to embed group members directly in the booking detail page.

`★ Key pattern:` `ReferenceManyField reference="group_members" target="group_booking_id"` tells ra-core to fetch `group_members` where `group_booking_id = currentRecord.id`. The `DataTable` inside renders each member row.

**Step 1: Create `src/components/admin/group-booking-show.tsx`**

```tsx
import { useRecordContext } from "ra-core";
import { Show } from "@/components/admin/show";
import { SimpleShowLayout } from "@/components/admin/simple-show-layout";
import { RecordField } from "@/components/admin/record-field";
import { DateField } from "@/components/admin/date-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { TextField } from "@/components/admin/text-field";
import { DataTable } from "@/components/admin/data-table";
import { EditButton } from "@/components/admin/edit-button";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  paid: "default",
  pending: "secondary",
  failed: "destructive",
};

function StatusBadge() {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Badge variant={STATUS_VARIANT[record.status] ?? "secondary"} className="capitalize">
      {record.status}
    </Badge>
  );
}

function TotalField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.total_price_paid / 100).toLocaleString()}</span>;
}

function DiscountField() {
  const record = useRecordContext();
  if (!record) return null;
  return <span>₦{(record.discount_applied / 100).toLocaleString()}</span>;
}

function PrimaryContactBadge() {
  const record = useRecordContext();
  if (!record) return null;
  return record.is_primary_contact ? <Badge variant="outline">Primary</Badge> : null;
}

function PerksField() {
  const record = useRecordContext();
  if (!record?.selected_perks) return <span className="text-muted-foreground">—</span>;
  return (
    <pre className="text-xs bg-muted rounded p-2 overflow-auto max-w-lg">
      {JSON.stringify(record.selected_perks, null, 2)}
    </pre>
  );
}

export function GroupBookingShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="booking_reference" label="Reference" />
        <RecordField source="booking_type" label="Type" />
        <RecordField source="status" label="Status">
          <StatusBadge />
        </RecordField>
        <RecordField source="company_name" label="Company" />
        <RecordField source="group_name" label="Group Name" />
        <RecordField source="primary_contact_name" label="Contact Name" />
        <RecordField source="primary_contact_email" label="Contact Email" />
        <RecordField source="primary_contact_phone" label="Contact Phone" />
        <RecordField source="ticket_type_id" label="Ticket Type">
          <ReferenceField source="ticket_type_id" reference="ticket_types" link="show">
            <TextField source="name" />
          </ReferenceField>
        </RecordField>
        <RecordField source="quantity" label="Quantity" />
        <RecordField source="total_price_paid" label="Total Paid">
          <TotalField />
        </RecordField>
        <RecordField source="discount_applied" label="Discount Applied">
          <DiscountField />
        </RecordField>
        <RecordField source="paystack_reference" label="Paystack Ref" />
        <RecordField source="team_preferences" label="Team Preferences" />
        <RecordField source="selected_perks" label="Selected Perks">
          <PerksField />
        </RecordField>
        <RecordField source="created_at" label="Created">
          <DateField source="created_at" showTime />
        </RecordField>

        {/* Embedded group members */}
        <RecordField source="group_members" label="Members">
          <ReferenceManyField
            reference="group_members"
            target="group_booking_id"
            label="Members"
          >
            <DataTable>
              <DataTable.Col source="member_position" label="#" />
              <DataTable.Col source="name" />
              <DataTable.Col source="email" />
              <DataTable.Col source="is_primary_contact" label="Primary">
                <PrimaryContactBadge />
              </DataTable.Col>
              <DataTable.Col source="assigned_ticket_id" label="Ticket">
                <ReferenceField
                  source="assigned_ticket_id"
                  reference="tickets"
                  link="show"
                  emptyText="—"
                >
                  <TextField source="name" />
                </ReferenceField>
              </DataTable.Col>
              <DataTable.Col label="">
                <EditButton />
              </DataTable.Col>
            </DataTable>
          </ReferenceManyField>
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
```

**Step 2: Run build to catch type errors**

```bash
bun run build 2>&1 | grep -E "error" | head -20
```

Common issue: `ReferenceField` may not accept `emptyText` prop. If TypeScript complains, wrap the reference in a custom cell component:
```tsx
function AssignedTicketCell() {
  const record = useRecordContext();
  if (!record?.assigned_ticket_id) return <span className="text-muted-foreground">—</span>;
  return (
    <ReferenceField source="assigned_ticket_id" reference="tickets" link="show">
      <TextField source="name" />
    </ReferenceField>
  );
}
// Then use: <DataTable.Col source="assigned_ticket_id" label="Ticket"><AssignedTicketCell /></DataTable.Col>
```

**Step 3: Commit**

```bash
git -C /Users/oluwasetemi/i/balanced/event-admin add src/components/admin/group-booking-show.tsx
git -C /Users/oluwasetemi/i/balanced/event-admin commit -m "feat: add group_booking show page with embedded members"
```

---

### Task 5: group_member edit

**Files:**
- Create: `src/components/admin/group-member-edit.tsx`

**Step 1: Create `src/components/admin/group-member-edit.tsx`**

```tsx
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
```

**Step 2: Commit**

```bash
git -C /Users/oluwasetemi/i/balanced/event-admin add src/components/admin/group-member-edit.tsx
git -C /Users/oluwasetemi/i/balanced/event-admin commit -m "feat: add group_member edit component"
```

---

### Task 6: Wire all 4 resources in the admin route

**Files:**
- Modify: `src/routes/admin/$.tsx`

**Step 1: Read the current file**

Current file at `/Users/oluwasetemi/i/balanced/event-admin/src/routes/admin/$.tsx` — read it first.

**Step 2: Add imports**

Add to the imports at the top:
```tsx
import { Calendar, Tags, Users, UsersRound } from "lucide-react";
import { EventList } from "@/components/admin/event-list";
import { EventShow } from "@/components/admin/event-show";
import { EventEdit } from "@/components/admin/event-edit";
import { TicketTypeList } from "@/components/admin/ticket-type-list";
import { TicketTypeShow } from "@/components/admin/ticket-type-show";
import { TicketTypeEdit } from "@/components/admin/ticket-type-edit";
import { GroupBookingList } from "@/components/admin/group-booking-list";
import { GroupBookingShow } from "@/components/admin/group-booking-show";
import { GroupBookingEdit } from "@/components/admin/group-booking-edit";
import { GroupMemberEdit } from "@/components/admin/group-member-edit";
```

**Step 3: Add 4 Resource entries inside `AdminApp`**

Add after the existing `<Resource name="coupons" ... />` and before `<CustomRoutes>`:

```tsx
<Resource
  name="events"
  list={EventList}
  show={EventShow}
  edit={EventEdit}
  icon={Calendar}
  recordRepresentation="title"
/>
<Resource
  name="ticket_types"
  list={TicketTypeList}
  show={TicketTypeShow}
  edit={TicketTypeEdit}
  icon={Tags}
  recordRepresentation="name"
/>
<Resource
  name="group_bookings"
  list={GroupBookingList}
  show={GroupBookingShow}
  edit={GroupBookingEdit}
  icon={Users}
  recordRepresentation="booking_reference"
/>
<Resource
  name="group_members"
  edit={GroupMemberEdit}
  icon={UsersRound}
  recordRepresentation={(r) => r.name ?? r.email ?? `Member ${r.member_position}`}
/>
```

Note: `group_members` has NO `list` prop — this is intentional. It won't appear in the sidebar but the Resource registration is required for ra-core's `ReferenceManyField` to be able to fetch and edit members.

**Step 4: Run full verification**

```bash
cd /Users/oluwasetemi/i/balanced/event-admin && bun run build && bun run lint && bun run test
```
Expected: Build passes, 0 lint errors, 3 paystack tests pass.

**Step 5: Commit**

```bash
git -C /Users/oluwasetemi/i/balanced/event-admin add src/routes/admin/$.tsx
git -C /Users/oluwasetemi/i/balanced/event-admin commit -m "feat: wire events, ticket_types, group_bookings, group_members resources"
```

---

## Notes

- **Sidebar order:** ra-core renders Resource sidebar items in declaration order — events, ticket_types, group_bookings will appear below coupons. This is fine.
- **`group_members` registration:** Even without a `list` prop, the Resource must be registered for `ReferenceManyField` and `EditButton` to resolve the resource's data provider and routing correctly.
- **`ReferenceManyField` requires `group_members` registered:** The `reference="group_members"` in GroupBookingShow will throw a ra-core warning if the resource isn't registered — Task 6 handles this.
- **Kobo formatting:** `price_in_kobo` stores prices as integers in kobo (₦1 = 100 kobo). Always divide by 100 for display.
- **No create operations:** Events, ticket_types, and group_bookings are created in the main app (`unleashed-app`). The admin is read+edit only.
