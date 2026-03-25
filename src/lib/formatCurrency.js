/**
 * Formats a number as currency using the org's currency symbol.
 *
 * formatCurrency(150, '$') → "$150.00"
 * formatCurrency(150, '€') → "€150.00"
 */
export function formatCurrency(amount, currencySymbol = '$') {
  if (amount == null) return ''
  return `${currencySymbol}${Number(amount).toFixed(2)}`
}
