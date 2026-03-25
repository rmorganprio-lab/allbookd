/**
 * financialActions.js
 *
 * Helper functions for irreversible financial operations:
 *   - voidInvoice
 *   - voidQuote
 *   - reversePayment
 *   - createCreditNote
 *
 * Each function:
 *   - Validates preconditions and throws a plain Error if they fail
 *   - Writes to Supabase
 *   - Logs to audit_log via logAudit()
 *   - Returns the resulting record(s)
 *
 * Callers should catch errors and display them via showToast().
 * Supabase errors are re-thrown so the caller knows the operation failed.
 */

import { logAudit } from './auditLog'

// ── Internal helper ──────────────────────────────────────────

function nowIso() {
  return new Date().toISOString()
}

// ── voidInvoice ──────────────────────────────────────────────

/**
 * Void an invoice.
 *
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string} opts.invoiceId
 * @param {string} opts.reason       - Required; non-empty explanation
 * @param {object} opts.user         - Logged-in user
 * @param {object|null} opts.adminViewOrg
 * @returns {object} Updated invoice record
 * @throws {Error} If already voided, reason is empty, or DB write fails
 */
export async function voidInvoice({ supabase, invoiceId, reason, user, adminViewOrg }) {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required to void an invoice.')
  }

  // Fetch current invoice
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('id, status, voided_at, invoice_number, total, client_id, org_id')
    .eq('id', invoiceId)
    .single()

  if (fetchError || !invoice) {
    throw new Error('Invoice not found.')
  }

  if (invoice.voided_at !== null) {
    throw new Error(`Invoice ${invoice.invoice_number} is already voided.`)
  }

  const now = nowIso()

  const { data: updated, error: updateError } = await supabase
    .from('invoices')
    .update({
      voided_at: now,
      voided_by: user.id,
      void_reason: reason.trim(),
      status: 'voided',
    })
    .eq('id', invoiceId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to void invoice: ${updateError.message}`)
  }

  await logAudit({
    supabase,
    user,
    adminViewOrg,
    action: 'void',
    entityType: 'invoice',
    entityId: invoiceId,
    changes: {
      status: { from: invoice.status, to: 'voided' },
      void_reason: reason.trim(),
    },
  })

  return updated
}

// ── voidQuote ────────────────────────────────────────────────

/**
 * Void a quote.
 *
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string} opts.quoteId
 * @param {string} opts.reason
 * @param {object} opts.user
 * @param {object|null} opts.adminViewOrg
 * @returns {object} Updated quote record
 * @throws {Error} If already voided, reason is empty, or DB write fails
 */
export async function voidQuote({ supabase, quoteId, reason, user, adminViewOrg }) {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required to void a quote.')
  }

  const { data: quote, error: fetchError } = await supabase
    .from('quotes')
    .select('id, status, voided_at, quote_number, org_id, client_id')
    .eq('id', quoteId)
    .single()

  if (fetchError || !quote) {
    throw new Error('Quote not found.')
  }

  if (quote.voided_at !== null) {
    throw new Error(`Quote ${quote.quote_number} is already voided.`)
  }

  const now = nowIso()

  const { data: updated, error: updateError } = await supabase
    .from('quotes')
    .update({
      voided_at: now,
      voided_by: user.id,
      void_reason: reason.trim(),
      status: 'voided',
    })
    .eq('id', quoteId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to void quote: ${updateError.message}`)
  }

  await logAudit({
    supabase,
    user,
    adminViewOrg,
    action: 'void',
    entityType: 'quote',
    entityId: quoteId,
    changes: {
      status: { from: quote.status, to: 'voided' },
      void_reason: reason.trim(),
    },
  })

  return updated
}

// ── reversePayment ───────────────────────────────────────────

/**
 * Reverse a payment.
 *
 * Creates a new payment record with a negative amount (the offsetting
 * entry), marks the original as reversed, and links the two records.
 * The existing payments schema has no 'type' field, so we use a
 * negative amount for the reversal and record the context in notes.
 *
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string} opts.paymentId    - ID of the payment to reverse
 * @param {string} opts.reason       - Required; non-empty explanation
 * @param {object} opts.user
 * @param {object|null} opts.adminViewOrg
 * @returns {{ original: object, reversal: object }}
 * @throws {Error} If already reversed, reason is empty, or DB write fails
 */
