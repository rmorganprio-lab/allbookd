/**
 * Formats structured address fields into a single-line display string.
 * Handles missing fields gracefully.
 *
 * US example: "123 Main St, Apt 4B, Sacramento, CA 95814"
 * NL example: "Keizersgracht 100, 1015 AA Amsterdam"
 */
export function formatAddress({ address_line_1, address_line_2, city, state_province, postal_code, country } = {}) {
  const parts = []
  if (address_line_1) parts.push(address_line_1)
  if (address_line_2) parts.push(address_line_2)

  if (country === 'NL') {
    // Dutch format: postal code before city
    const cityLine = [postal_code, city].filter(Boolean).join(' ')
    if (cityLine) parts.push(cityLine)
  } else {
    // US/default format: City, State ZIP
    const cityLine = [city, [state_province, postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    if (cityLine) parts.push(cityLine)
  }

  return parts.join(', ')
}

/**
 * Formats a multi-line address for PDFs and invoices.
 * Returns an array of lines.
 */
export function formatAddressLines({ address_line_1, address_line_2, city, state_province, postal_code, country } = {}) {
  const lines = []
  if (address_line_1) lines.push(address_line_1)
  if (address_line_2) lines.push(address_line_2)

  if (country === 'NL') {
    const cityLine = [postal_code, city].filter(Boolean).join(' ')
    if (cityLine) lines.push(cityLine)
  } else {
    const cityLine = [city, [state_province, postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    if (cityLine) lines.push(cityLine)
  }

  return lines
}

/**
 * Formats first_name + last_name into a display name.
 */
export function formatName(first_name, last_name) {
  return [first_name, last_name].filter(Boolean).join(' ')
}
