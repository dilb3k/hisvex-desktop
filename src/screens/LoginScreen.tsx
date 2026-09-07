import { useState } from 'react'
import { authApi } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { t } from '../i18n'
import { PasswordInput } from '../components/PasswordInput'
import { formatPhone } from '../utils/formatters'

// Every value here is a theme token, not a literal — matches hisvex-web's
// login page exactly (both used to carry their own fixed violet-dark
// palette, which is why this screen looked like a different product from
// the rest of the desktop app, and from web, and stayed dark even when the
// light theme was picked).
const C = {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  primarySoft: 'var(--color-primary-soft)',
  border: 'var(--color-border)',
  borderFocus: 'var(--color-primary)',
  text: 'var(--color-text)',
  textSecondary: 'var(--color-text-secondary)',
  textTertiary: 'var(--color-text-tertiary)',
  danger: 'var(--color-danger)',
  dangerBg: 'var(--color-danger-soft)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 600,
  color: C.textSecondary,
  marginBottom: 5,
  marginLeft: 2,
}

export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('+998')
  const [businessDayStartHour, setBusinessDayStartHour] = useState('')
  const [showBusinessDayHelp, setShowBusinessDayHelp] = useState(false)
  const [phoneVerifyStep, setPhoneVerifyStep] = useState(false)
  const [maskedPhone, setMaskedPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const setAuth = useAuthStore((s) => s.setAuth)
  const isLoginMode = mode === 'login'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError(t('enterLoginPassword'))
      return
    }

    if (!isLoginMode) {
      if (password !== confirmPassword) {
        setError(t('passwordsDoNotMatch'))
        return
      }
      if (password.length < 6) {
        setError(t('passwordTooShort'))
        return
      }
      const hour = Number(businessDayStartHour.trim())
      if (!businessDayStartHour.trim() || !Number.isInteger(hour) || hour < 0 || hour > 23) {
        setError(t('businessDayStartRequired'))
        return
      }
    }

    setLoading(true)
    try {
      if (isLoginMode) {
        const { data } = await authApi.login(username.trim(), password)

        if (data && 'needsPhoneVerification' in data) {
          setMaskedPhone(data.maskedPhone)
          setPhoneVerifyStep(true)
          return
        }

        setAuth(data.token, data.refreshToken, data.user)
      } else {
        const { data } = await authApi.register(
          username.trim(),
          password,
          phoneNumber.replace(/\D/g, '') || undefined,
          Number(businessDayStartHour.trim()),
        )
        setAuth(data.token, data.refreshToken, data.user)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (isLoginMode ? t('loginError') : t('registerError'))
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneVerify = async () => {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits.length < 6) {
      setError(t('phoneRequired'))
      return
    }

    setLoading(true)
    setError('')
    try {
      const { data } = await authApi.loginWithPhone(username.trim(), password, digits)
      setPhoneVerifyStep(false)
      setError(t('sessionTakenOver'))
      setAuth(data.token, data.refreshToken, data.user)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('phoneRequired')
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const openAdminContact = () => {
    window.open('https://t.me/dilbek7011', '_blank')
  }

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    setPhoneVerifyStep(false)
    setError('')
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    padding: '10px 12px',
    borderRadius: 9,
    border: '1.5px solid',
    borderColor: focusedField === field ? C.borderFocus : C.border,
    background: C.surface,
    color: C.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  })

  return (
    <div className="login-split">
      {/* Brand panel. Hidden below 900px rather than stacked above the form:
          on a narrow window it would push the actual inputs off the first
          screen, and the whole point of the panel is space a narrow layout
          doesn't have. The compact lockup inside the form column covers
          that case. */}
      <aside className="login-brand">
        {/* Ambient light, kept off the edges so no glow ends on a hard arc. */}
        <div style={{
          position: 'absolute', width: 620, height: 620, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 70%)',
          top: '-240px', right: '-180px', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', width: 520, height: 520, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)',
          bottom: '-200px', left: '-160px', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
          {/* The mark sits on the form's own surface color rather than
              straight on the violet: the artwork is itself a violet tile,
              so against the panel it read as a washed-out box with a
              visible edge — a contrasting plate makes it deliberate. */}
          <div style={{
            width: 92, height: 92, borderRadius: 24,
            marginBottom: 30, boxShadow: '0 14px 40px rgba(0,0,0,0.30)',
            background: C.surface, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src="./hisvex-logo.png" alt="Hisvex"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>

          <h1 style={{
            margin: 0, display: 'flex',
            fontSize: 48, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1,
          }}>
            <span style={{ color: '#DDD1FE' }}>His</span>
            <span style={{ color: '#FFFFFF' }}>vex</span>
          </h1>

          <p style={{
            margin: '18px 0 0', fontSize: 18, lineHeight: 1.55,
            color: 'rgba(255,255,255,0.82)', fontWeight: 500,
          }}>
            {t('splashTagline')}
          </p>

          <div style={{
            width: 52, height: 3, borderRadius: 3, marginTop: 30,
            background: 'rgba(255,255,255,0.32)',
          }} />
        </div>
      </aside>

      {/* Form column. Owns the page background and the scroll, so a long
          register form scrolls without dragging the brand panel with it. */}
      <main className="login-form-col">
        <div style={{ width: '100%', maxWidth: 360, position: 'relative', zIndex: 1 }}>
          <div className="login-compact-head" style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 68, height: 68, borderRadius: 18,
              margin: '0 auto 14px',
              boxShadow: '0 8px 26px rgba(124,58,237,0.22)',
              background: C.surface, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img
                src="./hisvex-logo.png" alt="Hisvex"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2,
              display: 'flex', justifyContent: 'center',
            }}>
              <span style={{ color: C.primary }}>His</span>
              <span style={{ color: C.text }}>vex</span>
            </h1>
          </div>

          {/* Outside the compact lockup: the wide layout drops the logo and
              wordmark (the panel already carries them) but still needs to say
              which form this is. */}
          <p style={{
            margin: '0 0 24px', fontSize: 14, color: C.textSecondary,
            letterSpacing: 0.3, textAlign: 'center',
          }}>
            {phoneVerifyStep
              ? t('verifyPhone')
              : isLoginMode ? t('signInToSystem') : t('createAccount')}
          </p>

          <div style={{
            borderRadius: 16, border: `1px solid ${C.border}`,
            background: C.surface, padding: 20,
          }}>
            {phoneVerifyStep ? (
              <form onSubmit={(e) => { e.preventDefault(); handlePhoneVerify() }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error ? (
                  <div style={{
                    borderRadius: 10, padding: 12,
                    border: `1px solid ${C.danger}`,
                    background: C.dangerBg,
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, textAlign: 'center', color: C.danger }}>
                      {error}
                    </p>
                  </div>
                ) : (
                  <div style={{
                    borderRadius: 10, padding: 12,
                    border: `1px solid ${C.primary}`,
                    background: C.primarySoft,
                  }}>
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: C.primary }}>
                      {t('sessionActiveTitle')}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>
                      {t('sessionActiveMessage')}
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: C.text }}>
                      {t('maskedPhoneHint').replace('{phone}', maskedPhone)}
                    </p>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>{t('phoneNumber')}</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                    onFocus={() => setFocusedField('verifyPhone')}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle('verifyPhone')}
                    placeholder="+998 90 123 45 67"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 9, border: 'none',
                    background: C.primary, color: '#fff',
                    fontSize: 14, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1, marginTop: 4,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = C.primaryHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = C.primary }}
                >
                  {loading ? t('loading') : t('verifyPhone')}
                </button>

                <button
                  type="button"
                  onClick={() => { setPhoneVerifyStep(false); setError('') }}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '11px 16px', borderRadius: 9,
                    border: `1px solid ${C.border}`, background: 'none',
                    color: C.textSecondary, fontSize: 14, fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {t('cancel')}
                </button>
              </form>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 20, marginBottom: 18 }}>
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    style={{
                      paddingBottom: 8, border: 'none', background: 'none', cursor: 'pointer',
                      borderBottom: isLoginMode ? `2px solid ${C.primary}` : '2px solid transparent',
                    }}
                  >
                    <span style={{
                      fontSize: 14.5, fontWeight: isLoginMode ? 700 : 600,
                      color: isLoginMode ? C.primary : C.textTertiary,
                    }}>{t('signIn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    style={{
                      paddingBottom: 8, border: 'none', background: 'none', cursor: 'pointer',
                      borderBottom: !isLoginMode ? `2px solid ${C.primary}` : '2px solid transparent',
                    }}
                  >
                    <span style={{
                      fontSize: 14.5, fontWeight: !isLoginMode ? 700 : 600,
                      color: !isLoginMode ? C.primary : C.textTertiary,
                    }}>{t('signUp')}</span>
                  </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {error && (
                    <div style={{
                      borderRadius: 10, padding: 12,
                      border: `1px solid ${C.danger}`,
                      background: C.dangerBg,
                    }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, textAlign: 'center', color: C.danger }}>
                        {error}
                      </p>
                    </div>
                  )}

                  <div>
                    <label style={labelStyle}>{t('loginLabel')}</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle('username')}
                      placeholder={t('loginPlaceholder')}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>{t('password')}</label>
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={inputStyle('password')}
                      placeholder={t('passwordPlaceholder')}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>

                  {!isLoginMode && (
                    <>
                      <div>
                        <label style={labelStyle}>{t('confirmPassword')}</label>
                        <PasswordInput
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          onFocus={() => setFocusedField('confirm')}
                          onBlur={() => setFocusedField(null)}
                          style={inputStyle('confirm')}
                          placeholder={t('confirmPasswordPlaceholder')}
                          autoCapitalize="none"
                          autoCorrect="off"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>{t('phoneNumber')}</label>
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                          onFocus={() => setFocusedField('phone')}
                          onBlur={() => setFocusedField(null)}
                          style={inputStyle('phone')}
                          placeholder={t('phoneNumberPlaceholder')}
                          autoCapitalize="none"
                          autoCorrect="off"
                        />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginLeft: 2 }}>
                          <label style={{ ...labelStyle, marginBottom: 0 }}>{t('businessDayStartHour')}</label>
                          <button
                            type="button"
                            onClick={() => setShowBusinessDayHelp(true)}
                            title={t('whatIsThis')}
                            style={{
                              width: 20, height: 20, borderRadius: '50%',
                              border: '1px solid rgba(124,58,237,0.35)',
                              background: 'rgba(124,58,237,0.12)',
                              color: C.primary, fontSize: 13, fontWeight: 700,
                              lineHeight: '18px', padding: 0, cursor: 'pointer',
                            }}
                          >
                            ?
                          </button>
                        </div>
                        {/* Hour must be selected from a dropdown, not typed —
                            the previous react-datepicker customInput was declared
                            inline inside this component, so it got recreated (and
                            remounted, losing focus) on every render. */}
                        <select
                          value={businessDayStartHour}
                          onChange={(e) => setBusinessDayStartHour(e.target.value)}
                          onFocus={() => setFocusedField('businessHour')}
                          onBlur={() => setFocusedField(null)}
                          style={{ ...inputStyle('businessHour'), cursor: 'pointer' }}
                        >
                          {/* Options get explicit opaque colors, not the select's
                              translucent theme colors: the native popup list
                              (esp. on Windows) renders its own solid background
                              and ignores inherited alpha, which left translucent
                              text unreadable on the OS's white dropdown. */}
                          <option value="" disabled style={{ background: C.surface, color: C.text }}>
                            {t('businessDayStartHourPlaceholder')}
                          </option>
                          {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                            <option
                              key={h}
                              value={h}
                              style={{ background: C.surface, color: C.text }}
                            >
                              {String(h).padStart(2, '0')}:00
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: 9, border: 'none',
                      background: C.primary, color: '#fff',
                      fontSize: 15, fontWeight: 700,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.7 : 1, marginTop: 4,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = C.primaryHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = C.primary }}
                  >
                    {loading ? t('loading') : isLoginMode ? t('signIn') : t('signUp')}
                  </button>
                </form>
              </>
            )}
          </div>

          <div style={{ marginTop: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {!phoneVerifyStep && (
              <>
                <p style={{ margin: 0, fontSize: 13, color: C.textTertiary }}>
                  {isLoginMode ? t('noAccountSwitch') : t('haveAccountSwitch')}
                </p>
                <button
                  type="button"
                  onClick={() => switchMode(isLoginMode ? 'register' : 'login')}
                  style={{
                    background: 'none', border: 'none', color: C.primary,
                    cursor: 'pointer', fontSize: 13.5, fontWeight: 700, padding: 0,
                  }}
                >
                  {isLoginMode ? t('signUpHere') : t('signInHere')}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openAdminContact}
              style={{
                marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 8,
              }}
            >
              <span style={{ fontSize: 13, color: C.textSecondary }}>{t('contactAdminLink')}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.primary }}>{t('contactAdminTelegram')}</span>
            </button>
          </div>
        </div>
      </main>

      {showBusinessDayHelp && (
        <div
          onClick={() => setShowBusinessDayHelp(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              borderRadius: 16,
              border: `1px solid ${C.border}`,
              background: C.surface,
              padding: 22,
            }}
          >
            <p style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: C.primary }}>
              {t('businessDayStartHelpTitle')}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {t('businessDayStartHelpBody')}
            </p>
            <button
              type="button"
              onClick={() => setShowBusinessDayHelp(false)}
              style={{
                width: '100%', marginTop: 18, padding: '11px 16px', borderRadius: 9, border: 'none',
                background: C.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {t('gotIt')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
