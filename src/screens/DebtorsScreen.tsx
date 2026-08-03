import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { debtorsApi } from '../api/client'
import { Plus, UserPlus, History, Pencil, Trash2, Search, ArrowLeft } from 'lucide-react'
import { t } from '../i18n'
import type { Debtor, DebtHistory } from '../types'

const formatMoney = (val?: number) => {
  if (!val) return '0 so\'m'
  return val.toLocaleString('uz-UZ') + ' so\'m'
}
const formatInputAmount = (text: string) => {
  const digits = text.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('uz-UZ')
}
const parseFormattedAmount = (text: string) => Number(text.replace(/[^\d]/g, '')) || 0
const formatPhone = (text: string) => {
  const digits = text.replace(/\D/g, '').slice(0, 12)
  if (digits.length === 0) return '+998'
  let r = '+' + digits.slice(0, 3)
  if (digits.length > 3) r += ' ' + digits.slice(3, 5)
  if (digits.length > 5) r += ' ' + digits.slice(5, 8)
  if (digits.length > 8) r += ' ' + digits.slice(8, 10)
  if (digits.length > 10) r += ' ' + digits.slice(10, 12)
  return r
}
const displayPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return phone
  return formatPhone(digits)
}
const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const dd = d.getDate().toString().padStart(2, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

export function DebtorsScreen() {
  const showToast = useAppStore((s) => s.showToast)
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [offline, setOffline] = useState(false)

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
    try {
      const { data } = await debtorsApi.getAll()
      setDebtors(data)
    } catch {
      setOffline(true)
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

  const handleDeleteConfirm = async () => {
    if (!selectedDebtor) return
    try {
      await debtorsApi.delete(selectedDebtor._id)
      setShowDeleteConfirm(false)
      setSelectedDebtor(null)
      loadDebtors()
    } catch {
      showToast(t('error'), 'error')
    }
  }

  const handleAdjust = async (type: 'add' | 'subtract') => {
    if (!selectedDebtor) return
    setAdjustError('')
    const amount = parseFormattedAmount(adjustAmount)
    if (amount <= 0) return
    const adjAmount = type === 'subtract' ? -amount : amount
    try {
      await debtorsApi.adjust(selectedDebtor._id, adjAmount)
      const { data } = await debtorsApi.getAll()
      setDebtors(data)
      const updated = data.find((d) => d._id === selectedDebtor._id)
      if (updated) setSelectedDebtor(updated)
      setAdjustAmount('')
    } catch {
      setAdjustError(t('error') || 'Xatolik yuz berdi')
    }
  }

  const handleAddSave = async () => {
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
    }
  }

  const handleEditSave = async () => {
    if (!selectedDebtor) return
    if (!editName.trim()) {
      setEditNameError(t('nameRequired'))
      return
    }
    setEditNameError('')
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
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
  }

  const modalHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    flexShrink: 0,
  }

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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <div style={{
          width: 36,
          height: 36,
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {offline && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 16,
          borderRadius: 8,
          background: '#fef3c7',
          color: '#92400e',
          fontSize: 13,
          textAlign: 'center',
          fontWeight: 500,
        }}>
          {t('offlineDateWarning')}
        </div>
      )}

      <div style={{
        background: 'var(--color-primary)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>
          {formatMoney(totalDebt)}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
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
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <UserPlus size={16} />
          {t('addDebtor')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 60,
          color: 'var(--color-text-secondary)',
          fontSize: 15,
        }}>
          {t('noDebtors')}
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
                  {formatDate(debtor.createdAt)}
                </div>
              </div>
              <div style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#ef4444',
                whiteSpace: 'nowrap',
              }}>
                {formatMoney(debtor.amount)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div style={overlayStyle}>
          <div style={modalHeaderStyle}>
            <button onClick={() => setShowAddModal(false)} style={iconBtnStyle}>
              <ArrowLeft size={20} />
            </button>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
              {t('addDebtor')}
            </h3>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
                {t('debtorName')} *
              </label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={t('enterName')}
                style={inputStyle}
              />
              {addNameError && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{addNameError}</div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
                {t('debtorAmount')} *
              </label>
              <input
                value={addAmountDisplay}
                onChange={(e) => setAddAmountDisplay(formatInputAmount(e.target.value))}
                placeholder="0 so'm"
                inputMode="numeric"
                style={inputStyle}
              />
              {addAmountError && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{addAmountError}</div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
                {t('phone')}
              </label>
              <input
                value={addPhone}
                onChange={(e) => setAddPhone(formatPhone(e.target.value))}
                placeholder="+998 XX XXX XX XX"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
                {t('note')}
              </label>
              <textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder={t('notePlaceholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <button
              onClick={handleAddSave}
              style={{
                width: '100%',
                padding: '12px',
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
      )}

      {showDetailModal && selectedDebtor && (
        <div style={overlayStyle}>
          <div style={modalHeaderStyle}>
            <button onClick={() => { setShowDetailModal(false); setSelectedDebtor(null) }} style={iconBtnStyle}>
              <ArrowLeft size={20} />
            </button>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
              {t('adjustDebt')}
            </h3>
            <button onClick={handleEditFromDetail} style={iconBtnStyle} title={t('edit')}>
              <Pencil size={18} />
            </button>
            <button onClick={handleDeleteFromDetail} style={{ ...iconBtnStyle, color: '#ef4444' }} title={t('delete')}>
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
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 24,
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500, marginBottom: 4 }}>
                {t('debtAmount')}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
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
              {(!selectedDebtor.history || selectedDebtor.history.length === 0) ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '16px 0', textAlign: 'center' }}>
                  {t('noData')}
                </div>
              ) : (
                [...selectedDebtor.history].reverse().map((h: DebtHistory, idx: number) => {
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
                        background: isAdd ? '#ef4444' : '#22c55e',
                        marginTop: 5,
                        flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: isAdd ? '#ef4444' : '#22c55e',
                          }}>
                            {isAdd ? t('added') : t('subtracted')}
                          </span>
                          {h.note && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              · {h.note}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          {formatDate(h.date)}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isAdd ? '#ef4444' : '#22c55e',
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
              <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8, textAlign: 'center' }}>
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
                    ...inputStyle,
                    fontSize: 16,
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                />
              </div>
            <button
              onClick={() => handleAdjust('add')}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#ef4444',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('addToDebt')}
            </button>
            <button
              onClick={() => handleAdjust('subtract')}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('subtractFromDebt')}
            </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedDebtor && (
        <div style={overlayStyle}>
          <div style={modalHeaderStyle}>
            <button onClick={() => { setShowEditModal(false); setSelectedDebtor(null) }} style={iconBtnStyle}>
              <ArrowLeft size={20} />
            </button>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
              {t('editDebtor')}
            </h3>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
                {t('debtorName')} *
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('enterName')}
                style={inputStyle}
              />
              {editNameError && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{editNameError}</div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
                {t('phone')}
              </label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                placeholder="+998 XX XXX XX XX"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', marginBottom: 6, display: 'block' }}>
                {t('note')}
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder={t('notePlaceholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <button
              onClick={handleEditSave}
              style={{
                width: '100%',
                padding: '12px',
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
      )}

      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: 340,
            padding: 24,
            borderRadius: 12,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 8 }}>
              {t('delete')}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, marginBottom: 20 }}>
              {t('deleteDebtorConfirm', { name: selectedDebtor?.name || '' })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setShowDeleteConfirm(false); setSelectedDebtor(null) }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
