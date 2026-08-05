import { useState } from 'react'
import { authApi } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { t } from '../i18n'
import { formatPhone } from '../utils/formatters'

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1.5px solid',
  borderColor: focused ? '#7c3aed' : 'rgba(124,58,237,0.2)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.2s',
  fontFamily: 'inherit',
})

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'rgba(167,139,250,0.65)',
  marginBottom: 6,
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#070512',
      padding: 32,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background gradients */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(180deg, #070512 0%, #0F0A2E 30%, #0C0820 65%, #070512 100%)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
        top: '-200px', right: '-200px', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%)',
        bottom: '-150px', left: '-150px', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', width: 720, height: 720, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.07) 0%, rgba(124,58,237,0.02) 55%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0,
      }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 88, height: 88, borderRadius: 22,
            overflow: 'hidden', margin: '0 auto 22px',
            boxShadow: '0 12px 40px rgba(124,58,237,0.35)',
          }}>
            <img
              src="./Hisvex.png" alt="Hisvex"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1 style={{
            margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2,
            background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 60%, #6D28D9 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Hisvex
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'rgba(167,139,250,0.65)', letterSpacing: 0.4 }}>
            {phoneVerifyStep
              ? t('verifyPhone')
              : isLoginMode ? t('signInToSystem') : t('createAccount')}
          </p>
        </div>

        <div style={{
          borderRadius: 20,
          border: '1px solid rgba(167,139,250,0.15)',
          background: 'rgba(255,255,255,0.03)',
          padding: 24,
        }}>
          {phoneVerifyStep ? (
            <form onSubmit={(e) => { e.preventDefault(); handlePhoneVerify() }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error ? (
                <div style={{
                  borderRadius: 10, padding: 12,
                  border: '1px solid rgba(239,68,68,0.25)',
                  background: 'rgba(239,68,68,0.1)',
                }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, textAlign: 'center', color: '#EF4444' }}>
                    {error}
                  </p>
                </div>
              ) : (
                <div style={{
                  borderRadius: 10, padding: 12,
                  border: '1px solid #7c3aed',
                  background: 'rgba(124,58,237,0.12)',
                }}>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#A78BFA' }}>
                    {t('sessionActiveTitle')}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(167,139,250,0.65)', lineHeight: 1.5 }}>
                    {t('sessionActiveMessage')}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
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
                  style={inputStyle(focusedField === 'verifyPhone')}
                  placeholder="+998 90 123 45 67"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: 16, borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1, marginTop: 4,
                  boxShadow: loading ? 'none' : '0 4px 20px rgba(124,58,237,0.3)',
                  transition: 'opacity 0.2s, box-shadow 0.2s',
                }}
              >
                {loading ? t('loading') : t('verifyPhone')}
              </button>

              <button
                type="button"
                onClick={() => { setPhoneVerifyStep(false); setError('') }}
                disabled={loading}
                style={{
                  width: '100%', padding: 14, borderRadius: 10,
                  border: '1px solid rgba(167,139,250,0.15)',
                  background: 'none', color: 'rgba(167,139,250,0.65)',
                  fontSize: 15, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {t('cancel')}
              </button>
            </form>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    paddingBottom: 8, border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: isLoginMode ? '2px solid #7c3aed' : '2px solid transparent',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <span style={{
                    fontSize: 16, fontWeight: isLoginMode ? 700 : 600,
                    color: isLoginMode ? '#7c3aed' : 'rgba(167,139,250,0.3)',
                    transition: 'color 0.2s',
                  }}>{t('signIn')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  style={{
                    paddingBottom: 8, border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: !isLoginMode ? '2px solid #7c3aed' : '2px solid transparent',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <span style={{
                    fontSize: 16, fontWeight: !isLoginMode ? 700 : 600,
                    color: !isLoginMode ? '#7c3aed' : 'rgba(167,139,250,0.3)',
                    transition: 'color 0.2s',
                  }}>{t('signUp')}</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && (
                  <div style={{
                    borderRadius: 10, padding: 12,
                    border: '1px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.1)',
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, textAlign: 'center', color: '#EF4444' }}>
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
                    style={inputStyle(focusedField === 'username')}
                    placeholder={t('loginPlaceholder')}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                <div>
                  <label style={labelStyle}>{t('password')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    style={inputStyle(focusedField === 'password')}
                    placeholder={t('passwordPlaceholder')}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                {!isLoginMode && (
                  <>
                    <div>
                      <label style={labelStyle}>{t('confirmPassword')}</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onFocus={() => setFocusedField('confirm')}
                        onBlur={() => setFocusedField(null)}
                        style={inputStyle(focusedField === 'confirm')}
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
                        style={inputStyle(focusedField === 'phone')}
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
                            color: '#A78BFA', fontSize: 13, fontWeight: 700,
                            lineHeight: '18px', padding: 0, cursor: 'pointer',
                          }}
                        >
                          ?
                        </button>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={businessDayStartHour}
                        onChange={(e) => setBusinessDayStartHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
                        onFocus={() => setFocusedField('businessHour')}
                        onBlur={() => setFocusedField(null)}
                        style={inputStyle(focusedField === 'businessHour')}
                        placeholder={t('businessDayStartHourPlaceholder')}
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', padding: 16, borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1, marginTop: 4,
                    boxShadow: loading ? 'none' : '0 4px 20px rgba(124,58,237,0.3)',
                    transition: 'opacity 0.2s, box-shadow 0.2s',
                  }}
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
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(167,139,250,0.3)' }}>
                {isLoginMode ? t('noAccountSwitch') : t('haveAccountSwitch')}
              </p>
              <button
                type="button"
                onClick={() => switchMode(isLoginMode ? 'register' : 'login')}
                style={{
                  background: 'none', border: 'none', color: '#7c3aed',
                  cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: 0,
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
            <span style={{ fontSize: 13, color: 'rgba(167,139,250,0.65)' }}>{t('contactAdminLink')}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#A78BFA' }}>{t('contactAdminTelegram')}</span>
          </button>
        </div>
      </div>

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
              borderRadius: 20,
              border: '1px solid rgba(167,139,250,0.15)',
              background: '#0F0A2E',
              padding: 24,
            }}
          >
            <p style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#A78BFA' }}>
              {t('businessDayStartHelpTitle')}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {t('businessDayStartHelpBody')}
            </p>
            <button
              type="button"
              onClick={() => setShowBusinessDayHelp(false)}
              style={{
                width: '100%', marginTop: 20, padding: 14, borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
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
