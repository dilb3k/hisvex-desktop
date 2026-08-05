import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { adminsApi } from '../api/client'
import { Users, CreditCard, Shield, Pencil, Trash2, LogOut, X, Clock } from 'lucide-react'
import { t } from '../i18n'
import { PageHeader } from '../components/PageHeader'
import { formatPhone } from '../utils/formatters'
import type { User } from '../types'

const TIER_OPTIONS: { key: User['tier']; labelKey: string; color: string }[] = [
  { key: 'tekin', labelKey: 'planFree', color: 'var(--color-text-secondary)' },
  { key: 'bor', labelKey: 'planBor', color: '#10B981' },
  { key: 'pro', labelKey: 'planPro', color: '#7C3AED' },
]

function daysUntilExpiry(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--color-bg)',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid var(--color-border)',
}

const contentStyle: React.CSSProperties = {
  padding: 20,
  flex: 1,
  overflow: 'auto',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 14,
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  marginBottom: 6,
  fontWeight: 500,
}

const btnPrimaryStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 0',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-primary)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondaryStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 0',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-text)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}

function TierBadge({ tier }: { tier?: User['tier'] }) {
  const option = TIER_OPTIONS.find((o) => o.key === tier)
  if (!option) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      fontSize: 12, fontWeight: 700,
      color: option.color,
      background: `${option.color}20`,
    }}>
      {t(option.labelKey as any)}
    </span>
  )
}

function RoleBadge({ role }: { role: User['role'] }) {
  const isSuper = role === 'superAdmin'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      background: isSuper ? 'rgba(124,58,237,0.12)' : 'rgba(59,130,246,0.12)',
      color: isSuper ? '#7C3AED' : '#3B82F6',
    }}>
      <Shield size={12} />
      {isSuper ? t('superAdmin') : t('admin')}
    </span>
  )
}

export function UsersScreen() {
  const { user, logout } = useAuthStore()
  const showToast = useAppStore((s) => s.showToast)
  const [admins, setAdmins] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadAdmins = useCallback(async () => {
    if (user?.role !== 'superAdmin') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data } = await adminsApi.getAll()
      setAdmins(data)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setLoading(false)
    }
  }, [user?.role, showToast, t])

  useEffect(() => {
    loadAdmins()
  }, [loadAdmins])

  const stats = useMemo(() => {
    const totalAdmins = admins.length
    const activeSubscriptions = admins.filter((a) => a.tier !== 'tekin').length
    return { totalAdmins, activeSubscriptions }
  }, [admins])

  if (!user || user.role !== 'superAdmin') return null

  const handleLogout = () => {
    logout()
    window.location.hash = '#/login'
  }

  const handleToggleActive = async (admin: User) => {
    if (togglingId) return
    setTogglingId(admin._id)
    const next = admin.isActive === false
    try {
      await adminsApi.update(admin._id, { isActive: next })
      setAdmins((prev) => prev.map((a) => (a._id === admin._id ? { ...a, isActive: next } : a)))
      showToast(next ? t('adminActivated') : t('adminDeactivated'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('usersTitle')}
        actions={
          <button
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{ color: 'var(--color-danger)' }}
          >
            <LogOut size={16} />
            {t('logout')}
          </button>
        }
      />

      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
          <div style={{
            padding: 20,
            borderRadius: 10,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Users size={20} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('totalAdmins')}</span>
            </div>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{stats.totalAdmins}</span>
          </div>
          <div style={{
            padding: 20,
            borderRadius: 10,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <CreditCard size={20} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('activeSubscriptions')}</span>
            </div>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{stats.activeSubscriptions}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div style={{
              width: 32,
              height: 32,
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : admins.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 80,
            color: 'var(--color-text-secondary)',
          }}>
            <Users size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
            <span style={{ fontSize: 14 }}>Foydalanuvchilar yo'q</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {admins.map((admin) => {
              const days = daysUntilExpiry(admin.subscriptionEndDate)
              const isProUnlimited = admin.tier === 'pro' && !admin.subscriptionEndDate
              const isInactive = admin.isActive === false
              const daysColor = days !== null
                ? days <= 0
                  ? 'var(--color-danger)'
                  : days <= 3
                    ? '#F59E0B'
                    : 'var(--color-text-secondary)'
                : 'var(--color-text-secondary)'

              return (
                <div
                  key={admin._id}
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    background: 'var(--color-surface)',
                    border: `1px solid ${isInactive ? 'rgba(107,114,128,0.4)' : 'var(--color-border)'}`,
                    opacity: isInactive ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap', paddingRight: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{admin.username}</span>
                        {isInactive && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '1px 7px', borderRadius: 4,
                            fontSize: 11, fontWeight: 600,
                            background: 'rgba(107,114,128,0.15)', color: 'var(--color-text-secondary)',
                          }}>
                            <Clock size={11} />
                            {t('inactive')}
                          </span>
                        )}
                        <RoleBadge role={admin.role} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <TierBadge tier={admin.tier} />
                        {!isInactive && admin.tier !== 'tekin' && days !== null && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: daysColor }}>
                            {days <= 0 ? t('subscriptionExpired') : t('subscriptionDaysLeft', { days })}
                          </span>
                        )}
                        {!isInactive && admin.tier === 'pro' && days === null && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>
                            {t('cheksiz')}
                          </span>
                        )}
                      </div>
                      {admin.createdAt && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {t('createdAt')}: {new Date(admin.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                      <button
                        onClick={() => handleToggleActive(admin)}
                        disabled={togglingId === admin._id}
                        title={isInactive ? t('adminActivated') : t('adminDeactivated')}
                        style={{
                          width: 44,
                          height: 24,
                          borderRadius: 12,
                          border: 'none',
                          padding: 0,
                          position: 'relative',
                          cursor: togglingId === admin._id ? 'not-allowed' : 'pointer',
                          background: isInactive ? 'rgba(107,114,128,0.45)' : 'linear-gradient(135deg, #10B981, #34D399)',
                          opacity: togglingId === admin._id ? 0.55 : 1,
                          transition: 'background 0.2s, opacity 0.2s',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, left: isInactive ? 2 : 22,
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#fff',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditTarget(admin)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid var(--color-border)',
                            background: 'transparent',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(admin)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid var(--color-danger)',
                            background: 'transparent',
                            color: 'var(--color-danger)',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 8,
            border: '2px dashed var(--color-border)',
            background: 'transparent',
            color: 'var(--color-primary)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + {t('createUser')}
        </button>
      </div>

      {createOpen && (
        <AdminFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); loadAdmins() }}
        />
      )}

      {editTarget && (
        <AdminFormModal
          admin={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadAdmins() }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          admin={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); loadAdmins() }}
        />
      )}
    </div>
  )
}

