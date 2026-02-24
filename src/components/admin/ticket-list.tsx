import { useRecordContext } from 'ra-core'
import { List } from '@/components/admin/list'
import { DataTable } from '@/components/admin/data-table'
import { DateField } from '@/components/admin/date-field'
import { ShowButton } from '@/components/admin/show-button'
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
