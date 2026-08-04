import type { CSSProperties } from 'react'

export const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  animation: 'fadeIn 0.2s ease',
  backdropFilter: 'blur(4px)',
}

export const modalContainer: CSSProperties = {
  width: 480,
  maxHeight: '90vh',
  background: 'var(--color-bg-alt)',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--color-border)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
  animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
}

export const modalHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '18px 24px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  flexShrink: 0,
}

export const modalBody: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 24,
}

export const modalFooter: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  padding: '16px 24px',
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  flexShrink: 0,
}

export const inputBase: CSSProperties = {
  padding: '12px 15px',
  borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: 15,
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  fontFamily: 'inherit',
}

export const inputError: CSSProperties = {
  ...inputBase,
  borderColor: 'var(--color-danger)',
  boxShadow: '0 0 0 3px var(--color-danger-soft)',
}

export const label: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 6,
}

export const errorText: CSSProperties = {
  color: 'var(--color-danger)',
  fontSize: 13,
  marginTop: 3,
  fontWeight: 500,
}

export const btnPrimary: CSSProperties = {
  padding: '11px 22px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-primary)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
  boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
}

export const btnSecondary: CSSProperties = {
  padding: '11px 22px',
  borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-text)',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.2s',
}

export const btnDanger: CSSProperties = {
  padding: '11px 22px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-danger)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(239,68,68,0.25)',
}

export const btnSuccess: CSSProperties = {
  padding: '11px 22px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-success)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(34,197,94,0.25)',
}

export const card: CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  padding: 22,
  transition: 'all 0.2s',
}

export const spinner = (size = 32): CSSProperties => ({
  width: size,
  height: size,
  border: '3px solid var(--color-border)',
  borderTopColor: 'var(--color-primary)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
})

export const pageHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 24,
}

export const pageTitle: CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  margin: 0,
  letterSpacing: -0.3,
}

export const searchWrap: CSSProperties = {
  position: 'relative',
  marginBottom: 16,
}

export const searchInput: CSSProperties = {
  width: '100%',
  padding: '11px 15px 11px 40px',
  borderRadius: 'var(--radius-md)',
  border: '1.5px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  fontFamily: 'inherit',
}

export const emptyState: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 80,
  color: 'var(--color-text-secondary)',
}

export const summaryGrid = (cols = 4): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: 12,
  marginBottom: 24,
})

export const summaryItem: CSSProperties = {
  padding: '18px 20px',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  transition: 'all 0.2s',
}

export const formatMoney = (val?: number) => {
  if (!val) return "0 so'm"
  return val.toLocaleString('uz-UZ') + " so'm"
}

export const formatAmount = (val?: number) => {
  if (!val) return '0'
  return val.toLocaleString('uz-UZ')
}

export const parseFormattedAmount = (text: string) => {
  return Number(text.replace(/[^\d]/g, '')) || 0
}

export const formatInputAmount = (text: string) => {
  const digits = text.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('uz-UZ')
}
