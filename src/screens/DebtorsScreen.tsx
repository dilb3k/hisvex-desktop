import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { debtorsApi } from '../api/client'
import {
  Plus, Minus, UserPlus, History, Pencil, Trash2, Search, ArrowLeft, UsersRound,
  AlertTriangle, RefreshCw, Wallet, Lock, X,
} from 'lucide-react'
import { t } from '../i18n'
import { PageHeader } from '../components/PageHeader'
import type { Debtor, DebtHistory } from '../types'
import { isBlockCodeDisabled } from '../utils/blockCode'
import {
  overlay,
  modalContainer,
  modalHeader,
  modalBody,
  modalFooter,
  inputBase,
  label,
  errorText,
  btnPrimary,
  btnSecondary,
  btnDanger,
  formatMoney,
  formatInputAmount,
  parseFormattedAmount,
} from '../styles/shared'
import { formatPhone, displayPhone, formatShortDate } from '../utils/formatters'

// KPI card — same icon-chip + label + tabular-nums value structural pattern
// as ProductsScreen.tsx/InventoryScreen.tsx, replacing the old bespoke
// purple gradient hero. Kept in the danger/red tone deliberately: total debt
// owed is a liability figure, not one of the revenue/profit/qty metric
// identities the other screens' KPI rows use.
const kpiCard: React.CSSProperties = {
  background: 'var(--color-surface)', borderRadius: 14, padding: 18, border: '1px solid var(--color-border)',
  display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.15)', marginBottom: 16,
}
const kpiIcon: React.CSSProperties = {
  width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, background: 'var(--color-danger-soft)', color: 'var(--color-danger)',
}
const kpiLabel: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2, fontWeight: 600 }
const kpiValue: React.CSSProperties = { fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4, color: 'var(--color-danger)' }
const kpiCountChip: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
  background: 'var(--color-danger-soft)', color: 'var(--color-danger)', fontSize: 12.5, fontWeight: 700, flexShrink: 0,
}

// Error banner — mirrors Products/Inventory/Sales screens' treatment so a
// genuine fetch failure reads distinctly from "offline" (the pre-existing
// warning banner below) and from "no debtors yet" (empty state).
const errorBannerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
  borderRadius: 14, background: 'var(--color-danger-soft)', border: '1px solid rgba(239,68,68,0.25)',
  marginBottom: 16,
}
const errorBannerTextStyle: React.CSSProperties = { flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--color-danger)', margin: 0 }
const errorBannerRetryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
  border: 'none', background: 'var(--color-danger)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  flexShrink: 0,
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={errorBannerStyle} role="alert">
      <AlertTriangle size={20} color="var(--color-danger)" style={{ flexShrink: 0 }} />
      <p style={errorBannerTextStyle}>{t('statsErrorTitle') || "Ma'lumotlarni yuklab bo'lmadi"}</p>
      <button style={errorBannerRetryBtnStyle} onClick={onRetry}>
        <RefreshCw size={13} />
        {t('retryLabel') || 'Qayta urinish'}
      </button>
    </div>
  )
}

// Loading skeleton — content-shaped placeholder (KPI card + search bar +
// debtor-row list) using the globally-defined `pulse` keyframe, replacing
// the old bare spinner.
const skeletonBlockBase: React.CSSProperties = { borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border)', animation: 'pulse 1.4s ease-in-out infinite' }
function skeletonBlock(h: number, delay = 0): React.CSSProperties {
  return { ...skeletonBlockBase, height: h, animationDelay: `${delay}s` }
}

function DebtorsSkeleton() {
  return (
    <div>
      <div style={{ ...skeletonBlock(78), marginBottom: 16 }} />
      <div style={{ ...skeletonBlock(44, 0.06), marginBottom: 16 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ ...skeletonBlock(64, 0.1 + i * 0.05), marginBottom: 8 }} />
      ))}
    </div>
  )
}

// Small required-field marker — same componentized pattern as
// ProductsScreen.tsx's RequiredMark, replacing the bare inline `{' *'}`.
// Only the genuinely-required fields (name, amount on Add; name on Edit —
// per the existing validation logic) get this.
function RequiredMark() {
  return <span style={{ color: 'var(--color-danger)', marginLeft: 3, fontWeight: 700 }} title={t('requiredFieldTitle')}>*</span>
}

const hintText: React.CSSProperties = { fontSize: 11.5, color: 'var(--color-text-tertiary)', margin: '5px 0 0', lineHeight: 1.4 }

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--color-text)',
  cursor: 'pointer',
  padding: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
}

