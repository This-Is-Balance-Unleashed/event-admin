# Admin Implementation Plan: Tickets, Coupons & Check-in

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a working admin panel with a Tickets list, full Coupons CRUD, and a dedicated check-in validation page that searches by QR secret / name / email and marks tickets as `used`.

**Architecture:** `ra-supabase` data provider (service role key) → local `<Admin>` component with `tanStackRouterProvider` from `ra-router-tanstack` → embedded at `/admin/**` via a TanStack Router splat route → resources for `tickets` and `coupons` + a `<CustomRoutes>` entry for the check-in page.

**Tech Stack:** TanStack Start, TanStack Router (file-based), ra-core, ra-supabase, ra-router-tanstack, shadcn-admin-kit components, @supabase/supabase-js, Tailwind CSS v4, TypeScript.

---

## Pre-flight Notes

- All components files: **kebab-case filenames**, PascalCase exports.
- After every task run `bun run build` to catch TS errors early.
- No auth for now — do not pass `authProvider` to `<Admin>`.
- Prices are stored as **kobo** (₦1 = 100 kobo). Display as ₦ by dividing by 100.
- The `AGENTS.md` requires `verbatimModuleSyntax: false` in `tsconfig.json` for shadcn-admin-kit.

---

## Task 1: Fix tsconfig and create .env

**Files:**
- Modify: `tsconfig.json`
- Create: `.env` (at project root)
- Create: `.gitignore` (or confirm it ignores `.env`)

**Step 1: Set verbatimModuleSyntax to false**

In `tsconfig.json`, change:
```json
"verbatimModuleSyntax": true,
```
to:
```json
"verbatimModuleSyntax": false,
```

**Step 2: Create .env**

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Get values from the same project used in `unleashed-app` (`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`).

**Step 3: Ensure .gitignore includes .env**

```
.env
.env.local
```

**Step 4: Verify build still passes**

```bash
bun run build
```

Expected: no TS errors.

**Step 5: Commit**

```bash
git add tsconfig.json .gitignore
git commit -m "chore: fix verbatimModuleSyntax and add env setup"
```

---

## Task 2: Set up Supabase data provider

**Files:**
- Create: `src/lib/supabase-provider.ts`
- Modify: `src/components/admin/admin.tsx` (add `routerProvider` passthrough)

**Step 1: Create `src/lib/supabase-provider.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import { supabaseDataProvider } from 'ra-supabase'

const instanceUrl = import.meta.env.VITE_SUPABASE_URL as string
const apiKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

export const supabaseClient = createClient(instanceUrl, apiKey)

export const dataProvider = supabaseDataProvider({
  instanceUrl,
  apiKey,
  supabaseClient,
})
```

**Step 2: Patch `src/components/admin/admin.tsx` to pass `routerProvider` through**

In the `Admin` function, add `routerProvider` to the destructured props and pass it to `AdminContext`:

Find the destructuring block (around line 70):
```tsx
  const {
    accessDenied,
    authCallbackPage = AuthCallback,
    authenticationError,
    authProvider,
    basename,
```
Add `routerProvider,` to the destructuring list after `ready = Ready,`:
```tsx
    ready = Ready,
    routerProvider,
    store = defaultStore,
```

Then find the `<AdminContext>` opening tag and add `routerProvider={routerProvider}` to it:
```tsx
    <AdminContext
      authProvider={authProvider}
      basename={basename}
      dataProvider={dataProvider}
      i18nProvider={i18nProvider}
      queryClient={queryClient}
      routerProvider={routerProvider}
      store={store}
    >
```

**Step 3: Verify build**

```bash
bun run build
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/lib/supabase-provider.ts src/components/admin/admin.tsx
git commit -m "feat: add supabase data provider and routerProvider passthrough"
```

---

## Task 3: Create the Admin mount route (TanStack Router splat)

**Files:**
- Create: `src/routes/admin/$.tsx`

This single file catches all `/admin`, `/admin/tickets`, `/admin/tickets/123`, etc. and renders the `<Admin>` component. React-admin reads the URL internally and shows the right page.

