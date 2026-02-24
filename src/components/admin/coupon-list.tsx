import { useRecordContext } from 'ra-core'
import { List } from '@/components/admin/list'
import { DataTable } from '@/components/admin/data-table'
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
