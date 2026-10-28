/** Keep custom codes exact. Only checksum-valid GTIN-12/13/14 gain zero-padding aliases.
 * GS1: https://ref.gs1.org/standards/genspecs/23.0.0/ section 2.1.1.10.
 * Eight-digit UPC-E must not be treated as an expanded GTIN-8 without its symbology.
 */
function gtinKey(value: string): string | undefined {
  if (!/^(?:\d{12}|\d{13}|\d{14})$/.test(value)) return undefined
  let sum = 0
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(value[i]) * weight
  return (10 - sum % 10) % 10 === Number(value.at(-1)) ? value.padStart(14, '0') : undefined
}
export function findProductByBarcode<T extends { barcodes?: string[]; deleted?: boolean }>(products: readonly T[], scanned: string): T | undefined {
  const code = scanned.trim()
  if (!code) return undefined
  const active = products.filter(p => !p.deleted)
  const exact = active.filter(p => p.barcodes?.some(b => b.trim() === code))
  if (exact.length) return exact.length === 1 ? exact[0] : undefined
  const key = gtinKey(code)
  if (!key) return undefined
  const matches = active.filter(p => p.barcodes?.some(b => gtinKey(b.trim()) === key))
  return matches.length === 1 ? matches[0] : undefined
}