**Step 1: Create `src/routes/admin/$.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Resource } from 'ra-core'
import { tanStackRouterProvider } from 'ra-router-tanstack'
import { Ticket, Tag, ScanLine } from 'lucide-react'
import { Admin } from '@/components/admin/admin'
import { dataProvider } from '@/lib/supabase-provider'
import { TicketList } from '@/components/admin/ticket-list'
import { TicketShow } from '@/components/admin/ticket-show'
import { CouponList } from '@/components/admin/coupon-list'
import { CouponCreate } from '@/components/admin/coupon-create'
import { CouponEdit } from '@/components/admin/coupon-edit'
import { CheckInPage } from '@/components/admin/check-in-page'

export const Route = createFileRoute('/admin/$')({
  component: AdminApp,
})

const { Route: CustomRoute } = tanStackRouterProvider

function AdminApp() {
  return (
    <Admin
      dataProvider={dataProvider}
      routerProvider={tanStackRouterProvider}
      basename="/admin"
      title="Hit Refresh Admin"
      disableTelemetry
    >
      <Resource
        name="tickets"
        list={TicketList}
        show={TicketShow}
        icon={Ticket}
        recordRepresentation={(r) => r.name ?? r.email}
      />
      <Resource
        name="coupons"
        list={CouponList}
        create={CouponCreate}
        edit={CouponEdit}
        icon={Tag}
        recordRepresentation="code"
      />
      <CustomRoute
        noLayout={false}
        path="/checkin"
        element={<CheckInPage />}
      />
    </Admin>
  )
}
```

**Step 2: Verify build**

```bash
bun run build
```
Expected: TypeScript may complain about missing component imports (TicketList etc) — that's fine at this stage if they don't exist yet, comment them out until Task 4-6 are done. Alternatively, create empty placeholder exports.

**Step 3: Commit**

```bash
git add src/routes/admin/
git commit -m "feat: add admin splat route with TanStack Router mount"
```

---

## Task 4: Tickets — List and Show

**Files:**
- Create: `src/components/admin/ticket-list.tsx`
- Create: `src/components/admin/ticket-show.tsx`
- Create: `src/components/admin/ticket-status-badge.tsx`

### 4a — Status badge (shared utility)

**Create `src/components/admin/ticket-status-badge.tsx`**

```tsx
import { Badge } from '@/components/ui/badge'

type Status = 'reserved' | 'paid' | 'failed' | 'used'

const variants: Record<Status, React.ComponentProps<typeof Badge>['variant']> = {
  paid: 'default',       // green
  used: 'secondary',     // grey
  reserved: 'outline',   // neutral
  failed: 'destructive', // red
}

export function TicketStatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant={variants[status] ?? 'outline'}>
      {status}
    </Badge>
  )
}
```

### 4b — Ticket List

**Create `src/components/admin/ticket-list.tsx`**

```tsx
import { useRecordContext } from 'ra-core'
import { List } from '@/components/admin/list'
import { DataTable } from '@/components/admin/data-table'
import { TextField } from '@/components/admin/text-field'
import { DateField } from '@/components/admin/date-field'
import { NumberField } from '@/components/admin/number-field'
import { ShowButton } from '@/components/admin/show-button'
import { FilterForm, FilterButton } from '@/components/admin/filter-form'
import { SearchInput } from '@/components/admin/search-input'
import { SelectInput } from '@/components/admin/select-input'
import { TicketStatusBadge } from '@/components/admin/ticket-status-badge'

const statusChoices = [
  { id: 'reserved', name: 'Reserved' },
  { id: 'paid', name: 'Paid' },
  { id: 'failed', name: 'Failed' },
  { id: 'used', name: 'Used' },
]

const listFilters = [
  <SearchInput source="email" key="email" alwaysOn />,
  <SearchInput source="name" key="name" />,
  <SelectInput source="status" choices={statusChoices} key="status" />,
]

function StatusCell() {
  const record = useRecordContext()
  if (!record) return null
  return <TicketStatusBadge status={record.status} />
}

function PriceCell() {
  const record = useRecordContext()
  if (!record) return null
  return <span>₦{(record.price_paid / 100).toLocaleString()}</span>
}

export function TicketList() {
  return (
    <List filters={listFilters} sort={{ field: 'created_at', order: 'DESC' }}>
      <DataTable>
        <DataTable.Col source="name" />
        <DataTable.Col source="email" />
        <DataTable.Col source="status" label="Status">
          <StatusCell />
        </DataTable.Col>
        <DataTable.Col source="price_paid" label="Price Paid">
          <PriceCell />
        </DataTable.Col>
        <DataTable.Col source="created_at" label="Purchased">
          <DateField source="created_at" showTime />
        </DataTable.Col>
        <DataTable.Col source="checked_in_at" label="Checked In">
          <DateField source="checked_in_at" showTime emptyText="—" />
        </DataTable.Col>
        <DataTable.Col label="">
          <ShowButton />
        </DataTable.Col>
      </DataTable>
    </List>
  )
}
```

