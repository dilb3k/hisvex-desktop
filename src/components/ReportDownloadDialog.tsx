import { useEffect, useRef } from 'react'
import { Download, X, BarChart3, ClipboardList } from 'lucide-react'
import { t } from '../i18n'

type Props = {
  visible: boolean
  busy: boolean
  canExportStatistics: boolean
  periodLabel: string
  onSelect: (report: 'statistics' | 'receipts') => void
  onClose: () => void
}

export function ReportDownloadDialog({
  visible,
  busy,
  canExportStatistics,
  periodLabel,
  onSelect,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!visible) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [visible])
  if (!visible) return null
  return (
    <div
      onClick={() => {
        if (!busy) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-report-title"
        aria-busy={busy}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose()
          if (e.key === 'Tab') {
            const buttons = Array.from(
              dialog.current?.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled)',
              ) ?? [],
            )
            const target = e.shiftKey ? buttons[buttons.length - 1] : buttons[0]
            if (
              (e.shiftKey && document.activeElement === buttons[0]) ||
              (!e.shiftKey &&
                document.activeElement === buttons[buttons.length - 1])
            ) {
              e.preventDefault()
              target?.focus()
            }
          }
        }}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h3 id="download-report-title" style={{ margin: 0, fontSize: 18 }}>
            {t('downloadReportTitle')}
          </h3>
          <button
            className="icon-ghost-btn"
            aria-label={t('close')}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 13,
            margin: '10px 0 20px',
          }}
        >
          {periodLabel}
        </p>
        {(['statistics', 'receipts'] as const).map((report) => (
          <button
            key={report}
            disabled={busy || (report === 'statistics' && !canExportStatistics)}
            onClick={() => onSelect(report)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 17,
              marginTop: 10,
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-hover)',
              color: 'var(--color-text)',
              textAlign: 'left',
              cursor: 'pointer',
              opacity:
                busy || (report === 'statistics' && !canExportStatistics)
                  ? 0.5
                  : 1,
            }}
          >
            {report === 'statistics' ? (
              <BarChart3 size={24} />
            ) : (
              <ClipboardList size={24} />
            )}
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: 15 }}>
                {t(report === 'statistics' ? 'statistics' : 'downloadReceipts')}
              </strong>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  marginTop: 4,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {t(
                  report === 'statistics'
                    ? 'downloadStatisticsHint'
                    : 'downloadReceiptsHint',
                )}
              </span>
            </span>
            <Download size={18} />
          </button>
        ))}
        {busy && (
          <p
            role="status"
            style={{
              color: 'var(--color-primary)',
              fontSize: 13,
              marginBottom: 0,
            }}
          >
            {t('loading_data')}
          </p>
        )}
      </div>
    </div>
  )
}