function AdminFormModal({
  admin,
  onClose,
  onSaved,
}: {
  admin?: User | null
  onClose: () => void
  onSaved: () => void
}) {
  const [username, setUsername] = useState(admin?.username || '')
  const [password, setPassword] = useState('')
  const [phoneNumber, setPhoneNumber] = useState(admin?.phone_number ? formatPhone(admin.phone_number) : '+998')
  const [tier, setTier] = useState<User['tier']>(admin?.tier || 'bor')
  const [saving, setSaving] = useState(false)
  const showToast = useAppStore((s) => s.showToast)

  const isEdit = !!admin

  const handleSubmit = async () => {
    if (!username.trim()) return
    if (!isEdit && password.length < 6) return
    setSaving(true)
    try {
      if (isEdit) {
        const payload: { username?: string; password?: string; tier?: string; phone_number?: string } = { username: username.trim(), tier }
        if (password) payload.password = password
        if (phoneNumber && phoneNumber !== '+998') payload.phone_number = phoneNumber.replace(/\D/g, '')
        await adminsApi.update(admin!._id, payload)
      } else {
        await adminsApi.create(username.trim(), password, tier || 'bor', (phoneNumber || '').replace(/\D/g, '') || undefined)
      }
      onSaved()
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={headerRowStyle}>
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          {isEdit ? t('editAdmin') : t('createAdmin')}
        </h3>
        <button
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={contentStyle}>
        <div style={{
          padding: 12,
          borderRadius: 8,
          borderLeft: '3px solid #7C3AED',
          background: 'rgba(124,58,237,0.06)',
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: '#7C3AED', display: 'block', marginBottom: 4 }}>
            {t('importantInfo')}
          </strong>
          {t('adminInfo')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>{t('loginLabel')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              placeholder={t('loginPlaceholder_Admin')}
            />
          </div>
          <div>
            <label style={labelStyle}>
              {isEdit ? t('passwordNew') : t('password')}
              {isEdit && <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}> (ixtiyoriy)</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder={t('passwordPlaceholder_Admin')}
            />
            {isEdit && (
              <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                {t('passwordLength')}
              </p>
            )}
          </div>
          <div>
            <label style={labelStyle}>{t('phoneNumber')}</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
              style={inputStyle}
              placeholder={t('phoneNumberPlaceholder')}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('tier')}</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {TIER_OPTIONS.map((opt) => {
                const selected = tier === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => setTier(opt.key)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '12px 0',
                      borderRadius: 8,
                      border: `1.5px solid ${selected ? opt.color : 'var(--color-border)'}`,
                      background: selected ? `${opt.color}10` : 'transparent',
                      color: selected ? opt.color : 'var(--color-text-secondary)',
                      fontSize: 13,
                      fontWeight: selected ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: `2px solid ${selected ? opt.color : 'var(--color-border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {selected && <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: opt.color,
                      }} />}
                    </div>
                    {t(opt.labelKey as any)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        gap: 10,
      }}>
        <button onClick={onClose} style={btnSecondaryStyle}>
          {t('cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !username.trim() || (!isEdit && password.length < 6)}
          style={{
            ...btnPrimaryStyle,
            opacity: saving || !username.trim() || (!isEdit && password.length < 6) ? 0.6 : 1,
            cursor: saving || !username.trim() || (!isEdit && password.length < 6) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? t('loading') : isEdit ? t('confirmSave') : t('confirmCreate')}
        </button>
      </div>
    </div>
  )
}

function DeleteConfirmModal({
  admin,
  onClose,
  onDeleted,
}: {
  admin: User
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const showToast = useAppStore((s) => s.showToast)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await adminsApi.delete(admin._id)
      onDeleted()
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
    }}>
      <div style={{
        width: 380,
        padding: 24,
        borderRadius: 12,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          {t('deleteUserTitle')}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
          {t('deleteUserConfirm', { username: admin.username })}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={btnSecondaryStyle} disabled={deleting}>
            {t('cancel')}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 8,
              border: 'none',
              background: deleting ? '#DC262680' : 'var(--color-danger)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? t('loading') : t('delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
