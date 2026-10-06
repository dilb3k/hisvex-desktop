import { formatTruncatedDecimal, type UnitQuantities } from '../utils/quantities'

export function QuantityStack({ quantities }: { quantities: UnitQuantities }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, fontSize: 14, lineHeight: 1.3, fontWeight: 600, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
      <span>{formatTruncatedDecimal(quantities.dona)} dona</span>
      <span>{formatTruncatedDecimal(quantities.kg)} kg</span>
    </span>
  )
}