export async function reversePayment({ supabase, paymentId, reason, user, adminViewOrg }) {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required to reverse a payment.')
  }

  // Fetch original payment
  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('id, org_id, client_id, invoice_id, job_id, amount, method, date, notes, reference, reversed_at')
    .eq('id', paymentId)
    .single()

  if (fetchError || !payment) {
    throw new Error('Payment not found.')
  }

  if (payment.reversed_at !== null) {
    throw new Error('This payment has already been reversed.')
  }

  // Create the offsetting reversal record (negative amount, same method)
  const { data: reversalPayment, error: reversalError } = await supabase
    .from('payments')
    .insert({
      org_id: payment.org_id,
      client_id: payment.client_id,
      invoice_id: payment.invoice_id,
      job_id: payment.job_id,
      amount: -Math.abs(Number(payment.amount)),
      method: payment.method,
      date: nowIso().slice(0, 10), // today's date as YYYY-MM-DD
      notes: `Reversal of payment ${paymentId}. Reason: ${reason.trim()}`,
      reference: payment.reference,
    })
    .select()
    .single()

  if (reversalError) {
    throw new Error(`Failed to create reversal record: ${reversalError.message}`)
  }

  // Mark the original as reversed and link it to the reversal record
  const now = nowIso()

  const { data: updatedOriginal, error: updateError } = await supabase
    .from('payments')
    .update({
      reversed_at: now,
      reversed_by: user.id,
      reversal_reason: reason.trim(),
      reversal_payment_id: reversalPayment.id,
    })
    .eq('id', paymentId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to mark payment as reversed: ${updateError.message}`)
  }

  // Log the reversal of the original
  await logAudit({
    supabase,
    user,
    adminViewOrg,
    action: 'reverse',
    entityType: 'payment',
    entityId: paymentId,
    changes: {
      reversed_at: now,
      reversal_reason: reason.trim(),
      reversal_payment_id: reversalPayment.id,
    },
  })

  // Log the creation of the offsetting record
  await logAudit({
    supabase,
    user,
    adminViewOrg,
    action: 'create',
    entityType: 'payment',
    entityId: reversalPayment.id,
    changes: {
      amount: reversalPayment.amount,
      method: reversalPayment.method,
      reversal_of: paymentId,
    },
    metadata: { source: 'reversal' },
  })

  return { original: updatedOriginal, reversal: reversalPayment }
}

// ── createCreditNote ─────────────────────────────────────────

/**
 * Create a credit note against an invoice.
 *
 * The credit amount must not exceed the invoice's remaining creditable
 * balance (invoice total minus the total of any existing credit notes
 * on that invoice). Tax is calculated using the invoice's own tax_rate.
 *
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string} opts.invoiceId
 * @param {number} opts.amount       - Pre-tax credit amount
 * @param {string} opts.reason       - Required; non-empty explanation
 * @param {object} opts.user
 * @param {object|null} opts.adminViewOrg
 * @returns {object} The created credit note record
 * @throws {Error} If amount exceeds remaining balance, reason is empty, or DB write fails
 */
export async function createCreditNote({ supabase, invoiceId, amount, reason, user, adminViewOrg }) {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is required to create a credit note.')
  }

  const creditAmount = Number(amount)
  if (!creditAmount || creditAmount <= 0) {
    throw new Error('Credit amount must be greater than zero.')
  }

  // Fetch invoice for total and tax rate
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('id, org_id, client_id, invoice_number, total, tax_rate, voided_at')
    .eq('id', invoiceId)
    .single()

  if (fetchError || !invoice) {
    throw new Error('Invoice not found.')
  }

  if (invoice.voided_at !== null) {
    throw new Error('Cannot create a credit note against a voided invoice.')
  }

  // Sum existing credit notes against this invoice
  const { data: existingCredits, error: creditsError } = await supabase
    .from('credit_notes')
    .select('total')
    .eq('invoice_id', invoiceId)
    .neq('status', 'draft') // only count sent/applied credits

  if (creditsError) {
    throw new Error('Could not check existing credit notes.')
  }

  const alreadyCredited = (existingCredits || []).reduce((sum, cn) => sum + Number(cn.total), 0)
  const remainingBalance = Number(invoice.total) - alreadyCredited

  // Calculate tax on the credit amount using the invoice's tax rate
  const taxRate = Number(invoice.tax_rate) || 0
  const taxAmount = creditAmount * (taxRate / 100)
  const total = creditAmount + taxAmount

  if (total > remainingBalance + 0.001) { // small epsilon for floating point
    throw new Error(
      `Credit total (${total.toFixed(2)}) exceeds the remaining invoice balance (${remainingBalance.toFixed(2)}).`
    )
  }

  const { data: creditNote, error: insertError } = await supabase
    .from('credit_notes')
    .insert({
      org_id: invoice.org_id,
      invoice_id: invoiceId,
      amount: creditAmount,
      tax_rate: taxRate || null,
      tax_amount: taxAmount,
      total,
      reason: reason.trim(),
      status: 'draft',
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError) {
    throw new Error(`Failed to create credit note: ${insertError.message}`)
  }

  await logAudit({
    supabase,
    user,
    adminViewOrg,
    action: 'create',
    entityType: 'credit_note',
    entityId: creditNote.id,
    changes: {
      credit_note_number: creditNote.credit_note_number,
      invoice_id: invoiceId,
      amount: creditAmount,
      tax_amount: taxAmount,
      total,
      reason: reason.trim(),
    },
  })

  return creditNote
}
