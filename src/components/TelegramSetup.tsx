import { useState } from 'react'
import { t } from '../i18n'
import { authApi } from '../api/client'
import { useAuthStore } from '../store/authStore'

export function TelegramSetup() {
  const user = useAuthStore(s => s.user)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  if (!user || user.scope === 'procurement' || user.telegramId) return null
  const check = async () => {
    if (checking) return
    setChecking(true)
    setMessage('')
    const owner = user._id
    try {
      const { data } = await authApi.getMe()
      if (useAuthStore.getState().user?._id !== owner) return
      useAuthStore.getState().setUser(data)
      if (!data.telegramId) setMessage(t('telegramSetupPending'))
    } catch { if (useAuthStore.getState().user?._id === owner) setMessage(t('telegramSetupError')) }
    finally { setChecking(false) }
  }
  return (
    <section aria-label="Telegramni ulash" style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-primary-soft)', flexShrink: 0 }}>
      <strong>{t('telegramSetupTitle')}</strong>
      <p style={{ margin: '6px 0', fontSize: 13, lineHeight: 1.6 }}>{t('telegramSetupSteps', { phone: user.phone_number ?? '' })}</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <a href="https://t.me/hisvex_bot?start=link" target="_blank" rel="noopener noreferrer" onClick={event => {
          if (window.electronAPI?.openExternal) {
            event.preventDefault()
            void window.electronAPI.openExternal('https://t.me/hisvex_bot?start=link').catch(() => setMessage(t('registrationPhoneOpenError')))
          }
        }} style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{t('telegramSetupOpen')}</a>
        <button type="button" onClick={() => { void check() }} disabled={checking} style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>{checking ? t('telegramSetupChecking') : t('telegramSetupCheck')}</button>
      </div>
      {message && <p role="status" style={{ margin: '8px 0 0', fontSize: 13 }}>{message}</p>}
    </section>
  )
}