### 4c — Ticket Show (with Check In button)

**Create `src/components/admin/ticket-show.tsx`**

```tsx
import { useRecordContext, useUpdate, useNotify, useRefresh } from 'ra-core'
import { Show } from '@/components/admin/show'
import { SimpleShowLayout } from '@/components/admin/simple-show-layout'
import { TextField } from '@/components/admin/text-field'
import { DateField } from '@/components/admin/date-field'
import { EmailField } from '@/components/admin/email-field'
import { RecordField } from '@/components/admin/record-field'
import { Button } from '@/components/ui/button'
import { TicketStatusBadge } from '@/components/admin/ticket-status-badge'
import { ScanLine, CheckCircle2, AlertCircle } from 'lucide-react'

function CheckInButton() {
  const record = useRecordContext()
  const [update, { isPending }] = useUpdate()
  const notify = useNotify()
  const refresh = useRefresh()

  if (!record) return null

  if (record.status === 'used') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <CheckCircle2 className="size-4 text-green-500" />
        Checked in at {new Date(record.checked_in_at).toLocaleString()}
      </div>
    )
  }

  if (record.status !== 'paid') {
    return (
      <div className="flex items-center gap-2 text-amber-600 text-sm">
        <AlertCircle className="size-4" />
        Cannot check in — ticket status is &ldquo;{record.status}&rdquo;
      </div>
    )
  }

  const handleCheckIn = () => {
    update(
      'tickets',
      {
        id: record.id,
        data: { status: 'used', checked_in_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          notify('Ticket checked in successfully', { type: 'success' })
          refresh()
        },
        onError: () => notify('Check-in failed', { type: 'error' }),
      }
    )
  }

  return (
    <Button onClick={handleCheckIn} disabled={isPending} size="lg" className="gap-2">
      <ScanLine className="size-4" />
      {isPending ? 'Checking in…' : 'Check In'}
    </Button>
  )
}

export function TicketShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="name" />
        <RecordField source="email" label="Email">
          <EmailField source="email" />
        </RecordField>
        <RecordField source="status" label="Status">
          {/* inline render */}
          <StatusBadgeField />
        </RecordField>
        <RecordField source="ticket_type_id" label="Ticket Type" />
        <RecordField source="price_paid" label="Price Paid">
          <PricePaidField />
        </RecordField>
        <RecordField source="paystack_reference" label="Payment Ref" />
        <RecordField source="created_at" label="Purchased At">
          <DateField source="created_at" showTime />
        </RecordField>
        <RecordField source="checked_in_at" label="Checked In At">
          <DateField source="checked_in_at" showTime emptyText="Not yet checked in" />
        </RecordField>
        <div className="pt-4">
          <CheckInButton />
        </div>
      </SimpleShowLayout>
    </Show>
  )
}

function StatusBadgeField() {
  const record = useRecordContext()
  if (!record) return null
  return <TicketStatusBadge status={record.status} />
}

function PricePaidField() {
  const record = useRecordContext()
  if (!record) return null
  return <span>₦{(record.price_paid / 100).toLocaleString()}</span>
}
```

**Step: Verify build**

```bash
bun run build
```

**Step: Commit**

```bash
git add src/components/admin/ticket-list.tsx src/components/admin/ticket-show.tsx src/components/admin/ticket-status-badge.tsx
git commit -m "feat: add ticket list and show with inline check-in button"
```

---

## Task 5: Coupons — Full CRUD

**Files:**
- Create: `src/components/admin/coupon-list.tsx`
- Create: `src/components/admin/coupon-create.tsx`
- Create: `src/components/admin/coupon-edit.tsx`

### 5a — Coupon List

**Create `src/components/admin/coupon-list.tsx`**

