import { ReactNode } from 'react'

export function PageHeader({ title, subtitle, actions }: {
  title?: string
  subtitle?: string
  actions?: ReactNode
}) {
  if (!title && !actions) return null

  return (
    <div className="page-header">
      {title && (
        <div style={{ minWidth: 0 }}>
          <h2 className="page-title">{title}</h2>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      )}
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
