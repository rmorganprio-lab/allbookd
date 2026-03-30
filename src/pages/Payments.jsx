import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAdminOrg } from '../contexts/AdminOrgContext'
import { useToast } from '../contexts/ToastContext'
import { todayInTimezone, formatDate, getTimezoneAbbr } from '../lib/timezone'
import DeliveryModal from '../components/DeliveryModal'
import { formatCurrency } from '../lib/formatCurrency'
import { formatName } from '../lib/formatAddress'
import { logAudit } from '../lib/auditLog'
import { reversePayment } from '../lib/financialActions'
import { useTranslation } from 'react-i18next'

// Legacy color map for known method names (case-insensitive fallback)
const METHOD_COLORS = {
  cash: 'bg-green-100 text-green-700',
  venmo: 'bg-blue-100 text-blue-700',
  zelle: 'bg-purple-100 text-purple-700',
  card: 'bg-amber-100 text-amber-700',
  'bank transfer': 'bg-cyan-100 text-cyan-700',
  bank_transfer: 'bg-cyan-100 text-cyan-700',
  check: 'bg-stone-100 text-stone-600',
  ideal: 'bg-blue-100 text-blue-700',
  tikkie: 'bg-orange-100 text-orange-700',
  interac: 'bg-red-100 text-red-700',
  payid: 'bg-teal-100 text-teal-700',
}

function methodColor(method) {
  return METHOD_COLORS[(method || '').toLowerCase()] || 'bg-stone-100 text-stone-500'
}

const emptyPayment = {
  client_id: '', invoice_id: '', job_id: '', amount: '', method: '', date: '', notes: '', reference: '',
}