```tsx
import { useRecordContext } from 'ra-core'
import { List } from '@/components/admin/list'
import { DataTable } from '@/components/admin/data-table'
import { TextField } from '@/components/admin/text-field'
import { DateField } from '@/components/admin/date-field'
import { EditButton } from '@/components/admin/edit-button'
import { DeleteButton } from '@/components/admin/delete-button'
import { CreateButton } from '@/components/admin/create-button'
import { Badge } from '@/components/ui/badge'

function ActiveBadge() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Badge variant={record.is_active ? 'default' : 'secondary'}>
      {record.is_active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

function DiscountCell() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <span>
      {record.discount_type === 'percent'
        ? `${record.discount_value}%`
        : `₦${(record.discount_value / 100).toLocaleString()}`}
    </span>
  )
}

function UsageCell() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <span className="tabular-nums">
      {record.times_used} / {record.max_uses === 0 ? '∞' : record.max_uses}
    </span>
  )
}

export function CouponList() {
  return (
    <List
      sort={{ field: 'created_at', order: 'DESC' }}
      actions={<CreateButton />}
    >
      <DataTable>
        <DataTable.Col source="code" />
        <DataTable.Col source="discount_value" label="Discount">
          <DiscountCell />
        </DataTable.Col>
        <DataTable.Col source="is_active" label="Status">
          <ActiveBadge />
        </DataTable.Col>
        <DataTable.Col source="times_used" label="Usage">
          <UsageCell />
        </DataTable.Col>
        <DataTable.Col source="expires_at" label="Expires">
          <DateField source="expires_at" emptyText="Never" />
        </DataTable.Col>
        <DataTable.Col label="">
          <EditButton />
          <DeleteButton />
        </DataTable.Col>
      </DataTable>
    </List>
  )
}
```

### 5b — Coupon Create

**Create `src/components/admin/coupon-create.tsx`**

```tsx
import { required } from 'ra-core'
import { Create } from '@/components/admin/create'
import { SimpleForm } from '@/components/admin/simple-form'
import { TextInput } from '@/components/admin/text-input'
import { NumberInput } from '@/components/admin/number-input'
import { SelectInput } from '@/components/admin/select-input'
import { BooleanInput } from '@/components/admin/boolean-input'
import { DateTimeInput } from '@/components/admin/date-time-input'

const discountTypeChoices = [
  { id: 'percent', name: 'Percentage (%)' },
  { id: 'fixed', name: 'Fixed Amount (₦ in kobo)' },
]

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
        <SelectInput
          source="discount_type"
          choices={discountTypeChoices}
          validate={required()}
        />
        <NumberInput
          source="discount_value"
          validate={required()}
          helperText="For percent: enter 10 for 10%. For fixed: enter amount in kobo (e.g. 100000 = ₦1,000)"
          min={0}
        />
        <NumberInput
          source="max_uses"
          defaultValue={0}
          helperText="0 means unlimited"
          min={0}
        />
        <BooleanInput source="is_active" defaultValue={true} />
        <DateTimeInput source="expires_at" helperText="Leave blank for no expiry" />
      </SimpleForm>
    </Create>
  )
}
```

### 5c — Coupon Edit

**Create `src/components/admin/coupon-edit.tsx`**

```tsx
import { required } from 'ra-core'
import { Edit } from '@/components/admin/edit'
import { SimpleForm } from '@/components/admin/simple-form'
import { TextInput } from '@/components/admin/text-input'
import { NumberInput } from '@/components/admin/number-input'
import { SelectInput } from '@/components/admin/select-input'
import { BooleanInput } from '@/components/admin/boolean-input'
import { DateTimeInput } from '@/components/admin/date-time-input'

const discountTypeChoices = [
  { id: 'percent', name: 'Percentage (%)' },
  { id: 'fixed', name: 'Fixed Amount (₦ in kobo)' },
]

export function CouponEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput
          source="code"
          validate={required()}
          parse={(v: string) => v.toUpperCase()}
        />
        <SelectInput
          source="discount_type"
          choices={discountTypeChoices}
          validate={required()}
        />
        <NumberInput source="discount_value" validate={required()} min={0} />
        <NumberInput source="max_uses" min={0} helperText="0 = unlimited" />
        <BooleanInput source="is_active" />
        <DateTimeInput source="expires_at" />
      </SimpleForm>
    </Edit>
  )
}
```

**Step: Verify build**

```bash
bun run build
```

