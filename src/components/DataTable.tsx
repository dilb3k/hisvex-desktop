interface Column<T> {
  key: string
  header: string
  render?: (item: T) => React.ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
  isLoading?: boolean
  emptyMessage?: string
  getRowKey?: (item: T) => string | number
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  isLoading,
  emptyMessage = 'No data',
  getRowKey,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 48,
        color: 'var(--color-text-secondary)',
      }}>
        <div style={{
          width: 28,
          height: 28,
          border: '2.5px solid var(--color-border)',
          borderTopColor: 'var(--color-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div style={{
        padding: 48,
        textAlign: 'center',
        color: 'var(--color-text-secondary)',
        fontSize: 14,
      }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{
      overflowX: 'auto',
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--color-surface-hover)' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '12px 16px',
                  textAlign: col.align || 'left',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  borderBottom: '1px solid var(--color-border)',
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => (
            <tr
              key={getRowKey ? getRowKey(item) : ((item._id as string) || idx)}
              onClick={() => onRowClick?.(item)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
                borderBottom: '1px solid var(--color-border)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '12px 16px',
                    fontSize: 13,
                    color: 'var(--color-text)',
                    textAlign: col.align || 'left',
                  }}
                >
                  {col.render ? col.render(item) : (item[col.key] as React.ReactNode) || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