export default function Payments({ user }) {
  const { t } = useTranslation()
  const tz = user?.organizations?.settings?.timezone || 'America/Los_Angeles'
  const tzAbbr = getTimezoneAbbr(tz)
  const currencySymbol = user?.organizations?.settings?.currency_symbol || '$'
  const paymentMethods = user?.organizations?.settings?.payment_methods || ['Cash', 'Venmo', 'Zelle', 'Card', 'Check']
  const { adminViewOrg } = useAdminOrg()
  const effectiveOrgId = adminViewOrg?.id ?? user?.org_id
  const { showToast } = useToast()

  const [payments, setPayments] = useState([])
  const [clients, setClients] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyPayment)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [deliveryModal, setDeliveryModal] = useState(null)
  const [clientJobs, setClientJobs] = useState([])
  const [filter, setFilter] = useState({ method: 'all', client: 'all', period: 'all' })
  const [search, setSearch] = useState('')
  const [errors, setErrors] = useState({})

  // Reversal
  const [reverseModal, setReverseModal] = useState(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reverseSaving, setReverseSaving] = useState(false)

  useEffect(() => { loadAll() }, [effectiveOrgId])

  async function loadAll() {
    const [paymentsRes, clientsRes, invoicesRes] = await Promise.all([
      supabase.from('payments').select('*, clients(name, email, phone, preferred_contact), invoices(invoice_number, total)').eq('org_id', effectiveOrgId).order('date', { ascending: false }),
      supabase.from('clients').select('id, name, first_name, last_name').eq('org_id', effectiveOrgId).eq('status', 'active').order('first_name'),
      supabase.from('invoices').select('id, invoice_number, total, status, client_id, clients(name)').eq('org_id', effectiveOrgId).in('status', ['sent', 'overdue']).order('created_at', { ascending: false }),
    ])
    if (paymentsRes.error) {
      console.error('Failed to load payments:', paymentsRes.error)
      showToast(t('common.error.failed_load_payments'), 'error')
    }
    if (clientsRes.error) console.error('Failed to load clients for payments:', clientsRes.error)
    if (invoicesRes.error) console.error('Failed to load invoices for payments:', invoicesRes.error)
    setPayments(paymentsRes.data || [])
    setClients(clientsRes.data || [])
    setInvoices(invoicesRes.data || [])
    setLoading(false)
  }

  // ── Filtering ──

  const today = todayInTimezone(tz)

  function getPeriodStart(period) {
    const d = new Date(today + 'T12:00:00')
    if (period === 'week') { d.setDate(d.getDate() - 7); return d }
    if (period === 'month') { d.setMonth(d.getMonth() - 1); return d }
    if (period === 'quarter') { d.setMonth(d.getMonth() - 3); return d }
    if (period === 'year') { d.setFullYear(d.getFullYear() - 1); return d }
    return null
  }

  const filtered = payments.filter(p => {
    if (filter.method !== 'all' && p.method !== filter.method) return false
    if (filter.client !== 'all' && p.client_id !== filter.client) return false
    if (filter.period !== 'all') {
      const start = getPeriodStart(filter.period)
      if (start && new Date(p.date + 'T12:00:00') < start) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const clientName = p.clients?.name?.toLowerCase() || ''
      const ref = p.reference?.toLowerCase() || ''
      const notes = p.notes?.toLowerCase() || ''
      if (!clientName.includes(q) && !ref.includes(q) && !notes.includes(q)) return false
    }
    return true
  })

  // ── Stats ──

  const totalFiltered = filtered.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const totalThisMonth = payments.filter(p => {
    const pDate = new Date(p.date + 'T12:00:00')
    const todayDate = new Date(today + 'T12:00:00')
    return pDate.getMonth() === todayDate.getMonth() && pDate.getFullYear() === todayDate.getFullYear()
  }).reduce((sum, p) => sum + Number(p.amount || 0), 0)

  const methodBreakdown = [...new Set(filtered.map(p => p.method).filter(Boolean))].map(m => ({
    method: m,
    total: filtered.filter(p => p.method === m).reduce((sum, p) => sum + Number(p.amount || 0), 0),
    count: filtered.filter(p => p.method === m).length,
  }))

  // ── Modal handlers ──

  useEffect(() => {
    if (form.client_id) {
      supabase.from('jobs').select('id, title, date, price, status')
        .eq('client_id', form.client_id).in('status', ['completed', 'in_progress', 'scheduled'])
        .order('date', { ascending: false })
        .then(({ data }) => setClientJobs(data || []))
    } else {
      setClientJobs([])
    }
  }, [form.client_id])

  function openAdd() {
    setForm({ ...emptyPayment, date: today, method: paymentMethods[0] || 'Cash' })
    setSelectedPayment(null)
    setErrors({})
    setModal('add')
  }

  function openEdit(payment) {
    setSelectedPayment(payment)
    setForm({
      client_id: payment.client_id, invoice_id: payment.invoice_id || '',
      job_id: payment.job_id || '',
      amount: payment.amount, method: payment.method, date: payment.date,
      notes: payment.notes || '', reference: payment.reference || '',
    })
    setErrors({})
    setModal('edit')
  }

  function openView(payment) {
    setSelectedPayment(payment)
    setModal('view')
  }

  function validatePayment() {
    const errs = {}
    if (!form.amount || Number(form.amount) <= 0) errs.amount = t('payments.error_amount')
    if (!form.method) errs.method = t('payments.error_method')
    if (!form.date) errs.date = t('payments.error_date')
    return errs
  }

  // ── Save ──

  async function handleSave() {
    const errs = validatePayment()
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true)
    const paymentData = {
      org_id: effectiveOrgId,
      client_id: form.client_id,
      invoice_id: form.invoice_id || null,
      job_id: form.job_id || null,
      amount: Number(form.amount),
      method: form.method,
      date: form.date,
      notes: form.notes || null,
      reference: form.reference || null,
    }

    if (modal === 'add') {
      const { data: newPayment, error } = await supabase.from('payments').insert(paymentData).select('id').single()
      if (error) {
        console.error('Failed to record payment:', error)
        showToast(t('common.error.failed_save'), 'error')
        setSaving(false)
        return
      }
      if (form.invoice_id) {
        // Check if invoice is fully paid
        const { data: invoicePayments } = await supabase.from('payments').select('amount').eq('invoice_id', form.invoice_id)
        const totalPaid = invoicePayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
        const invoice = invoices.find(i => i.id === form.invoice_id)
        if (invoice && totalPaid >= Number(invoice.total)) {
          await supabase.from('invoices').update({ status: 'paid' }).eq('id', form.invoice_id)
        }
      }
      await logAudit({
        supabase, user, adminViewOrg,
        action: 'create',
        entityType: 'payment',
        entityId: newPayment?.id,
        changes: { amount: paymentData.amount, method: paymentData.method, invoice_id: paymentData.invoice_id, job_id: paymentData.job_id },
        metadata: { source: 'payments_page' },
      })
      // Log to client timeline
      await supabase.from('client_timeline').insert({
        org_id: effectiveOrgId,
        client_id: form.client_id,
        event_type: 'payment',
        summary: `Payment of ${formatCurrency(form.amount, currencySymbol)} received via ${form.method}`,
        created_by: user.id,
      })
    } else {
      const { error: updateError } = await supabase.from('payments').update(paymentData).eq('id', selectedPayment.id)
      if (updateError) {
        console.error('Failed to update payment:', updateError)
        showToast(t('common.error.failed_save'), 'error')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setModal(null)
    loadAll()
  }

  // ── Receipt delivery ──

  async function ensurePaymentToken(payment) {
    if (payment.view_token) return payment.view_token
    const token = crypto.randomUUID()
    await supabase.from('payments').update({ view_token: token }).eq('id', payment.id)
    return token
  }

  async function sendReceiptEmail(payment) {
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('send-email', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { type: 'payment_receipt', payment_id: payment.id },
      })
      if (error || data?.error) throw new Error(error?.message || data?.error || 'Send failed')
      showToast(`Receipt sent to ${payment.clients.email}`)
      setDeliveryModal(null)
    } catch (err) {
      showToast(err.message || 'Failed to send receipt', 'error')
    } finally {
      setSending(false)
    }
  }

  async function sendReceiptSms(payment) {
    setSending(true)
    try {
      const token = await ensurePaymentToken(payment)
      const receiptUrl = `${window.location.origin}/receipt/${token}`
      const clientName = payment.clients?.name || 'there'
      const message = `Hi ${clientName}, your payment receipt is ready: ${receiptUrl}`
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('send-sms', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { to: payment.clients.phone, message },
      })
      if (error || data?.error) throw new Error(error?.message || data?.error || 'Send failed')
      showToast(`Receipt sent via SMS to ${payment.clients.phone}`)
      setDeliveryModal(null)
    } catch (err) {
      showToast(err.message || 'Failed to send SMS', 'error')
    } finally {
      setSending(false)
    }
  }

  async function copyReceiptLink(payment) {
    const token = await ensurePaymentToken(payment)
    const url = `${window.location.origin}/receipt/${token}`
    await navigator.clipboard.writeText(url)
    showToast('Receipt link copied to clipboard')
    setDeliveryModal(null)
    loadAll()
  }

  // ── Reverse ──

  async function handleReversePayment() {
    if (!reverseModal || !reverseReason.trim()) return
    setReverseSaving(true)
    try {
      await reversePayment({ supabase, paymentId: reverseModal.id, reason: reverseReason, user, adminViewOrg })
      setReverseModal(null)
      setReverseReason('')
      setModal(null)
      showToast(t('common.toast.payment_reversed'))
      loadAll()
    } catch (err) {
      showToast(err.message || 'Failed to reverse payment.', 'error')
    } finally {
      setReverseSaving(false)
    }
  }

  // ── When client is selected, filter available invoices ──

  const clientInvoices = invoices.filter(i => i.client_id === form.client_id)

  const clientName = (id) => { const c = clients.find(c => c.id === id); return c ? (formatName(c.first_name, c.last_name) || c.name || 'Unknown') : 'Unknown' }

  if (loading) return <div className="p-6 md:p-8 text-stone-400">{t('payments.loading')}</div>

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{t('payments.heading')}</h1>
          <p className="text-stone-500 text-sm mt-1">
            {t('payments.total_count', { count: payments.length })}
            <span className="text-stone-300 mx-1.5">·</span>
            {t('payments.this_month', { amount: formatCurrency(totalThisMonth, currencySymbol) })}
          </p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('payments.record_payment')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <div className="text-xs font-medium text-stone-500 mb-2">{t('payments.stat_showing')}</div>
          <div className="text-2xl font-bold text-stone-900">{formatCurrency(totalFiltered, currencySymbol)}</div>
          <div className="text-xs text-stone-400 mt-1">{t('payments.stat_payments', { count: filtered.length })}</div>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <div className="text-xs font-medium text-stone-500 mb-2">{t('payments.stat_this_month')}</div>
          <div className="text-2xl font-bold text-emerald-700">{formatCurrency(totalThisMonth, currencySymbol)}</div>
        </div>
        {methodBreakdown.slice(0, 2).map(mb => (
          <div key={mb.method} className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="text-xs font-medium text-stone-500 mb-2">{mb.method}</div>
            <div className="text-2xl font-bold text-stone-700">{formatCurrency(mb.total, currencySymbol)}</div>
            <div className="text-xs text-stone-400 mt-1">{t('payments.stat_payments', { count: mb.count })}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text" placeholder={t('payments.search_placeholder')}
          value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 w-full sm:w-64"
        />
        <select value={filter.method} onChange={e => setFilter(f => ({...f, method: e.target.value}))} className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-600">
          <option value="all">{t('payments.filter_all_methods')}</option>
          {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filter.client} onChange={e => setFilter(f => ({...f, client: e.target.value}))} className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-600">
          <option value="all">{t('payments.filter_all_clients')}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{formatName(c.first_name, c.last_name) || c.name}</option>)}
        </select>
        <select value={filter.period} onChange={e => setFilter(f => ({...f, period: e.target.value}))} className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-600">
          <option value="all">{t('payments.filter_all_time')}</option>
          <option value="week">{t('payments.filter_last_7')}</option>
          <option value="month">{t('payments.filter_last_30')}</option>
          <option value="quarter">{t('payments.filter_last_3m')}</option>
          <option value="year">{t('payments.filter_last_year')}</option>
        </select>
      </div>

      {/* Payment List */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-stone-400 text-sm mb-3">{payments.length === 0 ? t('payments.empty_none') : t('payments.empty_no_match')}</p>
            {payments.length === 0 && (
              <button onClick={openAdd} className="px-4 py-2 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800">{t('payments.btn_record_first')}</button>
            )}
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-stone-100 text-xs font-semibold text-stone-400 uppercase tracking-wider">
              <div className="col-span-3">{t('payments.col_client')}</div>
              <div className="col-span-2">{t('payments.col_date')}</div>
              <div className="col-span-2">{t('payments.col_method')}</div>
              <div className="col-span-2">{t('payments.col_reference')}</div>
              <div className="col-span-2 text-right">{t('payments.col_amount')}</div>
              <div className="col-span-1"></div>
            </div>

            {/* Rows */}
            {filtered.map(p => (
              <div key={p.id} onClick={() => openView(p)} className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-5 py-4 border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors items-center ${p.reversed_at ? 'opacity-60' : ''}`}>
                <div className="md:col-span-3">
                  <div className={`font-medium text-sm ${p.reversed_at ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{formatName(p.clients?.first_name, p.clients?.last_name) || p.clients?.name || 'Unknown'}</div>
                  {p.invoices?.invoice_number && <div className="text-xs text-stone-400">Invoice #{p.invoices.invoice_number}</div>}
                  {p.reversed_at && <span className="inline-block px-1.5 py-0.5 bg-stone-200 text-stone-500 text-[10px] font-semibold rounded uppercase tracking-wide">{t('payments.reversed_badge')}</span>}
                </div>
                <div className="md:col-span-2 text-sm text-stone-600">{formatDate(p.date)}</div>
                <div className="md:col-span-2">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${methodColor(p.method)}`}>
                    {p.method}
                  </span>
                </div>
                <div className="md:col-span-2 text-sm text-stone-500 truncate">{p.reference || '—'}</div>
                <div className={`md:col-span-2 text-right font-semibold ${p.reversed_at ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{formatCurrency(p.amount, currencySymbol)}</div>
                <div className="md:col-span-1 text-right">
                  {!p.reversed_at && (
                    <button onClick={(e) => { e.stopPropagation(); openEdit(p) }} className="text-stone-400 hover:text-stone-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Method Breakdown */}
      {methodBreakdown.length > 2 && (
        <div className="mt-6 bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-sm font-semibold text-stone-900 mb-3">{t('payments.method_breakdown_title')}</h3>
          <div className="space-y-2">
            {methodBreakdown.map(mb => (
              <div key={mb.method} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${methodColor(mb.method)}`}>{mb.method}</span>
                  <span className="text-xs text-stone-400">{t('payments.stat_payments', { count: mb.count })}</span>
                </div>
                <span className="text-sm font-medium text-stone-700">{formatCurrency(mb.total, currencySymbol)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── View Payment Modal ── */}
      {modal === 'view' && selectedPayment && (
        <Modal onClose={() => setModal(null)}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-stone-900">{t('payments.view_title')}</h2>
                {selectedPayment.reversed_at && <span className="px-2 py-0.5 bg-stone-200 text-stone-500 text-xs font-semibold rounded uppercase tracking-wide">{t('payments.reversed_badge')}</span>}
              </div>
              <p className="text-sm text-stone-500">{selectedPayment.clients?.name}</p>
            </div>
            <button onClick={() => setModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="space-y-2 mb-6">
            <InfoRow label={t('payments.row_amount')} value={<span className="text-lg font-bold text-emerald-700">{formatCurrency(selectedPayment.amount, currencySymbol)}</span>} />
            <InfoRow label={t('payments.row_client')} value={formatName(selectedPayment.clients?.first_name, selectedPayment.clients?.last_name) || selectedPayment.clients?.name} />
            <InfoRow label={t('payments.row_date')} value={formatDate(selectedPayment.date)} />
            <InfoRow label={t('payments.row_method')} value={<span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${methodColor(selectedPayment.method)}`}>{selectedPayment.method}</span>} />
            {selectedPayment.invoices?.invoice_number && <InfoRow label={t('payments.row_invoice')} value={`#${selectedPayment.invoices.invoice_number}`} />}
            {selectedPayment.reference && <InfoRow label={t('payments.row_reference')} value={selectedPayment.reference} />}
            {selectedPayment.notes && <InfoRow label={t('payments.row_notes')} value={selectedPayment.notes} />}
          </div>

          {selectedPayment.reversed_at && (
            <div className="mb-4 p-3 bg-stone-50 border border-stone-200 rounded-xl">
              <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">{t('payments.reversal_reason_title')}</div>
              <div className="text-sm text-stone-600">{selectedPayment.reversal_reason || '—'}</div>
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-stone-200">
            {!selectedPayment.reversed_at && (
              <button
                onClick={() => setDeliveryModal(selectedPayment)}
                className="w-full py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                {t('payments.btn_send_receipt')}
              </button>
            )}
            <div className="flex gap-3">
              {!selectedPayment.reversed_at && (
                <button onClick={() => openEdit(selectedPayment)} className="flex-1 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200">{t('common.actions.edit')}</button>
              )}
              {!selectedPayment.reversed_at && (
                <button onClick={() => { setReverseModal(selectedPayment); setReverseReason('') }} className="flex-1 py-2.5 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100">{t('payments.btn_reverse')}</button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delivery Modal ── */}
      {deliveryModal && (
        <DeliveryModal
          client={deliveryModal.clients}
          publicUrl={deliveryModal.view_token ? `${window.location.origin}/receipt/${deliveryModal.view_token}` : null}
          label="Receipt"
          sending={sending}
          onEmail={() => sendReceiptEmail(deliveryModal)}
          onSms={() => sendReceiptSms(deliveryModal)}
          onCopyLink={() => copyReceiptLink(deliveryModal)}
          onClose={() => setDeliveryModal(null)}
        />
      )}

      {/* ── Reverse Payment Modal ── */}
      {reverseModal && (
        <Modal onClose={() => { setReverseModal(null); setReverseReason('') }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-stone-900">{t('payments.reverse_title')}</h2>
            <button onClick={() => { setReverseModal(null); setReverseReason('') }} className="p-1.5 text-stone-400 hover:text-stone-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <p className="text-sm text-stone-500 mb-1">{t('payments.reverse_desc', { amount: formatCurrency(reverseModal.amount, currencySymbol), client: formatName(reverseModal.clients?.first_name, reverseModal.clients?.last_name) || reverseModal.clients?.name || 'client', date: formatDate(reverseModal.date) })}</p>
          <p className="text-sm text-stone-500 mb-4">{t('payments.reverse_warning')}</p>
          <div className="mb-4">
            <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.reverse_reason_label')}</label>
            <textarea
              value={reverseReason}
              onChange={e => setReverseReason(e.target.value)}
              rows={3}
              placeholder={t('payments.reverse_reason_ph')}
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setReverseModal(null); setReverseReason('') }} className="flex-1 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200 transition-colors">{t('common.actions.cancel')}</button>
            <button onClick={handleReversePayment} disabled={reverseSaving || !reverseReason.trim()} className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
              {reverseSaving ? t('payments.reversing') : t('payments.btn_reverse_confirm')}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit Payment Modal ── */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal onClose={() => setModal(null)}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-stone-900">{modal === 'add' ? t('payments.modal_add') : t('payments.modal_edit')}</h2>
            <button onClick={() => setModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Client */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.client_label')}</label>
              <select value={form.client_id} onChange={e => setForm(f => ({...f, client_id: e.target.value, invoice_id: '', job_id: ''}))} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                <option value="">{t('payments.select_client')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{formatName(c.first_name, c.last_name) || c.name}</option>)}
              </select>
            </div>

            {/* Invoice (optional) */}
            {clientInvoices.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.invoice_label')}</label>
                <select value={form.invoice_id} onChange={e => setForm(f => ({...f, invoice_id: e.target.value}))} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                  <option value="">{t('payments.invoice_none')}</option>
                  {clientInvoices.map(i => <option key={i.id} value={i.id}>#{i.invoice_number} — {formatCurrency(i.total, currencySymbol)}</option>)}
                </select>
              </div>
            )}

            {/* Job (optional) */}
            {clientJobs.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.job_label')}</label>
                <select value={form.job_id} onChange={e => setForm(f => ({...f, job_id: e.target.value}))} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                  <option value="">{t('payments.job_none')}</option>
                  {clientJobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.date}{j.price ? ` — ${formatCurrency(j.price, currencySymbol)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.amount_label')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">{currencySymbol}</span>
                <input type="number" value={form.amount} onChange={e => { setForm(f => ({...f, amount: e.target.value})); setErrors(er => { const n = {...er}; delete n.amount; return n }) }} placeholder="0.00" step="0.01" className="w-full pl-7 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
              </div>
              {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
              {(() => {
                const inv = form.invoice_id ? invoices.find(i => i.id === form.invoice_id) : null
                if (inv && form.amount && Number(form.amount) > Number(inv.total)) {
                  return <p className="text-xs text-amber-600 mt-1">{t('payments.overpayment_warning')}</p>
                }
                return null
              })()}
            </div>

            {/* Method */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.method_label')}</label>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map(m => (
                  <button key={m} type="button" onClick={() => { setForm(f => ({...f, method: m})); setErrors(er => { const n = {...er}; delete n.method; return n }) }} className={`px-3 py-2 text-xs font-medium rounded-xl transition-colors ${form.method === m ? methodColor(m) + ' ring-2 ring-offset-1 ring-emerald-300' : 'bg-stone-50 text-stone-400 border border-stone-200 hover:border-stone-300'}`}>
                    {m}
                  </button>
                ))}
              </div>
              {errors.method && <p className="text-xs text-red-500 mt-1">{errors.method}</p>}
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.date_label')}</label>
              <input type="date" value={form.date} onChange={e => { if (modal === 'edit') return; setForm(f => ({...f, date: e.target.value})); setErrors(er => { const n = {...er}; delete n.date; return n }) }} disabled={modal === 'edit'} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed" />
              {modal === 'edit' && <p className="text-xs text-stone-400 mt-1">{t('payments.date_locked')}</p>}
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </div>

            {/* Reference */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.reference_label')}</label>
              <input type="text" value={form.reference} onChange={e => setForm(f => ({...f, reference: e.target.value}))} placeholder={t('payments.reference_ph')} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('payments.notes_label')}</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder={t('payments.notes_ph')} rows={2} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none" />
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-stone-200">
            <button onClick={() => setModal(null)} className="flex-1 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200">{t('common.actions.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50">
              {saving ? t('common.actions.saving') : modal === 'add' ? t('payments.btn_record') : t('payments.btn_save')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return <div className="flex justify-between py-1.5"><span className="text-xs text-stone-400">{label}</span><span className="text-sm text-stone-700">{value}</span></div>
}