**Step: Commit**

```bash
git add src/components/admin/coupon-list.tsx src/components/admin/coupon-create.tsx src/components/admin/coupon-edit.tsx
git commit -m "feat: add coupons CRUD (list, create, edit)"
```

---

## Task 6: Check-in Page (standalone door-staff UI)

**Files:**
- Create: `src/components/admin/check-in-form.tsx`
- Create: `src/components/admin/check-in-page.tsx`

### 6a — Check-in Form Component

This component is a self-contained search + result + action widget. It uses `supabaseClient` directly (bypassing react-admin's data layer) for more granular control.

**Create `src/components/admin/check-in-form.tsx`**

```tsx
import { useState, useCallback } from 'react'
import { useDebounce } from '@/hooks/use-debounce'  // see note below
import { supabaseClient } from '@/lib/supabase-provider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScanLine, CheckCircle2, AlertCircle, Clock, XCircle, Search } from 'lucide-react'
import { TicketStatusBadge } from '@/components/admin/ticket-status-badge'

type Ticket = {
  id: string
  name: string | null
  email: string
  status: 'reserved' | 'paid' | 'failed' | 'used'
  price_paid: number
  checked_in_at: string | null
  ticket_types: { name: string } | null
}

const STATUS_ICON = {
  paid: <CheckCircle2 className="size-5 text-green-500" />,
  used: <CheckCircle2 className="size-5 text-muted-foreground" />,
  reserved: <Clock className="size-5 text-amber-500" />,
  failed: <XCircle className="size-5 text-red-500" />,
}

const STATUS_MESSAGE = {
  paid: 'Ready to check in',
  used: (t: Ticket) => `Already checked in at ${t.checked_in_at ? new Date(t.checked_in_at).toLocaleString() : '—'}`,
  reserved: 'Payment not confirmed — cannot check in',
  failed: 'Payment failed — cannot check in',
}

function TicketCard({
  ticket,
  onCheckIn,
  loading,
}: {
  ticket: Ticket
  onCheckIn: (id: string) => void
  loading: boolean
}) {
  const statusMsg = typeof STATUS_MESSAGE[ticket.status] === 'function'
    ? (STATUS_MESSAGE[ticket.status] as (t: Ticket) => string)(ticket)
    : STATUS_MESSAGE[ticket.status]

  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{ticket.name ?? '(no name)'}</CardTitle>
            <p className="text-sm text-muted-foreground">{ticket.email}</p>
          </div>
          <TicketStatusBadge status={ticket.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          {ticket.ticket_types?.name ?? 'Unknown ticket type'} · ₦{(ticket.price_paid / 100).toLocaleString()}
        </div>
        <Separator />
        <div className="flex items-center gap-2 text-sm">
          {STATUS_ICON[ticket.status]}
          <span>{statusMsg}</span>
        </div>
        {ticket.status === 'paid' && (
          <Button
            className="w-full gap-2 text-base h-12"
            onClick={() => onCheckIn(ticket.id)}
            disabled={loading}
          >
            <ScanLine className="size-5" />
            {loading ? 'Checking in…' : 'Confirm Check In'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function CheckInForm() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Ticket[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [checkingIn, setCheckingIn] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults(null)
      return
    }
    setSearching(true)
    setError(null)
    setSuccess(null)
    const { data, error: err } = await supabaseClient
      .from('tickets')
      .select('id, name, email, status, price_paid, checked_in_at, ticket_types(name)')
      .or(`ticket_secret.eq.${q.trim()},email.ilike.%${q.trim()}%,name.ilike.%${q.trim()}%`)
      .limit(10)
    setSearching(false)
    if (err) {
      setError('Search failed: ' + err.message)
      return
    }
    setResults(data as Ticket[])
  }, [])

  // Debounce search by 300ms
  const debouncedSearch = useCallback(
    debounce((q: string) => search(q), 300),
    [search]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    debouncedSearch(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') search(query)
  }

  const handleCheckIn = async (id: string) => {
    setCheckingIn(id)
    setError(null)
    const { error: err } = await supabaseClient
      .from('tickets')
      .update({ status: 'used', checked_in_at: new Date().toISOString() })
      .eq('id', id)
    setCheckingIn(null)
    if (err) {
      setError('Check-in failed: ' + err.message)
      return
    }
    setSuccess('Checked in successfully!')
    // Refresh results to show updated state
    await search(query)
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          className="pl-9 h-12 text-base"
          placeholder="Search by name, email or QR code…"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>

      {searching && (
        <p className="text-center text-sm text-muted-foreground">Searching…</p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded p-3">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 rounded p-3">
          <CheckCircle2 className="size-4 shrink-0" />
          {success}
        </div>
      )}

      {results !== null && results.length === 0 && !searching && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No tickets found for &ldquo;{query}&rdquo;
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onCheckIn={handleCheckIn}
              loading={checkingIn === ticket.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Inline debounce utility (avoids extra dep)
function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: T) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
```

### 6b — Check-in Page Wrapper

**Create `src/components/admin/check-in-page.tsx`**

```tsx
import { ScanLine } from 'lucide-react'
import { CheckInForm } from '@/components/admin/check-in-form'

export function CheckInPage() {
  return (
    <div className="flex flex-col gap-6 py-6 px-4 max-w-2xl mx-auto w-full">
      <div className="text-center space-y-1">
        <div className="flex justify-center">
          <div className="bg-primary/10 rounded-full p-4">
            <ScanLine className="size-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Event Check-in</h1>
        <p className="text-muted-foreground text-sm">
          Search by attendee name, email, or scan the QR ticket code
        </p>
      </div>
      <CheckInForm />
    </div>
  )
}
```

**Step: Verify build**

```bash
bun run build
```

**Step: Commit**

```bash
git add src/components/admin/check-in-form.tsx src/components/admin/check-in-page.tsx
git commit -m "feat: add check-in page with search by name, email, and QR secret"
```

---

## Task 7: Update App Sidebar — add Check-in link

The `AppSidebar` auto-generates resource links from `<Resource>` definitions. The check-in page is a custom route, so we need to add it manually.

**Files:**
- Modify: `src/components/admin/app-sidebar.tsx`

**Step 1: Add a static Check-in menu item at the bottom of the sidebar nav**

In `AppSidebar`, after the `{Object.keys(resources)...}` map, add:

```tsx
import { ScanLine } from 'lucide-react'
// ... existing imports

// Inside <SidebarMenu>, after the resources map:
<CheckInMenuItem onClick={handleClick} />
```

Add the component:
```tsx
export const CheckInMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const match = useMatch({ path: '/admin/checkin', end: false })
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match} className="text-primary font-medium">
        <Link to="/admin/checkin" onClick={onClick}>
          <ScanLine />
          Check In
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
```

**Step 2: Verify build**

```bash
bun run build
```

**Step 3: Commit**

```bash
git add src/components/admin/app-sidebar.tsx
git commit -m "feat: add check-in link to admin sidebar"
```

---

## Task 8: Update Admin title and sidebar branding

**Files:**
- Modify: `src/components/admin/app-sidebar.tsx` — change "Acme Inc." to "Hit Refresh"
- Modify: `src/routes/__root.tsx` — update page `<title>` to "Hit Refresh Admin"

**Step 1: Update sidebar brand name**

In `AppSidebar`, change:
```tsx
<span className="text-base font-semibold">Acme Inc.</span>
```
to:
```tsx
<span className="text-base font-semibold">Hit Refresh</span>
```

**Step 2: Update root title**

In `__root.tsx`:
```tsx
{ title: 'Hit Refresh Admin' },
```

**Step 3: Commit**

```bash
git add src/components/admin/app-sidebar.tsx src/routes/__root.tsx
git commit -m "chore: update branding to Hit Refresh Admin"
```

---

## Task 9: Final verification

**Step 1: Full build check**

```bash
bun run build
```

Expected: zero TS errors, zero build errors.

**Step 2: Manual smoke test (dev server)**

Start the dev server (only when user requests):
```bash
bun run dev
```

Verify:
- [ ] `/admin` loads the admin app with sidebar
- [ ] `/admin/tickets` shows the tickets list with email/name/status filters
- [ ] Clicking a ticket row opens the show page with Check In button
- [ ] `/admin/coupons` shows coupon list
- [ ] Create/Edit coupon forms work
- [ ] `/admin/checkin` shows the full-screen check-in search UI
- [ ] Sidebar shows: Tickets, Coupons, Check In

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete admin for tickets, coupons, and check-in validation"
```