export function DebtorsScreen() {
  const showToast = useAppStore((s) => s.showToast)
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [offline, setOffline] = useState(false)
  // Genuine fetch failure (online, but the request itself failed) — kept
  // distinct from `offline` above, which only means "no network at all".
  // Conflating the two previously left offline users with a message that
  // implied a permanent error, and gave real fetch failures no retry action.
  const [fetchError, setFetchError] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null)

  const [addName, setAddName] = useState('')
  const [addAmountDisplay, setAddAmountDisplay] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [addNameError, setAddNameError] = useState('')
  const [addAmountError, setAddAmountError] = useState('')

  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editNameError, setEditNameError] = useState('')

  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustError, setAdjustError] = useState('')

  // Duplicate-submission guard for the create/edit/delete/adjust actions
  // below — same pattern as ProductsScreen/SalesScreen/UsersScreen's
  // isSubmitting/saving flags. A single flag is enough here since these
  // screens' modals are mutually exclusive (only one action can be in
  // flight from this screen at a time).
  const [saving, setSaving] = useState(false)

  // PIN gate for Delete — mirrors ProductsScreen.tsx's blockCode/
  // showPinVerify/pinAction pattern. Delete is the most destructive action
  // on this screen (it also wipes the debtor's whole history, see the
  // confirmation copy below), so it's routed through the same protection
  // Save/Delete get on Products when blockCode is set. Add/Edit/Adjust are
  // left ungated here, matching what this pass's spec calls for.
  const blockCode = useAuthStore((s) => s.user?.blockCode ?? null)
  const blockDisabled = isBlockCodeDisabled()
  const [showPinVerify, setShowPinVerify] = useState(false)
  const [pinInput, setPinInput] = useState('')

  useEffect(() => {
    if (showAddModal) {
      setAddName('')
      setAddAmountDisplay('')
      setAddPhone('')
      setAddNotes('')
      setAddNameError('')
      setAddAmountError('')
    }
  }, [showAddModal])

  useEffect(() => {
    if (showEditModal && selectedDebtor) {
      setEditName(selectedDebtor.name || '')
      setEditPhone(selectedDebtor.phone ? displayPhone(selectedDebtor.phone) : '')
      setEditNotes(selectedDebtor.notes || selectedDebtor.note || '')
      setEditNameError('')
    }
  }, [showEditModal, selectedDebtor])

  useEffect(() => {
    if (showDetailModal) {
      setAdjustAmount('')
      setAdjustError('')
    }
  }, [showDetailModal])

  const loadDebtors = useCallback(async () => {
    setLoading(true)
    setOffline(false)
    setFetchError(false)
    try {
      const { data } = await debtorsApi.getAll()
      setDebtors(data)
    } catch {
      // navigator.onLine (surfaced app-wide via useAppStore) distinguishes
      // "no network at all" from a genuine fetch failure while online — the
      // two get different banners below.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setOffline(true)
      } else {
        setFetchError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDebtors()
  }, [loadDebtors])

  const filtered = useMemo(() => {
    if (!search.trim()) return debtors
    const q = search.toLowerCase()
    return debtors.filter((d) => {
      const nameMatch = d.name.toLowerCase().includes(q)
      const phoneDigits = d.phone?.replace(/\D/g, '') || ''
      const searchDigits = q.replace(/\D/g, '')
      const phoneMatch = searchDigits && phoneDigits.includes(searchDigits)
      return nameMatch || phoneMatch
    })
  }, [debtors, search])

  const totalDebt = useMemo(() => {
    return debtors.reduce((sum, d) => sum + (d.amount || 0), 0)
  }, [debtors])

  // Distinguishes "no debtors match the search" from "genuinely zero
  // debtors" for the empty state below, matching the noProductsFound-style
  // split already established on Sales/Inventory's redesigned screens.
  const showEmptyNoDebtors = filtered.length === 0 && !search.trim()
  const showEmptyNotFound = filtered.length === 0 && !!search.trim()

  // Marks the debtor's very first history entry as the seeded "initial
  // debt" (not a later manual adjustment) when it's cleanly detectable: the
  // backend (debtor.service.ts's create()) seeds exactly one "add" entry at
  // creation time whose date is effectively the same instant as
  // debtor.createdAt, and history only ever grows by $push afterwards — so
  // the oldest entry is reliably at index 0. The timestamp-proximity check
  // additionally excludes the case where a debtor was created with a 0
  // starting amount (no seeded entry) and its first real entry is a later,
  // genuine manual addition at index 0.
  const historyForDisplay = useMemo(() => {
    const hist = selectedDebtor?.history ?? []
    const createdAt = selectedDebtor?.createdAt
    return hist
      .map((h, i) => {
        const isInitial = i === 0 && h.type === 'add' && !!createdAt &&
          Math.abs(new Date(h.date).getTime() - new Date(createdAt).getTime()) < 60000
        return { ...h, isInitial }
      })
      .reverse()
  }, [selectedDebtor])

  const handleCardClick = (debtor: Debtor) => {
    setSelectedDebtor(debtor)
    setShowDetailModal(true)
  }

  const handleEditFromDetail = () => {
    setShowDetailModal(false)
    setShowEditModal(true)
  }

  const handleDeleteFromDetail = () => {
    setShowDetailModal(false)
    setShowDeleteConfirm(true)
  }

  const execDelete = async () => {
    if (!selectedDebtor || saving) return
    setSaving(true)
    try {
      await debtorsApi.delete(selectedDebtor._id)
      setShowDeleteConfirm(false)
      setSelectedDebtor(null)
      loadDebtors()
    } catch {
      showToast(t('error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = () => {
    if (saving) return
    if (blockCode && !blockDisabled) {
      setPinInput('')
      setShowPinVerify(true)
      return
    }
    execDelete()
  }

  const handleConfirmPin = () => {
    if (pinInput === blockCode) {
      setShowPinVerify(false)
      setPinInput('')
      execDelete()
    } else {
      showToast("Blok kod noto'g'ri", 'error')
      setPinInput('')
    }
  }

  const handleAdjust = async (type: 'add' | 'subtract') => {
    if (!selectedDebtor || saving) return
    setAdjustError('')
    const amount = parseFormattedAmount(adjustAmount)
    if (amount <= 0) return
    if (type === 'subtract' && amount > selectedDebtor.amount) {
      setAdjustError('O\'chirilayotgan summa qarzdan katta')
      return
    }
    const adjAmount = type === 'subtract' ? -amount : amount
    setSaving(true)
    try {
      await debtorsApi.adjust(selectedDebtor._id, adjAmount)
      const { data } = await debtorsApi.getAll()
      setDebtors(data)
      const updated = data.find((d) => d._id === selectedDebtor._id)
      if (updated) setSelectedDebtor(updated)
      setAdjustAmount('')
    } catch {
      setAdjustError(t('error') || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const handleAddSave = async () => {
    if (saving) return
    let valid = true
    if (!addName.trim()) {
      setAddNameError(t('nameRequired'))
      valid = false
    } else {
      setAddNameError('')
    }
    const amountNum = parseFormattedAmount(addAmountDisplay)
    if (amountNum <= 0) {
      setAddAmountError(t('amountRequired'))
      valid = false
    } else {
      setAddAmountError('')
    }
    if (!valid) return
    setSaving(true)
    try {
      await debtorsApi.create({
        name: addName.trim(),
        amount: amountNum,
        phone: addPhone || undefined,
        notes: addNotes || undefined,
      })
      setShowAddModal(false)
      loadDebtors()
    } catch {
      setAddNameError(t('error') || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const handleEditSave = async () => {
    if (!selectedDebtor || saving) return
    if (!editName.trim()) {
      setEditNameError(t('nameRequired'))
      return
    }
    setEditNameError('')
    setSaving(true)
    try {
      await debtorsApi.update(selectedDebtor._id, {
        name: editName.trim(),
        phone: editPhone || undefined,
        notes: editNotes || undefined,
      })
      setShowEditModal(false)
      setSelectedDebtor(null)
      loadDebtors()
    } catch {
      setEditNameError(t('error') || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {offline && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 16,
          borderRadius: 8,
          background: 'var(--color-warning-soft)',
          color: 'var(--color-warning)',
          fontSize: 13,
          textAlign: 'center',
          fontWeight: 500,
        }}>
          {t('offlineDateWarning')}
        </div>
      )}

      <PageHeader
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
          >
            <UserPlus size={16} />
            {t('addDebtor')}
          </button>
        }
      />

      {loading ? (
        <DebtorsSkeleton />
      ) : fetchError ? (
        <ErrorBanner onRetry={loadDebtors} />
      ) : (
        <>
          <div style={kpiCard}>
            <div style={kpiIcon}><Wallet size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={kpiLabel}>{t('totalDebt')}</div>
              <div style={kpiValue}>{formatMoney(totalDebt)}</div>
            </div>
            <div style={kpiCountChip}>
              <UsersRound size={14} />
              {debtors.length} {t('debtors')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}>
              <Search size={16} color="var(--color-text-secondary)" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  outline: 'none',
                  width: '100%',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 2, display: 'flex' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {(showEmptyNoDebtors || showEmptyNotFound) ? (
            <div className="empty-state">
              <div className="empty-state-icon"><UsersRound size={24} /></div>
              <p className="empty-state-title">{showEmptyNotFound ? t('noDebtorsFound') : t('noDebtors')}</p>
              {showEmptyNotFound ? (
                <button onClick={() => setSearch('')} className="btn btn-secondary" style={{ marginTop: 8 }}>
                  {t('clearSearch')}
                </button>
              ) : (
                <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ marginTop: 8 }}>
                  <Plus size={16} />
                  {t('addDebtor')}
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((debtor, idx) => (
                <div
                  key={debtor._id}
                  onClick={() => handleCardClick(debtor)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    borderRadius: 10,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    marginBottom: 8,
                    transition: 'box-shadow 0.15s',
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>
                      {debtor.name}
                    </div>
                    {debtor.phone && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                        {displayPhone(debtor.phone)}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {formatShortDate(debtor.createdAt)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--color-danger)',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatMoney(debtor.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <div style={overlay}>
          <div style={modalContainer}>
          <div style={modalHeader}>
            <button onClick={() => setShowAddModal(false)} style={iconBtnStyle}>
              <ArrowLeft size={20} />
            </button>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
              {t('addDebtor')}
            </h3>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>
                {t('debtorName')}<RequiredMark />
              </label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={t('enterName')}
                style={inputBase}
              />
              {addNameError && <div style={errorText}>{addNameError}</div>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>
                {t('debtorAmount')}<RequiredMark />
              </label>
              <input
                value={addAmountDisplay}
                onChange={(e) => setAddAmountDisplay(formatInputAmount(e.target.value))}
                placeholder="0 so'm"
                inputMode="numeric"
                style={inputBase}
              />
              {addAmountError && <div style={errorText}>{addAmountError}</div>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>{t('phone')}</label>
              <input
                value={addPhone}
                onChange={(e) => setAddPhone(formatPhone(e.target.value))}
                placeholder="+998 XX XXX XX XX"
                style={inputBase}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={label}>{t('note')}</label>
              <textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder={t('notePlaceholder')}
                rows={3}
                style={{ ...inputBase, resize: 'vertical' }}
              />
            </div>
            <button
              onClick={handleAddSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? t('loading') : t('save')}
            </button>
          </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedDebtor && (
        <div style={overlay}>
          <div style={modalContainer}>
          <div style={modalHeader}>
            <button onClick={() => { setShowDetailModal(false); setSelectedDebtor(null) }} style={iconBtnStyle}>
              <ArrowLeft size={20} />
            </button>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
              {t('adjustDebt')}
            </h3>
            <button onClick={handleEditFromDetail} style={iconBtnStyle} title={t('edit')}>
              <Pencil size={18} />
            </button>
            <button onClick={handleDeleteFromDetail} style={{ ...iconBtnStyle, color: 'var(--color-danger)' }} title={t('delete')}>
              <Trash2 size={18} />
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 20, paddingBottom: 100 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
                {selectedDebtor.name}
              </div>
              {selectedDebtor.phone && (
                <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {displayPhone(selectedDebtor.phone)}
                </div>
              )}
              {(selectedDebtor.notes || selectedDebtor.note) && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6, fontStyle: 'italic' }}>
                  {(selectedDebtor.notes || selectedDebtor.note)}
                </div>
              )}
            </div>

            <div style={{
              background: 'var(--color-danger-soft)',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 24,
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <div style={{ fontSize: 12, color: 'var(--color-danger)', fontWeight: 500, marginBottom: 4 }}>
                {t('debtAmount')}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-danger)' }}>
                {formatMoney(selectedDebtor.amount)}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 12,
              }}>
                <History size={18} />
                {t('debtHistory')}
              </div>
              {historyForDisplay.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '16px 0', textAlign: 'center' }}>
                  {t('noData')}
                </div>
              ) : (
                historyForDisplay.map((h: DebtHistory & { isInitial: boolean }, idx: number) => {
                  const isAdd = h.type === 'add'
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 0',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isAdd ? 'var(--color-danger)' : 'var(--color-success)',
                        marginTop: 5,
                        flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: isAdd ? 'var(--color-danger)' : 'var(--color-success)',
                          }}>
                            {h.isInitial ? t('initialDebtLabel') : (isAdd ? t('added') : t('subtracted'))}
                          </span>
                          {h.note && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              · {h.note}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          {formatShortDate(h.date)}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isAdd ? 'var(--color-danger)' : 'var(--color-success)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}>
                        {isAdd ? '+' : '-'}{formatMoney(h.amount)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--color-surface)',
            borderTop: '1px solid var(--color-border)',
            padding: '12px 20px',
            flexShrink: 0,
          }}>
            {adjustError && (
              <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8, textAlign: 'center' }}>
                {adjustError}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <input
                  value={adjustAmount}
                  onChange={(e) => { setAdjustAmount(formatInputAmount(e.target.value)); setAdjustError('') }}
                  placeholder="0 so'm"
                  inputMode="numeric"
                  style={{
                    ...inputBase,
                    fontSize: 16,
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                />
              </div>
              <button
                onClick={() => handleAdjust('add')}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-danger)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Plus size={14} />
                {t('addToDebt')}
              </button>
              <button
                onClick={() => handleAdjust('subtract')}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-success)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Minus size={14} />
                {t('subtractFromDebt')}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {showEditModal && selectedDebtor && (
        <div style={overlay}>
          <div style={modalContainer}>
          <div style={modalHeader}>
            <button onClick={() => { setShowEditModal(false); setSelectedDebtor(null) }} style={iconBtnStyle}>
              <ArrowLeft size={20} />
            </button>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
              {t('editDebtor')}
            </h3>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>
                {t('debtorName')}<RequiredMark />
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('enterName')}
                style={inputBase}
              />
              {editNameError && <div style={errorText}>{editNameError}</div>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>{t('phone')}</label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                placeholder="+998 XX XXX XX XX"
                style={inputBase}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={label}>{t('note')}</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder={t('notePlaceholder')}
                rows={3}
                style={{ ...inputBase, resize: 'vertical' }}
              />
            </div>
            {/* Amount stays Add/Subtract-only from the detail card — this
                modal deliberately never exposes it directly, so a cheap hint
                here is enough to explain the constraint without
                restructuring the edit flow. */}
            <div style={{ ...hintText, marginBottom: 16 }}>{t('editDebtorAmountHint')}</div>
            <button
              onClick={handleEditSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? t('loading') : t('save')}
            </button>
          </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div style={overlay}>
          <div style={{
            width: 360,
            padding: 24,
            borderRadius: 12,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <AlertTriangle size={22} color="var(--color-danger)" />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                {t('delete')}
              </h3>
            </div>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, marginBottom: 8, lineHeight: 1.5 }}>
              {t('deleteDebtorConfirm', { name: selectedDebtor?.name || '' })}
            </p>
            {/* Explicitly discloses that the debtor's entire embedded debt
                history is permanently deleted too (findOneAndDelete on the
                backend), not just the debtor record — previously undisclosed. */}
            <p style={{ fontSize: 13, color: 'var(--color-danger)', margin: 0, marginBottom: 20, lineHeight: 1.5, fontWeight: 500 }}>
              {t('deleteDebtorHistoryWarning')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setShowDeleteConfirm(false); setSelectedDebtor(null) }}
                style={btnSecondary}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={saving}
                style={{
                  ...btnDanger,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, lineHeight: 1,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {blockCode && !blockDisabled ? <Lock size={14} color="#fff" style={{ display: 'block' }} /> : null}
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Verification — gates Delete only, mirroring ProductsScreen.tsx */}
      {showPinVerify && (
        <div style={overlay} onClick={() => setShowPinVerify(false)}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 14,
            padding: 24,
            width: 380,
            border: '1px solid var(--color-border)',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
          }} onClick={(e) => e.stopPropagation()}>
            <Lock size={32} color="var(--color-warning)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 6 }}>Blok kodni kiriting</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              Qarzdorni o'chirish uchun himoya kodini kiriting
            </div>
            <input
              type="password" inputMode="numeric" placeholder="0000" maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => { if (e.key === 'Enter' && pinInput.length === 4) handleConfirmPin() }}
              onFocus={(e) => e.target.select()}
              autoFocus
              style={{ ...inputBase, textAlign: 'center', fontSize: 20, letterSpacing: 6, marginBottom: 16, color: 'var(--color-text)' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowPinVerify(false)} style={{ ...btnSecondary, flex: 1 }}>Bekor qilish</button>
              <button onClick={handleConfirmPin} style={{ ...btnPrimary, flex: 1 }}>Tasdiqlash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
