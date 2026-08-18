import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { authApi, adminsApi } from '../api/client'
import { t, getLanguage, setLanguage } from '../i18n'
import type { Language } from '../i18n'
import type { User } from '../types'
import {
  UserIcon,
  Users,
  Shield,
  Lock,
  Globe,
  Sun,
  Moon,
  MessageCircle,
  Info,
  LogOut,
  ChevronRight,
  Clock,
  X,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import {
  getBusinessDayStartHour,
  getPendingBusinessDayStartHour,
  getEffectiveFrom,
  scheduleBusinessDayStartHour,
} from '../utils/businessDay'
import { isBlockCodeDisabled, setBlockCodeDisabled } from '../utils/blockCode'
import dayjs from 'dayjs'

const THEMES = [
  { code: 'light', labelKey: 'light', icon: Sun },
  { code: 'dark', labelKey: 'dark', icon: Moon },
] as const

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'uz', label: "O'zbek" },
  { code: 'ru', label: 'Русский' },
]

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 18px',
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  transition: 'all 0.15s',
  userSelect: 'none',
};

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  marginBottom: 8,
}

export function SettingsScreen() {
  const { user, logout } = useAuthStore()

  const curLang = getLanguage()
  const [language, setLangState] = useState<Language>(curLang)
  const [theme, setThemeState] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'dark'
  })
  const [showBusinessDay, setShowBusinessDay] = useState(false)
  const [showTariffs, setShowTariffs] = useState(false)
  const [editingHour, setEditingHour] = useState(getBusinessDayStartHour())

  const [showBlockModal, setShowBlockModal] = useState(false)
  const [pinStep, setPinStep] = useState(0)
  const [pinInputs, setPinInputs] = useState<string[]>(['', '', ''])
  const [pinError, setPinError] = useState<string | null>(null)
  const [isBlockBusy, setIsBlockBusy] = useState(false)
  const [blockDisabled, setBlockDisabled] = useState(isBlockCodeDisabled)
  const blockInputRef = useRef<HTMLInputElement | null>(null)
  const showToast = useAppStore((s) => s.showToast)

  const [admins, setAdmins] = useState<User[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [togglingAdminId, setTogglingAdminId] = useState<string | null>(null)

  useEffect(() => {
    if (user?.role !== 'superAdmin') return
    let cancelled = false
    ;(async () => {
      setAdminsLoading(true)
      try {
        const { data } = await adminsApi.getAll()
        if (!cancelled) setAdmins(data)
      } catch (err) {
        if (!cancelled) showToast(err instanceof Error ? err.message : t('error'), 'error')
      } finally {
        if (!cancelled) setAdminsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.role, showToast, t])

  const handleToggleAdmin = useCallback(async (admin: User) => {
    if (togglingAdminId) return
    setTogglingAdminId(admin._id)
    const next = admin.isActive === false
    try {
      await adminsApi.update(admin._id, { isActive: next })
      setAdmins((prev) => prev.map((a) => (a._id === admin._id ? { ...a, isActive: next } : a)))
      showToast(next ? t('adminActivated') : t('adminDeactivated'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setTogglingAdminId(null)
    }
  }, [togglingAdminId, showToast, t])

  const blockCode = user?.blockCode ?? null

  const userTier = user?.tier ?? 'tekin'
  const pendingHour = getPendingBusinessDayStartHour()

  const handleSetTheme = useCallback((code: string) => {
    setThemeState(code)
    document.documentElement.setAttribute('data-theme', code)
    try { localStorage.setItem('hisvex_theme', code) } catch {}
    // Keep the main process (native window chrome, nativeTheme.themeSource)
    // in sync with the in-app choice.
    try { void window.electronAPI?.setTheme?.(code) } catch {}
  }, [])

  const handleSetLanguage = useCallback((code: Language) => {
    setLangState(code)
    setLanguage(code)
    try { localStorage.setItem('hisvex_language', code) } catch {}
  }, [])

  const openBusinessDay = useCallback(() => {
    setEditingHour(getBusinessDayStartHour())
    setShowBusinessDay(true)
  }, [])

  const handleSaveBusinessDay = useCallback(() => {
    scheduleBusinessDayStartHour(editingHour)
    setShowBusinessDay(false)
    authApi.updateMe({ businessDayStartHour: editingHour }).catch((err: unknown) => {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    })
  }, [editingHour, showToast])

  const focusBlockInput = useCallback(() => {
    setTimeout(() => blockInputRef.current?.focus(), 60)
  }, [])

  const openBlockModal = useCallback(() => {
    setPinStep(0)
    setPinInputs(['', '', ''])
    setPinError(null)
    setShowBlockModal(true)
    focusBlockInput()
  }, [focusBlockInput])

  const persistBlockCode = useCallback(async (code: string | null) => {
    try {
      if (code) await window.electronAPI?.blockSet?.(code)
      else await window.electronAPI?.blockClear?.()
    } catch {
      // OS safeStorage mavjud emas — shunchaki xotirada qoladi
    }
    const u = useAuthStore.getState().user
    if (u) useAuthStore.getState().setUser({ ...u, blockCode: code })
  }, [])

  const blockSteps = blockCode
    ? [t('blockCodeCurrent'), t('blockCodeNew'), t('blockCodeConfirm')]
    : [t('blockCodeSet'), t('blockCodeConfirm')]

  const curPin = pinInputs[pinStep] ?? ''
  const isLastStep = pinStep === blockSteps.length - 1

  const handleStepAction = useCallback(async (step: number, inputs: string[]) => {
    const value = inputs[step] ?? ''
    if (value.length !== 4 || !/^\d{4}$/.test(value)) return
    const isLast = step === (blockCode ? 3 : 2) - 1

    if (blockCode && step === 0 && value !== blockCode) {
      setPinError(t('blockCodeWrong'))
      setPinInputs((prev) => { const n = [...prev]; n[0] = ''; return n })
      focusBlockInput()
      return
    }

    if (isLast) {
      const a = inputs[0] ?? ''
      const b = inputs[1] ?? ''
      const c = inputs[2] ?? ''
      if (blockCode) {
        if (b !== c) {
          setPinError(t('blockCodeMismatch'))
          setPinInputs((prev) => { const n = [...prev]; n[2] = ''; return n })
          focusBlockInput()
          return
        }
      } else {
        if (a !== b) {
          setPinError(t('blockCodeMismatch'))
          setPinInputs((prev) => { const n = [...prev]; n[1] = ''; return n })
          focusBlockInput()
          return
        }
      }
      const newCode = blockCode ? b : a
      setIsBlockBusy(true)
      try {
        await authApi.updateMe({ blockCode: newCode } as never)
        await persistBlockCode(newCode)
        setShowBlockModal(false)
        showToast(t('blockCodeSaved'), 'success')
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : t('error'), 'error')
      } finally {
        setIsBlockBusy(false)
      }
      return
    }

    setPinError(null)
    setPinStep(step + 1)
    focusBlockInput()
  }, [blockCode, showToast, persistBlockCode, focusBlockInput])

  const toggleBlockDisabled = useCallback(() => {
    // Same PIN check as handleRemoveBlock below — disabling protection must
    // require proof of the current code, otherwise anyone at the PC could
    // turn the block off with zero verification while removing it correctly
    // demands the PIN.
    const value = pinInputs[0] ?? ''
    if (value !== blockCode) {
      setPinError(t('blockCodeWrong'))
      setPinInputs((prev) => { const n = [...prev]; n[0] = ''; return n })
      focusBlockInput()
      return
    }
    setBlockDisabled((prev) => {
      const next = !prev
      setBlockCodeDisabled(next)
      showToast(next ? t('blockCodeTemporaryOffSaved') : t('blockCodeTemporaryOnSaved'), 'success')
      return next
    })
  }, [pinInputs, blockCode, showToast, focusBlockInput])

  const handleRemoveBlock = useCallback(async () => {
    const value = pinInputs[0] ?? ''
    if (value !== blockCode) {
      setPinError(t('blockCodeWrong'))
      setPinInputs((prev) => { const n = [...prev]; n[0] = ''; return n })
      focusBlockInput()
      return
    }
    setIsBlockBusy(true)
    try {
      await authApi.updateMe({ blockCode: null } as never)
      await persistBlockCode(null)
      setShowBlockModal(false)
      showToast(t('blockCodeRemoved'), 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setIsBlockBusy(false)
    }
  }, [pinInputs, blockCode, showToast, persistBlockCode, focusBlockInput])

  const formatHourRange = (hour: number) => {
    if (hour === 0) return '00:00 dan 23:59 gacha'
    return `${String(hour).padStart(2, '0')}:00 dan ${String(hour - 1).padStart(2, '0')}:59 gacha`
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'pro': return 'var(--color-primary)'
      case 'bor': return 'var(--color-success)'
      default: return 'var(--color-text-secondary)'
    }
  }

  const getTierBg = (tier: string) => {
    switch (tier) {
      case 'pro': return 'var(--color-primary-soft)'
      case 'bor': return 'rgba(34,197,94,0.12)'
      default: return 'rgba(145,149,166,0.12)'
    }
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
  }

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }

  const handleLogout = useCallback(() => {
    logout()
    window.location.hash = '#/login'
  }, [logout])

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 40 }}>
      {/* User Info */}
      {user && (
        <div style={sectionStyle}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                background: 'var(--color-primary-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <UserIcon size={24} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{user.username}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {user.role === 'superAdmin' ? t('superAdmin') : t('admin')}
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Card */}
          <div
            onClick={() => setShowTariffs(true)}
            style={{
              ...cardStyle,
              borderColor: `${getTierColor(userTier)}40`,
              background: userTier === 'pro'
                ? 'var(--color-primary-soft)'
                : userTier === 'bor'
                  ? 'rgba(34,197,94,0.06)'
                  : 'var(--color-surface)',
              cursor: 'pointer',
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 12px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                background: getTierBg(userTier),
                color: getTierColor(userTier),
              }}>
                {userTier === 'pro' ? t('planPro') : userTier === 'bor' ? t('planBor') : t('planFree')}
              </span>
              <ChevronRight size={18} style={{ color: 'var(--color-text-secondary)' }} />
            </div>
            {user?.subscriptionEndDate ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                {t('subscriptionEndDate')}: {new Date(user.subscriptionEndDate).toLocaleDateString()}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* User Management (superadmin) */}
      {user?.role === 'superAdmin' && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <Users size={16} />
            {t('usersTitle')}
          </div>
          {adminsLoading ? (
            <div style={{ ...cardStyle, display: 'flex', justifyContent: 'center', padding: 24 }}>
              <span style={{
                width: 18, height: 18,
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : (
            admins.map((admin) => {
              const isInactive = admin.isActive === false
              const isSelf = admin._id === user._id
              return (
                <div key={admin._id} style={{
                  ...cardStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  opacity: isInactive ? 0.72 : 1,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 20, flexShrink: 0,
                    background: isInactive
                      ? 'rgba(107,114,128,0.18)'
                      : 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 15, fontWeight: 800,
                  }}>
                    {admin.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                      fontSize: 14, fontWeight: 700, color: 'var(--color-text)',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {admin.username}
                      </span>
                      {admin.role === 'superAdmin' && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '1px 8px', borderRadius: 6,
                          fontSize: 11, fontWeight: 600,
                          background: 'rgba(139,92,246,0.14)', color: '#8B5CF6',
                          border: '1px solid rgba(139,92,246,0.3)',
                        }}>
                          <Shield size={11} />
                          {t('superAdmin')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {isInactive ? t('inactive') : t('active')}
                    </div>
                  </div>
                  {!isSelf && (
                    <button
                      onClick={() => handleToggleAdmin(admin)}
                      disabled={togglingAdminId === admin._id}
                      style={{
                        flexShrink: 0, padding: '8px 14px', borderRadius: 10,
                        border: isInactive ? 'none' : '1.5px solid rgba(239,68,68,0.4)',
                        background: isInactive
                          ? 'linear-gradient(135deg, #10B981, #34D399)'
                          : 'rgba(239,68,68,0.08)',
                        color: isInactive ? '#fff' : 'var(--color-danger)',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        opacity: togglingAdminId === admin._id ? 0.55 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {isInactive ? t('unblockUser') : t('blockUser')}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Language */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Globe size={16} />
          {t('language')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {LANGUAGES.map(lang => {
            const selected = language === lang.code
            return (
              <button
                key={lang.code}
                onClick={() => handleSetLanguage(lang.code)}
                style={{
                  ...pillStyle,
                  background: selected ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                  borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                  color: selected ? 'var(--color-primary)' : 'var(--color-text)',
                  fontWeight: selected ? 700 : 600,
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-surface)' }}
              >
                {lang.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Theme */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          {t('theme')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {THEMES.map(item => {
            const selected = theme === item.code
            const Icon = item.icon
            return (
              <button
                key={item.code}
                onClick={() => handleSetTheme(item.code)}
                style={{
                  ...pillStyle,
                  background: selected ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                  borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                  color: selected ? 'var(--color-primary)' : 'var(--color-text)',
                  fontWeight: selected ? 700 : 600,
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-surface)' }}
              >
                <Icon size={18} />
                {item.code === 'light' ? t('light') : t('dark')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Business Day Hour */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Clock size={16} />
          {t('businessDayHour')}
        </div>
        <button
          onClick={openBusinessDay}
          style={{
            ...cardStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{t('businessDayHour')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>
              {String(getBusinessDayStartHour()).padStart(2, '0')}:00
            </span>
            <ChevronRight size={18} style={{ color: 'var(--color-text-secondary)' }} />
          </span>
        </button>
      </div>

      {/* Support */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <MessageCircle size={16} />
          {t('support')}
        </div>
        <a
          href="https://t.me/dilbek7011"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...cardStyle,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
        >
          <MessageCircle size={20} color="#0088cc" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0088cc' }}>Telegram: @dilbek7011</span>
        </a>
      </div>

      {/* Logout */}
      <div style={sectionStyle}>
        <button
          onClick={handleLogout}
          style={{
            ...cardStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            cursor: 'pointer',
            color: 'var(--color-danger)',
            fontWeight: 700,
            fontSize: 14,
            background: 'rgba(239,68,68,0.08)',
            borderColor: 'rgba(239,68,68,0.3)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.16)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
        >
          <LogOut size={20} />
          {t('logout')}
        </button>
      </div>

      {/* Subscription Modal */}
      {showTariffs && (
        <div onClick={() => setShowTariffs(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: 420,
            background: 'var(--color-surface)', borderRadius: 16,
            border: '1px solid var(--color-border)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{t('subscriptionDetails')}</h3>
              <button
                onClick={() => setShowTariffs(false)}
                title={t('close')}
                aria-label={t('close')}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              ><X size={20} /></button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Current Plan */}
              {user && (
                <div style={{
                  padding: 12, borderRadius: 10,
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    {t('currentPlan')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      fontSize: 15, fontWeight: 700,
                      color: userTier === 'pro' ? '#7C3AED' : userTier === 'bor' ? '#10B981' : 'var(--color-text-secondary)',
                    }}>
                      {userTier === 'pro' ? t('planPro') : userTier === 'bor' ? t('planBor') : t('planFree')}
                    </span>
                    {user?.subscriptionEndDate ? (
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        {t('subscriptionEndDate')}: {new Date(user.subscriptionEndDate).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Plan Cards: Bor & Pro */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    key: 'bor', label: t('planBor'), price: t('planBorPrice'),
                    color: '#10B981', bg: 'rgba(16,185,129,0.08)',
                    features: ['Ombor hisobi', 'Statistika', 'Savdo', '100 tagacha mahsulot'],
                  },
                  {
                    key: 'pro', label: t('planPro'), price: t('planProPrice'),
                    color: '#7C3AED', bg: 'rgba(124,58,237,0.08)',
                    features: ['Ombor hisobi', 'Statistika', 'Savdo', 'Cheksiz mahsulotlar'],
                  },
                ].map((plan) => {
                  const isActive = userTier === plan.key
                  const isSuperAdmin = user?.role === 'superAdmin'
                  return (
                    <div key={plan.key} style={{
                      padding: 14, borderRadius: 10,
                      border: `1.5px solid ${isActive ? plan.color : 'var(--color-border)'}`,
                      background: isActive ? plan.bg : 'var(--color-bg)',
                      position: 'relative',
                    }}>
                      {isActive && (
                        <div style={{
                          position: 'absolute', top: 8, right: 8,
                          padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                          background: plan.color, color: '#fff',
                        }}>
                          {t('currentPlanBadge')}
                        </div>
                      )}
                      <div style={{ fontSize: 16, fontWeight: 700, color: plan.color }}>{plan.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: plan.color, marginTop: 4, marginBottom: 10 }}>
                        {plan.price}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {plan.features.map((f, i) => (
                          <div key={i} style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: plan.color, fontWeight: 700 }}>✓</span> {f}
                          </div>
                        ))}
                      </div>
                      {!isActive && plan.key === 'bor' && (
                        <button
                          onClick={() => window.open('https://t.me/dilbek7011', '_blank')}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: 'none', background: `${plan.color}15`,
                            color: plan.color, cursor: 'pointer',
                          }}
                        >
                          <MessageCircle size={14} />
                          {t('contactAdmin')}
                        </button>
                      )}
                      {!isActive && plan.key === 'pro' && !isSuperAdmin && (
                        <button
                          onClick={() => window.open('https://t.me/dilbek7011', '_blank')}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: `1px solid ${plan.color}40`, background: `${plan.color}15`,
                            color: plan.color, cursor: 'pointer',
                          }}
                        >
                          <MessageCircle size={14} />
                          {t('contactAdmin')}
                        </button>
                      )}
                      {plan.key === 'pro' && isSuperAdmin && (
                        <div style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          padding: '8px 0', borderRadius: 8,
                          background: `${plan.color}10`, color: plan.color,
                          fontSize: 12, fontWeight: 600,
                        }}>
                          {t('cheksiz')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block Code */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Shield size={16} />
          {t('blockCode')}
        </div>
        <button
          onClick={openBlockModal}
          style={{
            ...cardStyle,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
        >
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: blockCode ? 'rgba(245,158,11,0.12)' : 'var(--color-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Lock size={20} style={{ color: blockCode ? 'var(--color-warning)' : 'var(--color-text-secondary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{t('blockCode')}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {blockCode
                ? (blockDisabled ? t('blockCodeDisabledStatus') : t('blockCodeActive'))
                : t('blockCodeInactive')}
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--color-text-secondary)' }} />
        </button>
      </div>

      {/* Business Day Modal */}
      {showBusinessDay && (
        <div
          onClick={() => setShowBusinessDay(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--color-surface)',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                {t('businessDayHour')}
              </h3>
              <button
                onClick={() => setShowBusinessDay(false)}
                title={t('close')}
                aria-label={t('close')}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                {t('businessDayHourDesc')}
              </p>

              {pendingHour !== null && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  marginBottom: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--color-warning)',
                }}>
                  <Info size={14} />
                  Kutilayotgan: {String(pendingHour).padStart(2, '0')}:00 ({dayjs(getEffectiveFrom()).format('DD.MM HH:mm')} dan)
                </div>
              )}

              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {String(editingHour).padStart(2, '0')}:00
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {formatHourRange(editingHour)}
                </div>
              </div>

              {/* Real fix: hour is now picked directly from a 24-cell grid
                  instead of stepping through +/- one hour at a time (up to
                  23 taps to go from 00 to 23) — "tanlanishi kerak, kiritilishi
                  emas" (must be selected, not entered/stepped-through). */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 6,
                padding: 12,
                borderRadius: 10,
                background: 'var(--color-bg)',
                marginBottom: 16,
              }}>
                {Array.from({ length: 24 }, (_, h) => h).map((h) => {
                  const selected = h === editingHour
                  return (
                    <button
                      key={h}
                      onClick={() => setEditingHour(h)}
                      style={{
                        padding: '8px 0',
                        borderRadius: 7,
                        border: selected ? 'none' : '1px solid var(--color-border)',
                        background: selected ? 'var(--color-primary)' : 'var(--color-surface)',
                        color: selected ? '#fff' : 'var(--color-text)',
                        fontSize: 13,
                        fontWeight: selected ? 700 : 500,
                        fontVariantNumeric: 'tabular-nums',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-surface)' }}
                    >
                      {String(h).padStart(2, '0')}
                    </button>
                  )
                })}
              </div>

              <div style={{
                padding: 12,
                borderRadius: 8,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                fontSize: 12,
                color: 'var(--color-text)',
                lineHeight: 1.6,
                marginBottom: 20,
              }}>
                {editingHour === 0
                  ? `00:00 dan 23:59 gacha. Masalan: ${dayjs().format('DD.MM')} 00:00 dan ${dayjs().add(1, 'day').format('DD.MM')} 00:00 gacha bir kun hisoblanadi.`
                  : `${String(editingHour).padStart(2, '0')}:00 dan ${String(editingHour - 1 < 0 ? 23 : editingHour - 1).padStart(2, '0')}:59 gacha.\nMasalan: ${dayjs().add(1, 'day').startOf('day').hour(editingHour).format('DD.MM HH:mm')} dan ${dayjs().add(2, 'day').startOf('day').hour(editingHour).format('DD.MM HH:mm')} gacha bir kun hisoblanadi.`}
              </div>

              <button
                onClick={handleSaveBusinessDay}
                style={{
                  width: '100%',
                  padding: '12px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Block Code Modal */}
      {showBlockModal && (
        <div
          onClick={() => setShowBlockModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              background: 'var(--color-surface)',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: blockCode ? 'rgba(245,158,11,0.12)' : 'var(--color-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lock size={16} style={{ color: blockCode ? 'var(--color-warning)' : 'var(--color-text-secondary)' }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{t('blockCode')}</h3>
              </div>
              <button
                onClick={() => setShowBlockModal(false)}
                title={t('close')}
                aria-label={t('close')}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '32px 24px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>{blockSteps[pinStep]}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, minHeight: 20, marginBottom: 28 }}>
                {!blockCode && pinStep === 0
                  ? t('blockCodePurpose')
                  : blockCode && pinStep === 0
                    ? t('blockCodeCurrentHint')
                    : ' '}
              </div>

              <input
                ref={blockInputRef}
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={4}
                placeholder="••••"
                value={curPin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                  setPinInputs((prev) => { const n = [...prev]; n[pinStep] = v; return n })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && curPin.length === 4) {
                    const nextInputs = [...pinInputs]
                    nextInputs[pinStep] = curPin
                    handleStepAction(pinStep, nextInputs)
                  }
                }}
                onFocus={(e) => e.target.select()}
                style={{
                  width: '100%',
                  maxWidth: 220,
                  height: 60,
                  borderRadius: 12,
                  border: '1.5px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: 28,
                  fontWeight: 700,
                  textAlign: 'center',
                  letterSpacing: 14,
                  caretColor: 'var(--color-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'border-color 0.15s ease',
                  marginBottom: 22,
                }}
              />

              {pinError ? (
                <div style={{
                  fontSize: 13, color: 'var(--color-danger)', marginBottom: 20, minHeight: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  {pinError}
                </div>
              ) : (
                <div style={{ minHeight: 18, marginBottom: 20 }} />
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {blockCode && pinStep === 0 && (
                  <>
                    <button
                      onClick={toggleBlockDisabled}
                      style={{
                        padding: '13px 0',
                        borderRadius: 10,
                        border: '1px solid var(--color-warning)',
                        background: 'transparent',
                        color: 'var(--color-warning)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {blockDisabled ? t('blockCodeTemporaryOn') : t('blockCodeTemporaryOff')}
                    </button>
                    <button
                      onClick={handleRemoveBlock}
                      disabled={isBlockBusy}
                      style={{
                        padding: '13px 0',
                        borderRadius: 10,
                        border: '1px solid var(--color-danger)',
                        background: 'transparent',
                        color: 'var(--color-danger)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: isBlockBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {t('blockCodeRemove')}
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    const nextInputs = [...pinInputs]
                    nextInputs[pinStep] = curPin
                    handleStepAction(pinStep, nextInputs)
                  }}
                  disabled={isBlockBusy || curPin.length !== 4}
                  style={{
                    padding: '13px 0',
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: (isBlockBusy || curPin.length !== 4) ? 'not-allowed' : 'pointer',
                    opacity: (isBlockBusy || curPin.length !== 4) ? 0.5 : 1,
                  }}
                >
                  {isBlockBusy ? t('loading') : (isLastStep ? t('save') : t('blockNext'))}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
