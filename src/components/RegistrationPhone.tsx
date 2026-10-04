import { useState } from 'react'

import { t } from '../i18n'
import { TelegramIcon } from './TelegramIcon'
import { useRegistrationPhone, type VerifiedRegistrationPhone } from '../utils/useRegistrationPhone'

export function RegistrationPhone({ onVerified }: { onVerified: (value: VerifiedRegistrationPhone | null) => void }) {
  const flow = useRegistrationPhone(onVerified)
  const [openError, setOpenError] = useState('')
  const button = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px', borderRadius: 9, background: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', textAlign: 'center' as const, fontWeight: 600, fontSize: 14, textDecoration: 'none', cursor: 'pointer', boxSizing: 'border-box' as const }
  return <div aria-live="polite">
    {flow.phone ? <div style={{ padding: 12, borderRadius: 9, border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }}>✓ +{flow.phone} — {t('registrationPhoneVerified')}</div>
      : flow.challenge ? <a href={flow.challenge.botUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => {
        setOpenError('')
        flow.wait()
        if (window.electronAPI?.openExternal) {
          event.preventDefault()
          void window.electronAPI.openExternal(flow.challenge!.botUrl).then(opened => {
            if (!opened) setOpenError(t('registrationPhoneOpenError'))
          }).catch(() => setOpenError(t('registrationPhoneOpenError')))
        }
      }} style={button}><TelegramIcon />{t(flow.waiting ? 'registrationPhoneReopen' : 'registrationPhoneOpen')}</a>
      : <button type="button" disabled={flow.loading} onClick={() => void flow.prepare()} style={button}><TelegramIcon />{t(flow.loading ? 'loading' : 'registrationPhoneRetry')}</button>}
    {!flow.phone && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '8px 0 0' }}>{t(flow.waiting ? 'registrationPhoneWaiting' : 'registrationPhoneHelp')}</p>}
    {flow.challenge && (flow.waiting || flow.phone) && <button type="button" onClick={() => void flow.prepare()} style={{ background: 'none', border: 0, padding: '8px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>{t('registrationPhoneReset')}</button>}
    {(flow.error || openError) && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 12 }}>{flow.error || openError}</p>}
  </div>
}
