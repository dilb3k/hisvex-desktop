import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { productsApi, resolveImageUrl, getDeviceId, clearApiCache } from '../api/client'
import { Package, Plus, Search, Pencil, Lock, AlertTriangle, Trash2, X } from 'lucide-react'
import { t } from '../i18n'
import { PageHeader } from '../components/PageHeader'
import type { Product } from '../types'
import {
  overlay,
  modalContainer,
  modalHeader,
  modalBody,
  modalFooter,
  inputBase,
  inputError,
  label,
  errorText,
  btnPrimary,
  btnSecondary,
  btnDanger,
  spinner,
  formatMoney,
  formatInputAmount,
  parseFormattedAmount,
} from '../styles/shared'

const normalizeDigits = (text: string) => text.replace(/[^\d]/g, '')

interface ValidationErrors {
  name: string
  buyPrice: string
  sellPrice: string
  quantity: string
}

const validateProductInput = (input: { name: string; quantity: number; buyPrice: number; sellPrice: number }): ValidationErrors => {
  const errors: ValidationErrors = { name: '', buyPrice: '', sellPrice: '', quantity: '' }
  if (!input.name || input.name.trim().length === 0) {
    errors.name = 'Mahsulot nomi majburiy'
  } else if (input.name.trim().length < 2) {
    errors.name = "Mahsulot nomi kamida 2 ta belgidan iborat bo'lishi kerak"
  }
  if (!input.buyPrice || input.buyPrice <= 0) {
    errors.buyPrice = 'Sotib olish narxi 0 dan katta bo\'lishi kerak'
  }
  if (!input.sellPrice || input.sellPrice <= 0) {
    errors.sellPrice = 'Sotish narxi 0 dan katta bo\'lishi kerak'
  } else if (input.sellPrice < input.buyPrice) {
    errors.sellPrice = 'Sotish narxi sotib olish narxidan kam bo\'lmasligi kerak'
  }
  if (input.quantity < 0) {
    errors.quantity = 'Miqdor manfiy bo\'lmasligi kerak'
  }
  return errors
}

const hasValidationErrors = (errors: ValidationErrors) => Object.values(errors).some((e) => e !== '')

interface ProductForm {
  name: string
  quantity: string
  buyPrice: string
  sellPrice: string
  image: string | undefined
  barcodes: string[]
}

const EMPTY_FORM: ProductForm = {
  name: '',
  quantity: '',
  buyPrice: '',
  sellPrice: '',
  image: undefined,
  barcodes: [],
}

const EMPTY_ERRORS: ValidationErrors = { name: '', buyPrice: '', sellPrice: '', quantity: '' }

const btnIcon: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.15s',
}

export function ProductsScreen() {
  const { products, loadProducts } = useAppStore()
  const showToast = useAppStore((s) => s.showToast)
  const storeLoading = useAppStore((s) => s.loading.products)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const isLoading = loading || storeLoading

  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<ValidationErrors>(EMPTY_ERRORS)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [showRestockModal, setShowRestockModal] = useState(false)
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [isRestocking, setIsRestocking] = useState(false)

  const blockCode = useAuthStore((s) => s.user?.blockCode ?? null)

  const [showPinVerify, setShowPinVerify] = useState(false)
  const [pinInput, setPinInput] = useState('')

  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    loadProducts().finally(() => setLoading(false))
  }, [loadProducts])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const sortedProducts = useMemo(() => {
    return [...products]
      .filter((p) => !debouncedSearch || p.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
      .sort((a, b) => {
        const ia = a.displayIndex ?? 0
        const ib = b.displayIndex ?? 0
        return ia !== ib ? ia - ib : a.name.localeCompare(b.name)
      })
  }, [products, debouncedSearch])

  const previewQty = Number(form.quantity || 0)
  const previewBuy = parseFormattedAmount(form.buyPrice)
  const previewSell = parseFormattedAmount(form.sellPrice)
  const previewTotalCost = previewQty * previewBuy
  const previewExpectedProfit = previewQty * (previewSell - previewBuy)
  const previewMargin = previewSell > 0 && previewBuy > 0 ? ((previewSell - previewBuy) / previewSell * 100).toFixed(1) : '0'

  const getStockStatus = (qty: number) => {
    if (qty <= 0) return { label: 'Tugagan', color: 'var(--color-danger)' }
    if (qty <= 5) return { label: 'Kam', color: 'var(--color-warning)' }
    return { label: 'Mavjud', color: 'var(--color-success)' }
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setFormErrors(EMPTY_ERRORS)
    setEditingProduct(null)
  }

  const closeProductModal = () => {
    setShowModal(false)
    resetForm()
  }

  const openEdit = (item: Product) => {
    setEditingProduct(item)
    setFormErrors(EMPTY_ERRORS)
    setForm({
      name: item.name,
      quantity: String(item.quantity ?? ''),
      buyPrice: item.buyPrice ? formatInputAmount(String(item.buyPrice)) : '',
      sellPrice: item.sellPrice ? formatInputAmount(String(item.sellPrice)) : '',
      image: item.image || item.imageHash,
      barcodes: item.barcodes ?? [],
    })
    setShowModal(true)
  }

  const openCreate = () => {
    resetForm()
    setShowModal(true)
  }

  const openRestock = (item: Product) => {
    setRestockProduct(item)
    setRestockQty('')
    setShowRestockModal(true)
  }

  const closeRestockModal = () => {
    setShowRestockModal(false)
    setRestockProduct(null)
    setRestockQty('')
  }

  const handleImagePick = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((prev) => ({ ...prev, image: reader.result as string }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleAddBarcode = () => { setShowBarcodeInput(true); setBarcodeInput('') }
  const handleConfirmBarcode = () => {
    const code = barcodeInput.trim()
    if (!code) return
    setForm((prev) => ({
      ...prev,
      barcodes: prev.barcodes.includes(code) ? prev.barcodes : [...prev.barcodes, code],
    }))
    setShowBarcodeInput(false)
    setBarcodeInput('')
  }
  const handleRemoveBarcode = (index: number) => {
    setForm((prev) => ({ ...prev, barcodes: prev.barcodes.filter((_, i) => i !== index) }))
  }

  const validate = () => {
    const next = validateProductInput({
      name: form.name.trim(),
      quantity: Number(form.quantity || 0),
      buyPrice: parseFormattedAmount(form.buyPrice),
      sellPrice: parseFormattedAmount(form.sellPrice),
    })
    setFormErrors(next)
    return !hasValidationErrors(next)
  }

  const execSave = useCallback(async () => {
    const barcodes = form.barcodes.filter(Boolean)
    if (barcodes.length) {
      for (const code of barcodes) {
        const dup = products.find((p) => p.barcodes?.includes(code) && p._id !== editingProduct?._id)
        if (dup) {
          showToast(`"${dup.name}" allaqachon bu (${code}) barcode dan foydalanmoqda`, 'error')
          return false
        }
      }
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      quantity: Number(form.quantity || 0),
      buyPrice: parseFormattedAmount(form.buyPrice),
      sellPrice: parseFormattedAmount(form.sellPrice),
      barcodes,
      deviceId: getDeviceId(),
    }
    if (form.image !== undefined && form.image !== editingProduct?.image) {
      payload.image = form.image
    }
    setIsSubmitting(true)
    try {
      if (editingProduct) {
        await productsApi.update(editingProduct._id, payload)
      } else {
        await productsApi.create(payload)
      }
      closeProductModal()
      clearApiCache()
      await loadProducts(true)
      return true
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [form, editingProduct, loadProducts, products])

  const handleSave = async () => {
    if (!validate()) return
    if (blockCode) { setShowPinVerify(true); setPinInput(''); return }
    await execSave()
  }

  const handleConfirmPin = () => {
    if (pinInput === blockCode) { setShowPinVerify(false); setPinInput(''); execSave() }
    else { showToast("Blok kod noto'g'ri", 'error'); setPinInput('') }
  }

  const handleRestock = async () => {
    if (!restockProduct || !restockQty) return
    const qtyToAdd = parseInt(restockQty.replace(/\D/g, ''), 10)
    if (Number.isNaN(qtyToAdd) || qtyToAdd <= 0) { showToast('To\'g\'ri miqdor kiriting', 'error'); return }
    setIsRestocking(true)
    try {
      await productsApi.update(restockProduct._id, { quantity: (restockProduct.quantity ?? 0) + qtyToAdd })
      closeRestockModal()
      clearApiCache()
      await loadProducts(true)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setIsRestocking(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await productsApi.delete(deleteTarget._id)
      setShowDeleteModal(false); setDeleteTarget(null)
      closeProductModal()
      clearApiCache()
      await loadProducts(true)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('error'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const inputErrorStyle: React.CSSProperties = {
    ...inputBase,
    borderColor: 'var(--color-danger)',
  }

  return (
    <div style={{ padding: 0 }}>
      <PageHeader
        title={t('products')}
        actions={
          <>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  ...inputBase,
                  paddingLeft: 38,
                  width: 250,
                  borderRadius: 10,
                }}
              />
            </div>
            <button
              onClick={openCreate}
              style={{
                ...btnIcon,
                background: 'var(--color-primary)',
              }}
              title={t('addProduct')}
            >
              <Plus size={20} color="#fff" />
            </button>
          </>
        }
      />

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div style={spinner(36)} />
        </div>
      ) : sortedProducts.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          color: 'var(--color-text-secondary)',
        }}>
          <Package size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p style={{ fontSize: 15, fontWeight: 500 }}>{t('noProducts')}</p>
          {!debouncedSearch && (
            <button
              onClick={openCreate}
              style={{
                ...btnPrimary,
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={16} />
              {t('addProduct')}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedProducts.map((item) => {
            const status = getStockStatus(item.quantity ?? 0)
            return (
              <div
                key={item._id}
                style={{
                  background: 'var(--color-surface)',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                onClick={() => openEdit(item)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px' }}>
                  <div style={{
                    width: 84,
                    height: 84,
                    borderRadius: 14,
                    background: 'var(--color-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}>
                    {(item.image || item.imageHash) ? (
                      <img
                        src={resolveImageUrl(item.image, item.imageHash)}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                      />
                    ) : (
                      <Package size={32} color="var(--color-text-tertiary)" />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{item.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                      {item.displayIndex && item.displayIndex > 0 ? `#${item.displayIndex} · ` : ''}
                      {t('currentQuantity')}: {item.quantity ?? 0}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: status.color }}>{status.label}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(item.buyPrice)}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('buy')}</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(item.sellPrice)}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t('sell')}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)' }}>
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '12px 0',
                      cursor: 'pointer',
                      color: 'var(--color-primary)',
                      transition: 'background 0.1s',
                    }}
                    onClick={(e) => { e.stopPropagation(); openEdit(item) }}
                  >
                    <Pencil size={16} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{t('edit')}</span>
                  </div>
                  <div style={{ width: 1, background: 'var(--color-border)' }} />
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '12px 0',
                      background: 'var(--color-success)',
                      cursor: 'pointer',
                      color: '#fff',
                    }}
                    onClick={(e) => { e.stopPropagation(); openRestock(item) }}
                  >
                    <Plus size={20} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{t('add')}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Product Form Modal */}
      {showModal && (
        <div style={overlay} onClick={closeProductModal}>
          <div style={modalContainer} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                {editingProduct ? t('editProduct') : t('addProduct')}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {editingProduct && (
                  <button
                    onClick={() => { setDeleteTarget(editingProduct); setShowDeleteModal(true) }}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--color-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} color="#fff" />
                  </button>
                )}
                <button
                  onClick={closeProductModal}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    fontSize: 20,
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>
            </div>

            <div style={modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={label}>{t('productName')}</label>
                <input
                  type="text"
                  placeholder={t('productNamePlaceholder')}
                  value={form.name}
                  onChange={(e) => { setForm((prev) => ({ ...prev, name: e.target.value })); setFormErrors((prev) => ({ ...prev, name: '' })) }}
                  style={formErrors.name ? inputErrorStyle : inputBase}
                />
                {formErrors.name && <div style={errorText}>{formErrors.name}</div>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={label}>{t('buyPrice')}</label>
                <input
                  type="text"
                  placeholder="0"
                  value={form.buyPrice}
                  onChange={(e) => { setForm((prev) => ({ ...prev, buyPrice: formatInputAmount(e.target.value) })); setFormErrors((prev) => ({ ...prev, buyPrice: '' })) }}
                  style={formErrors.buyPrice ? inputErrorStyle : inputBase}
                />
                {formErrors.buyPrice && <div style={errorText}>{formErrors.buyPrice}</div>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={label}>{t('sellPrice')}</label>
                <input
                  type="text"
                  placeholder="0"
                  value={form.sellPrice}
                  onChange={(e) => { setForm((prev) => ({ ...prev, sellPrice: formatInputAmount(e.target.value) })); setFormErrors((prev) => ({ ...prev, sellPrice: '' })) }}
                  style={formErrors.sellPrice ? inputErrorStyle : inputBase}
                />
                {formErrors.sellPrice && <div style={errorText}>{formErrors.sellPrice}</div>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={label}>{t('quantity')}</label>
                <input
                  type="text"
                  placeholder={t('quantityPlaceholder')}
                  value={form.quantity}
                  onChange={(e) => { setForm((prev) => ({ ...prev, quantity: normalizeDigits(e.target.value) })); setFormErrors((prev) => ({ ...prev, quantity: '' })) }}
                  style={formErrors.quantity ? inputErrorStyle : inputBase}
                />
                {formErrors.quantity && <div style={errorText}>{formErrors.quantity}</div>}
              </div>

              {!editingProduct && (previewQty > 0 || previewBuy > 0 || previewSell > 0) && (
                <div style={{
                  background: 'var(--color-surface)',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  padding: 14,
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {t('preSaveCheck')}
                  </div>
                  {previewBuy > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('buyPrice')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(previewBuy)}</span>
                    </div>
                  )}
                  {previewSell > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('sellPrice')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(previewSell)}</span>
                    </div>
                  )}
                  {previewSell > 0 && previewBuy > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('profitPerUnit')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)' }}>{formatMoney(previewSell - previewBuy)}</span>
                    </div>
                  )}
                  <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
                  {previewQty > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('totalRevenueLabelShort')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(previewQty * previewSell)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('totalProductCost')}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(previewTotalCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('expectedProfitAmount')}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: previewExpectedProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {formatMoney(previewExpectedProfit)}
                    </span>
                  </div>
                  {previewSell > 0 && previewBuy > 0 && previewQty > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('profitMarginPercent')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)' }}>{previewMargin}%</span>
                    </div>
                  )}
                </div>
              )}

              <div
                onClick={handleImagePick}
                style={{
                  height: 220,
                  borderRadius: 14,
                  border: '1.5px dashed var(--color-border)',
                  background: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  marginBottom: 14,
                  transition: 'border-color 0.15s',
                }}
              >
                {form.image ? (
                  <img src={resolveImageUrl(form.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <Package size={36} color="var(--color-text-tertiary)" style={{ marginBottom: 6, opacity: 0.5 }} />
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('addImage')}</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

              <div style={{
                padding: 14,
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: form.barcodes.length > 0 ? 10 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Shtrixkodlar</span>
                  <button
                    onClick={handleAddBarcode}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={12} color="#fff" />
                  </button>
                </div>
                {form.barcodes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {form.barcodes.map((code, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 20,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg)',
                        fontSize: 12,
                      }}>
                        <span style={{ color: 'var(--color-text)' }}>{code}</span>
                        <button onClick={() => handleRemoveBarcode(i)} style={{
                          border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--color-text-tertiary)',
                        }}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {form.barcodes.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Shtrixkod yo'q</div>
                )}
              </div>
            </div>

            <div style={modalFooter}>
              <button onClick={closeProductModal} style={btnSecondary}>{t('cancel')}</button>
              <button
                onClick={handleSave}
                disabled={isSubmitting}
                style={{ ...btnPrimary, opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, lineHeight: 1 }}
              >
                {blockCode ? <Lock size={14} color="#fff" style={{ display: 'block' }} /> : null}
                {isSubmitting ? t('loading') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Input Modal */}
      {showBarcodeInput && (
        <div style={overlay} onClick={() => setShowBarcodeInput(false)}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 14,
            padding: 24,
            width: 360,
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 14 }}>Shtrixkod kiriting</div>
            <input
              type="text"
              placeholder="Shtrixkod raqami"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmBarcode()}
              style={inputBase}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowBarcodeInput(false)} style={btnSecondary}>{t('cancel')}</button>
              <button onClick={handleConfirmBarcode} style={btnPrimary}>Qo'shish</button>
            </div>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {showRestockModal && restockProduct && (
        <div style={overlay} onClick={closeRestockModal}>
          <div style={{ ...modalContainer, width: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{t('restock')}</span>
              <button onClick={closeRestockModal} style={{
                width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                color: 'var(--color-text-secondary)', fontSize: 20, lineHeight: 1,
              }}>&times;</button>
            </div>
            <div style={modalBody}>
              <div style={{
                background: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-border)',
                padding: 16, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center',
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 10, background: 'var(--color-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
                }}>
                  {(restockProduct.image || restockProduct.imageHash) ? (
                    <img src={resolveImageUrl(restockProduct.image, restockProduct.imageHash)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Package size={24} color="var(--color-text-tertiary)" />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{restockProduct.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {t('buy')}: {formatMoney(restockProduct.buyPrice)} | {t('sell')}: {formatMoney(restockProduct.sellPrice)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginTop: 4 }}>
                    {t('currentStock')}: <span style={{ color: 'var(--color-primary)' }}>{restockProduct.quantity ?? 0}</span>
                  </div>
                </div>
              </div>

              <label style={label}>{t('howMuchArrived')}</label>
              <input
                type="text"
                placeholder="0"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value.replace(/\D/g, ''))}
                style={{ ...inputBase, fontSize: 20, fontWeight: 700, textAlign: 'center', padding: '14px' }}
              />

              {restockQty && (
                <div style={{
                  background: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-border)',
                  padding: 14, marginTop: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>{t('result')}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('currentStock')}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{restockProduct.quantity ?? 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('addToStock')}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)' }}>+{restockQty}</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('newStock')}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>{(restockProduct.quantity ?? 0) + (parseInt(restockQty || '0', 10))}</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--color-border)', margin: '6px 0' }} />
                  {(restockProduct.buyPrice ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('restockCost')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(parseInt(restockQty || '0', 10) * (restockProduct.buyPrice ?? 0))}</span>
                    </div>
                  )}
                  {(restockProduct.buyPrice ?? 0) > 0 && (restockProduct.sellPrice ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('expectedProfitAmount')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success)' }}>
                        {formatMoney(parseInt(restockQty || '0', 10) * ((restockProduct.sellPrice ?? 0) - (restockProduct.buyPrice ?? 0)))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={modalFooter}>
              <button onClick={closeRestockModal} style={btnSecondary}>{t('back')}</button>
              <button
                onClick={handleRestock}
                disabled={!restockQty || isRestocking}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-success)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: (!restockQty || isRestocking) ? 'not-allowed' : 'pointer',
                  opacity: (!restockQty || isRestocking) ? 0.6 : 1,
                }}
              >
                {isRestocking ? t('loading') : t('addStock')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteModal && (
        <div style={overlay} onClick={() => setShowDeleteModal(false)}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 14,
            padding: 24,
            width: 380,
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <AlertTriangle size={22} color="var(--color-danger)" />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{t('deleteConfirm')}</div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>{t('deleteMessage')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null) }} style={btnSecondary}>{t('cancel')}</button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                style={{ ...btnDanger, opacity: isDeleting ? 0.6 : 1, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
              >
                {isDeleting ? t('loading') : t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Verification */}
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
              Mahsulotni saqlash uchun himoya kodini kiriting
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
