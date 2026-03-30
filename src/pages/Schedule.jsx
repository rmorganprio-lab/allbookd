import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { todayInTimezone, toDateStr, formatDateFull, formatTime, formatTimestamp, getTimezoneAbbr, nowInTimezone } from '../lib/timezone'
import { useAdminOrg } from '../contexts/AdminOrgContext'
import { useToast } from '../contexts/ToastContext'
import { formatCurrency } from '../lib/formatCurrency'
import { formatName, formatAddress } from '../lib/formatAddress'
import { logAudit } from '../lib/auditLog'

const statusColors = {
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-stone-100 text-stone-500 border-stone-200',
  pending_confirmation: 'bg-amber-100 text-amber-700 border-amber-200',
}

const emptyJob = {
  client_id: '', service_type_id: '', title: '', date: '', start_time: '09:00',
  duration_minutes: 120, status: 'scheduled', notes: '', price: '', frequency: 'one_time',
  assignees: [], explicitlyUnassigned: false,
}

export default function Schedule({ user }) {
  const { t } = useTranslation()
  const { adminViewOrg } = useAdminOrg()
  const { showToast } = useToast()
  const effectiveOrgId = adminViewOrg?.id ?? user?.org_id
  const tz = user?.organizations?.settings?.timezone || 'America/Los_Angeles'
  const timeFormat = user?.organizations?.settings?.time_format || '12h'
  const currencySymbol = user?.organizations?.settings?.currency_symbol || '$'
  const paymentMethods = user?.organizations?.settings?.payment_methods || ['Cash', 'Venmo', 'Zelle', 'Card', 'Check']
  const tzAbbr = getTimezoneAbbr(tz)

  const [view, setView] = useState('month')
  const [currentDate, setCurrentDate] = useState(() => nowInTimezone(tz))
  const [jobs, setJobs] = useState([])
  const [clients, setClients] = useState([])
  const [workers, setWorkers] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyJob)
  const [selectedJob, setSelectedJob] = useState(null)
  const [saving, setSaving] = useState(false)
  const [recurringAction, setRecurringAction] = useState(null) // 'this' | 'future' | 'all'
  const [recurringWorkerChoice, setRecurringWorkerChoice] = useState(null) // 'all' | 'first_only'
  const [showRecurringOptions, setShowRecurringOptions] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showDeleteRecurring, setShowDeleteRecurring] = useState(false)
  const [paymentModal, setPaymentModal] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [payErrors, setPayErrors] = useState({})
  const [errors, setErrors] = useState({})
  const [jobLinkedData, setJobLinkedData] = useState(null) // { payments, items } for delete warning

  const location = useLocation()
  const pendingJobId = useRef(location.state?.jobId || null)

  const canDelete = user?.role === 'ceo' || user?.role === 'manager' || user?.is_platform_admin

  useEffect(() => { loadAll() }, [effectiveOrgId])

  // Auto-open a job when navigated from Dashboard with a jobId in route state
  useEffect(() => {
    if (!pendingJobId.current || jobs.length === 0) return
    const job = jobs.find(j => j.id === pendingJobId.current)
    pendingJobId.current = null
    if (!job) return
    setCurrentDate(new Date(job.date + 'T12:00:00'))
    setView('day')
    openView(job)
  }, [jobs])

  async function loadAll() {
    const [jobsRes, clientsRes, workersRes, typesRes] = await Promise.all([
      supabase.from('jobs').select('*, clients(name, first_name, last_name, phone, address_line_1, address_line_2, city, state_province, postal_code, country, client_properties(*)), job_assignments(user_id), payments(id)').eq('org_id', effectiveOrgId).order('date').order('start_time'),
      supabase.from('clients').select('id, first_name, last_name, name, email, phone, preferred_contact').eq('org_id', effectiveOrgId).in('status', ['active', 'lead']).order('first_name'),
      supabase.from('users').select('id, name, availability').eq('org_id', effectiveOrgId).in('role', ['ceo', 'manager', 'worker']).order('name'),
      supabase.from('service_types').select('*').eq('org_id', effectiveOrgId).eq('is_active', true).order('name'),
    ])
    if (jobsRes.error) {
      console.error('Failed to load schedule data:', jobsRes.error)
      showToast(t('common.error.failed_load_schedule'), 'error')
    }
    if (clientsRes.error) console.error('Failed to load clients for schedule:', clientsRes.error)
    if (workersRes.error) console.error('Failed to load workers for schedule:', workersRes.error)
    if (typesRes.error) console.error('Failed to load service types for schedule:', typesRes.error)
    setJobs(jobsRes.data || [])
    setClients(clientsRes.data || [])
    setWorkers(workersRes.data || [])
    setServiceTypes(typesRes.data || [])
    setLoading(false)
  }

  function navigate(dir) {
    const d = new Date(currentDate)
    if (view === 'month') d.setMonth(d.getMonth() + dir)
    else if (view === 'week') d.setDate(d.getDate() + (dir * 7))
    else d.setDate(d.getDate() + dir)
    setCurrentDate(d)
  }

  function goToday() { setCurrentDate(nowInTimezone(tz)) }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  function getMonthDays() {
    const first = new Date(year, month, 1).getDay()
    const total = new Date(year, month + 1, 0).getDate()
    const days = []
    for (let i = 0; i < first; i++) days.push(null)
    for (let d = 1; d <= total; d++) days.push(d)
    return days
  }

  function getWeekDays() {
    const start = new Date(currentDate)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d })
  }

  function dateStr(d) {
    if (d instanceof Date) return toDateStr(d)
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function jobsOnDate(ds) { return jobs.filter(j => j.date === ds) }

  const today = todayInTimezone(tz)

  const isRecurring = (job) => job?.recurrence_group_id != null

  // ── Modal openers ──

  function openAdd(date) {
    setForm({ ...emptyJob, date: date || today, client_id: clients[0]?.id || '', service_type_id: serviceTypes[0]?.id || '', title: serviceTypes[0]?.name || 'Cleaning' })
    setSelectedJob(null)
    setRecurringAction(null)
    setRecurringWorkerChoice(null)
    setShowRecurringOptions(false)
    setDeleteConfirm(false)
    setShowDeleteRecurring(false)
    setErrors({})
    setModal('add')
  }

  function openEdit(job) {
    setSelectedJob(job)
    setForm({
      client_id: job.client_id, service_type_id: job.service_type_id || '', title: job.title,
      date: job.date, start_time: job.start_time || '09:00', duration_minutes: job.duration_minutes,
      status: job.status, notes: job.notes || '', price: job.price || '',
      frequency: job.frequency || 'one_time',
      assignees: job.job_assignments?.map(a => a.user_id) || [],
    })
    setRecurringAction(null)
    setDeleteConfirm(false)
    setShowDeleteRecurring(false)
    setErrors({})
    // If recurring, show options before edit form
    if (isRecurring(job)) {
      setShowRecurringOptions(true)
      setModal('recurring_choose')
    } else {
      setShowRecurringOptions(false)
      setModal('edit')
    }
  }

  function openView(job) {
    setSelectedJob(job)
    setDeleteConfirm(false)
    setShowDeleteRecurring(false)
    setModal('view')
  }

  function chooseRecurringEdit(action) {
    setRecurringAction(action)
    setShowRecurringOptions(false)
    setModal('edit')
  }

  function validateJob() {
    const errs = {}
    if (!form.client_id) errs.client_id = t('schedule.validation_client')
    if (!form.date) errs.date = t('schedule.validation_date_required')
    else {
      const todayStr = todayInTimezone(tz)
      if (form.date < todayStr) errs.date = t('schedule.validation_date_past')
    }
    if (!form.start_time) errs.start_time = t('schedule.validation_time')
    if (!form.title.trim()) errs.title = t('schedule.validation_title')
    if (!form.explicitlyUnassigned && form.assignees.length === 0) errs.assignees = t('schedule.validation_assignees')
    if (modal === 'add' && form.frequency !== 'one_time' && form.assignees.length > 0 && recurringWorkerChoice === null) {
      errs.assignees = t('schedule.validation_recurring_worker')
    }
    return errs
  }

  // ── Save job ──

  async function handleSave() {
    setSaving(true)
    if (modal === 'add') {
      const errs = validateJob()
      if (Object.keys(errs).length > 0) { setErrors(errs); setSaving(false); return; }
    }
    const jobData = {
      org_id: effectiveOrgId, client_id: form.client_id, service_type_id: form.service_type_id || null,
      title: form.title, date: form.date, start_time: form.start_time,
      duration_minutes: Number(form.duration_minutes), status: form.status, notes: form.notes,
      price: form.price ? Number(form.price) : null, frequency: form.frequency,
      needs_assignment_reminder: form.explicitlyUnassigned,
    }

    if (modal === 'add') {
      const { data, error: insertError } = await supabase.from('jobs').insert(jobData).select().single()
      if (insertError) {
        console.error('Failed to save job:', insertError)
        showToast(t('common.error.failed_save'), 'error')
        setSaving(false)
        return
      }
      let jobId = data?.id

      // Create recurring instances
      if (form.frequency !== 'one_time' && jobId) {
        await supabase.from('jobs').update({ recurrence_group_id: jobId }).eq('id', jobId)
        const recurringJobs = []
        for (let i = 1; i <= 12; i++) {
          const nextDate = new Date(form.date + 'T12:00:00')
          if (form.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + i)
          else { const interval = form.frequency === 'weekly' ? 7 : 14; nextDate.setDate(nextDate.getDate() + (interval * i)) }
          const futureNeedsReminder = form.explicitlyUnassigned || recurringWorkerChoice === 'first_only'
          recurringJobs.push({ ...jobData, date: toDateStr(nextDate), recurrence_group_id: jobId, recurrence_rule: { frequency: form.frequency, parent_id: jobId }, needs_assignment_reminder: futureNeedsReminder })
        }
        await supabase.from('jobs').insert(recurringJobs)
      }

      // Add assignments to first job
      if (jobId && form.assignees.length > 0) {
        await supabase.from('job_assignments').insert(form.assignees.map(uid => ({ job_id: jobId, user_id: uid })))
      }

      // TODO: Wire up needs_assignment_reminder to automated reminder notifications
      if (form.frequency !== 'one_time' && form.assignees.length > 0 && recurringWorkerChoice === 'all' && jobId) {
        const { data: recurringInstances } = await supabase.from('jobs')
          .select('id').eq('recurrence_group_id', jobId).neq('id', jobId)
        if (recurringInstances) {
          const assignmentRows = recurringInstances.flatMap(j => form.assignees.map(uid => ({ job_id: j.id, user_id: uid })))
          if (assignmentRows.length > 0) await supabase.from('job_assignments').insert(assignmentRows)
          await supabase.from('jobs').update({ needs_assignment_reminder: false }).in('id', recurringInstances.map(j => j.id))
        }
      }
    } else {
      // Editing existing job
      const action = recurringAction || 'this'

      if (action === 'this') {
        const { error: updateError } = await supabase.from('jobs').update(jobData).eq('id', selectedJob.id)
        if (updateError) {
          console.error('Failed to update job:', updateError)
          showToast(t('common.error.failed_save'), 'error')
          setSaving(false)
          return
        }
        await supabase.from('job_assignments').delete().eq('job_id', selectedJob.id)
        if (form.assignees.length > 0) {
          await supabase.from('job_assignments').insert(form.assignees.map(uid => ({ job_id: selectedJob.id, user_id: uid })))
        }
      } else if (action === 'future') {
        const groupId = selectedJob.recurrence_group_id
        const { data: futureJobs } = await supabase.from('jobs').select('id')
          .eq('recurrence_group_id', groupId).gte('date', selectedJob.date)

        if (futureJobs) {
          const futureIds = futureJobs.map(j => j.id)
          for (const fid of futureIds) {
            await supabase.from('jobs').update({
              client_id: form.client_id, service_type_id: form.service_type_id || null,
              title: form.title, start_time: form.start_time,
              duration_minutes: Number(form.duration_minutes), notes: form.notes,
              price: form.price ? Number(form.price) : null,
            }).eq('id', fid)
            await supabase.from('job_assignments').delete().eq('job_id', fid)
            if (form.assignees.length > 0) {
              await supabase.from('job_assignments').insert(form.assignees.map(uid => ({ job_id: fid, user_id: uid })))
            }
          }
        }
      } else if (action === 'all') {
        const groupId = selectedJob.recurrence_group_id
        const { data: allJobs } = await supabase.from('jobs').select('id')
          .eq('recurrence_group_id', groupId)

        if (allJobs) {
          for (const aj of allJobs) {
            await supabase.from('jobs').update({
              client_id: form.client_id, service_type_id: form.service_type_id || null,
              title: form.title, start_time: form.start_time,
              duration_minutes: Number(form.duration_minutes), notes: form.notes,
              price: form.price ? Number(form.price) : null,
            }).eq('id', aj.id)
            await supabase.from('job_assignments').delete().eq('job_id', aj.id)
            if (form.assignees.length > 0) {
              await supabase.from('job_assignments').insert(form.assignees.map(uid => ({ job_id: aj.id, user_id: uid })))
            }
          }
        }
      }
    }

    setSaving(false)
    setModal(null)
    setRecurringAction(null)
    loadAll()
  }

  // ── Delete job ──

  async function handleDelete(scope) {
    if (!selectedJob) return

    let error
    if (scope === 'this' || !isRecurring(selectedJob)) {
      ;({ error } = await supabase.from('jobs').delete().eq('id', selectedJob.id))
    } else if (scope === 'future') {
      ;({ error } = await supabase.from('jobs').delete()
        .eq('recurrence_group_id', selectedJob.recurrence_group_id)
        .gte('date', selectedJob.date))
    } else if (scope === 'all') {
      ;({ error } = await supabase.from('jobs').delete()
        .eq('recurrence_group_id', selectedJob.recurrence_group_id))
    }

    if (error) {
      console.error('Failed to delete job:', error)
      showToast(t('common.error.failed_delete_job'), 'error')
      return
    }

    setModal(null)
    setDeleteConfirm(false)
    setShowDeleteRecurring(false)
    setJobLinkedData(null)
    loadAll()
  }

  // ── Check-in ──

  async function handleCheckIn(job, type) {
    if (type === 'arrive') {
      const { error } = await supabase.from('jobs').update({ status: 'in_progress', arrived_at: new Date().toISOString() }).eq('id', job.id)
      if (error) {
        console.error('Failed to update job status:', error)
        showToast(t('common.error.failed_update_status'), 'error')
        return
      }
      loadAll()
      if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: 'in_progress', arrived_at: new Date().toISOString() })
    } else {
      const { error } = await supabase.from('jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.id)
      if (error) {
        console.error('Failed to update job status:', error)
        showToast(t('common.error.failed_update_status'), 'error')
        return
      }
      loadAll()
      if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: 'completed', completed_at: new Date().toISOString() })
      setPayAmount(job.price ? String(job.price) : '')
      setPayMethod(paymentMethods[0] || 'Cash')
      setPayErrors({})
      setPaymentModal(job)
    }
  }

  async function handleJobPayment() {
    if (!paymentModal) return
    const pe = {}
    if (!payAmount || Number(payAmount) <= 0) pe.amount = t('schedule.payment_error_amount')
    if (!payMethod) pe.method = t('schedule.payment_error_method')
    if (Object.keys(pe).length > 0) { setPayErrors(pe); return; }
    setPayErrors({})
    setPaymentSaving(true)
    const tz_date = todayInTimezone(tz)
    const view_token = crypto.randomUUID()

    const { data: newPayment, error: paymentError } = await supabase.from('payments').insert({
      org_id: effectiveOrgId,
      client_id: paymentModal.client_id,
      job_id: paymentModal.id,
      amount: Number(payAmount),
      method: payMethod,
      date: tz_date,
      notes: `Payment for ${paymentModal.title}`,
      view_token,
    }).select('id').single()

    if (paymentError) {
      console.error('Failed to record payment:', paymentError)
      showToast(t('common.error.failed_save'), 'error')
      setPaymentSaving(false)
      return
    }

    await logAudit({
      supabase, user, adminViewOrg,
      action: 'create',
      entityType: 'payment',
      entityId: newPayment?.id,
      changes: { amount: Number(payAmount), method: payMethod, job_id: paymentModal.id },
      metadata: { source: 'job_completion' },
    })

    await supabase.from('client_timeline').insert({
      org_id: effectiveOrgId,
      client_id: paymentModal.client_id,
      event_type: 'payment',
      summary: `${formatCurrency(payAmount, currencySymbol)} received via ${payMethod}`,
      created_by: user.id,
    })

    // Auto-send receipt with fallback
    if (newPayment?.id) {
      const client = clients.find(c => c.id === paymentModal.client_id)
      sendReceiptAuto(newPayment.id, view_token, client)
    }

    setPaymentSaving(false)
    setPaymentModal(null)
    loadAll()
  }

  // ── Receipt auto-send with fallback ──

  async function sendReceiptAuto(paymentId, token, client) {
    const preferred = client?.preferred_contact || 'email'
    const hasEmail = !!client?.email
    const hasPhone = !!client?.phone
    const receiptUrl = `${window.location.origin}/receipt/${token}`

    try {
      const { data: { session } } = await supabase.auth.getSession()

      // WhatsApp / Phone → always copy link (no direct integration)
      if (preferred === 'whatsapp' || preferred === 'phone') {
        await navigator.clipboard.writeText(receiptUrl)
        showToast(t('schedule.receipt_link_copied'))
        return
      }

      // Email preferred
      if (preferred === 'email') {
        if (hasEmail) {
          const { data, error } = await supabase.functions.invoke('send-email', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { type: 'payment_receipt', payment_id: paymentId },
          })
          if (error || data?.error) throw new Error(error?.message || data?.error)
          showToast(t('schedule.receipt_sent_email'))
        } else if (hasPhone) {
          const firstName = client.first_name || client.name?.split(' ')[0] || 'there'
          const { data, error } = await supabase.functions.invoke('send-sms', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { to: client.phone, message: `Hi ${firstName}, your payment receipt is ready: ${receiptUrl}` },
          })
          if (error || data?.error) throw new Error(error?.message || data?.error)
          showToast(t('schedule.receipt_no_email_sms'))
        } else {
          await navigator.clipboard.writeText(receiptUrl).catch(() => {})
          showToast(t('schedule.receipt_no_contact'))
        }
        return
      }

      // SMS preferred
      if (preferred === 'sms') {
        if (hasPhone) {
          const firstName = client.first_name || client.name?.split(' ')[0] || 'there'
          const { data, error } = await supabase.functions.invoke('send-sms', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { to: client.phone, message: `Hi ${firstName}, your payment receipt is ready: ${receiptUrl}` },
          })
          if (error || data?.error) throw new Error(error?.message || data?.error)
          showToast(t('schedule.receipt_sent_sms'))
        } else if (hasEmail) {
          const { data, error } = await supabase.functions.invoke('send-email', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { type: 'payment_receipt', payment_id: paymentId },
          })
          if (error || data?.error) throw new Error(error?.message || data?.error)
          showToast(t('schedule.receipt_no_phone_email'))
        } else {
          await navigator.clipboard.writeText(receiptUrl).catch(() => {})
          showToast(t('schedule.receipt_no_contact'))
        }
      }
    } catch (err) {
      const url = receiptUrl
      showToast(
        t('schedule.receipt_auto_fail'),
        'error',
        { label: t('schedule.receipt_copy_link'), onClick: () => navigator.clipboard.writeText(url).catch(() => {}) }
      )
    }
  }

  // ── Delete job (with linked data check) ──

  async function initiateJobDelete() {
    if (!selectedJob) return
    const [paymentsRes, itemsRes] = await Promise.all([
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('job_id', selectedJob.id),
      supabase.from('invoice_line_items').select('id', { count: 'exact', head: true }).eq('job_id', selectedJob.id),
    ])
    setJobLinkedData({ payments: paymentsRes.count || 0, items: itemsRes.count || 0 })
    if (isRecurring(selectedJob)) setShowDeleteRecurring(true)
    else setDeleteConfirm(true)
  }

  // ── Conflict detection ──

  const conflicts = useMemo(() => {
    if (!form.date || !form.start_time || form.assignees.length === 0) return []
    const formStart = timeToMinutes(form.start_time)
    const formEnd = formStart + Number(form.duration_minutes)
    const editId = selectedJob?.id
    return jobs.filter(j => {
      if (j.id === editId) return false
      if (j.date !== form.date || j.status === 'cancelled') return false
      const jStart = timeToMinutes(j.start_time)
      const jEnd = jStart + j.duration_minutes
      if (!(formStart < jEnd && formEnd > jStart)) return false
      const jAssignees = j.job_assignments?.map(a => a.user_id) || []
      return form.assignees.some(a => jAssignees.includes(a))
    })
  }, [form.date, form.start_time, form.duration_minutes, form.assignees, jobs, selectedJob])

  function timeToMinutes(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m }

  function toggleAssignee(id) {
    setForm(f => {
      const next = f.assignees.includes(id) ? f.assignees.filter(a => a !== id) : [...f.assignees, id]
      return { ...f, assignees: next, explicitlyUnassigned: false }
    })
    setRecurringWorkerChoice(null)
  }

  function handleServiceTypeChange(id) {
    const st = serviceTypes.find(s => s.id === id)
    setForm(f => ({ ...f, service_type_id: id, title: st?.name || f.title, duration_minutes: st?.default_duration_minutes || f.duration_minutes }))
  }

  async function handleConfirmJob(job) {
    const { error } = await supabase.from('jobs').update({ status: 'scheduled' }).eq('id', job.id)
    if (error) { showToast(t('common.error.failed_confirm_booking'), 'error'); return }
    await supabase.from('clients').update({ status: 'active' }).eq('id', job.client_id)
    showToast(t('common.toast.booking_confirmed'))
    loadAll()
    setModal(null)
  }

  async function handleDeclineJob(job) {
    const { error } = await supabase.from('jobs').update({ status: 'cancelled' }).eq('id', job.id)
    if (error) { showToast(t('common.error.failed_decline_booking'), 'error'); return }
    showToast(t('common.toast.booking_declined'))
    loadAll()
    setModal(null)
  }

  const clientName = (id) => { const c = clients.find(c => c.id === id); return c ? (formatName(c.first_name, c.last_name) || c.name || 'Unknown') : 'Unknown' }
  const workerName = (id) => workers.find(w => w.id === id)?.name || 'Unknown'

  if (loading) return <div className="p-6 md:p-8 text-stone-400">{t('schedule.loading')}</div>

  const MONTHS = t('schedule.months', { returnObjects: true })
  const headerText = view === 'month' ? `${MONTHS[month]} ${year}`
    : view === 'week' ? (() => { const d = getWeekDays(); return `${d[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${d[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` })()
    : currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Helper for linked data warning
  function linkedDataWarning() {
    if (!jobLinkedData || (jobLinkedData.payments === 0 && jobLinkedData.items === 0)) return null
    const parts = [
      jobLinkedData.payments > 0 ? t('schedule.delete_payments', { count: jobLinkedData.payments }) : null,
      jobLinkedData.items > 0 ? t('schedule.delete_line_items', { count: jobLinkedData.items }) : null,
    ].filter(Boolean)
    return `${t('schedule.delete_linked_prefix')} ${parts.join(` ${t('schedule.delete_and')} `)} ${t('schedule.delete_linked_suffix')}`
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{t('schedule.heading')}</h1>
          <p className="text-stone-500 text-sm mt-1">{t('schedule.active_jobs', { count: jobs.filter(j => j.status !== 'cancelled').length })}<span className="text-stone-300 mx-1.5">·</span><span className="text-stone-400">{tzAbbr}</span></p>
        </div>
        <button onClick={() => openAdd(null)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('schedule.new_job')}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-2 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 text-stone-600"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div className="text-sm font-semibold text-stone-900 min-w-[200px] text-center">{headerText}</div>
          <button onClick={() => navigate(1)} className="p-2 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 text-stone-600"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          <button onClick={goToday} className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-50">{t('schedule.today_btn')}</button>
        </div>
        <div className="flex gap-1 bg-white border border-stone-200 rounded-xl p-1">
          {['month','week','day'].map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-medium rounded-lg ${view === v ? 'bg-emerald-700 text-white' : 'text-stone-500 hover:text-stone-700'}`}>
              {t(`schedule.view_${v}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === 'month' && <MonthView days={getMonthDays()} year={year} month={month} today={today} jobsOnDate={jobsOnDate} dateStr={dateStr} timeFormat={timeFormat} onDayClick={(d) => { setView('day'); setCurrentDate(new Date(year, month, d)) }} />}
      {view === 'week' && <WeekView days={getWeekDays()} today={today} jobsOnDate={jobsOnDate} onJobClick={openView} onAddJob={(d) => openAdd(toDateStr(d))} timeFormat={timeFormat} />}
      {view === 'day' && <DayView date={currentDate} today={today} jobs={jobsOnDate(toDateStr(currentDate))} onJobClick={openView} onAddJob={() => openAdd(toDateStr(currentDate))} workerName={workerName} clientName={clientName} onCheckIn={handleCheckIn} tz={tz} timeFormat={timeFormat} currencySymbol={currencySymbol} isWorker={user?.role === 'worker'} />}

      {/* ── Recurring Edit Choice Modal ── */}
      {modal === 'recurring_choose' && selectedJob && (
        <Modal onClose={() => setModal(null)}>
          <h2 className="text-lg font-bold text-stone-900 mb-2">{t('schedule.recurring_edit_title')}</h2>
          <p className="text-sm text-stone-500 mb-6">{t('schedule.recurring_edit_subtitle')}</p>
          <div className="space-y-3">
            <button onClick={() => chooseRecurringEdit('this')} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl text-left hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
              <div className="font-medium text-stone-900 text-sm">{t('schedule.recurring_this_only')}</div>
              <div className="text-xs text-stone-500 mt-0.5">{t('schedule.recurring_this_only_desc', { date: formatDateFull(selectedJob.date) })}</div>
            </button>
            <button onClick={() => chooseRecurringEdit('future')} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl text-left hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
              <div className="font-medium text-stone-900 text-sm">{t('schedule.recurring_future')}</div>
              <div className="text-xs text-stone-500 mt-0.5">{t('schedule.recurring_future_desc')}</div>
            </button>
            <button onClick={() => chooseRecurringEdit('all')} className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl text-left hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
              <div className="font-medium text-stone-900 text-sm">{t('schedule.recurring_all')}</div>
              <div className="text-xs text-stone-500 mt-0.5">{t('schedule.recurring_all_desc')}</div>
            </button>
          </div>
          <button onClick={() => setModal(null)} className="w-full mt-4 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200 transition-colors">{t('common.actions.cancel')}</button>
        </Modal>
      )}

      {/* ── View Job Modal ── */}
      {modal === 'view' && selectedJob && (
        <Modal onClose={() => setModal(null)}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-stone-900">{selectedJob.title}</h2>
                {isRecurring(selectedJob) && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-medium">{t('schedule.recurring_badge')}</span>}
              </div>
              <p className="text-sm text-stone-500">{clientName(selectedJob.client_id)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(selectedJob)} className="px-3 py-1.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-lg hover:bg-stone-200">{t('common.actions.edit')}</button>
              <button onClick={() => setModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <InfoRow label={t('schedule.detail_date')} value={formatDateFull(selectedJob.date)} />
            <InfoRow label={t('schedule.detail_time')} value={`${formatTime(selectedJob.start_time, timeFormat)} ${tzAbbr}`} />
            <InfoRow label={t('schedule.detail_duration')} value={`${selectedJob.duration_minutes} min`} />
            <InfoRow label={t('schedule.detail_status')} value={<span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[selectedJob.status]}`}>{selectedJob.status.replace('_',' ')}</span>} />
            {selectedJob.price && <InfoRow label={t('schedule.detail_price')} value={formatCurrency(selectedJob.price, currencySymbol)} />}
            {selectedJob.frequency && selectedJob.frequency !== 'one_time' && <InfoRow label={t('schedule.detail_frequency')} value={selectedJob.frequency} />}
            {selectedJob.notes && <InfoRow label={t('schedule.detail_notes')} value={selectedJob.notes} />}
            {selectedJob.arrived_at && <InfoRow label={t('schedule.detail_arrived')} value={formatTimestamp(selectedJob.arrived_at, tz, timeFormat)} />}
            {selectedJob.completed_at && <InfoRow label={t('schedule.detail_completed')} value={formatTimestamp(selectedJob.completed_at, tz, timeFormat)} />}
            {selectedJob.payments?.length > 0 && <InfoRow label={t('schedule.detail_payments')} value={<span className="text-emerald-700">{t('schedule.detail_payments_recorded', { count: selectedJob.payments.length })}</span>} />}
          </div>

          {selectedJob.job_assignments?.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">{t('schedule.detail_assigned_to')}</div>
              <div className="flex flex-wrap gap-2">{selectedJob.job_assignments.map(a => <span key={a.user_id} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">{workerName(a.user_id)}</span>)}</div>
            </div>
          )}

          {/* Property access details */}
          {(() => {
            const prop = selectedJob.clients?.client_properties?.[0]
            if (!prop) return null
            const items = [
              prop.alarm_code && { label: t('schedule.property_alarm'), value: prop.alarm_code },
              prop.key_info && { label: t('schedule.property_key'), value: prop.key_info },
              prop.parking_instructions && { label: t('schedule.property_parking'), value: prop.parking_instructions },
              prop.pet_details && { label: t('schedule.property_pets'), value: prop.pet_details },
              prop.special_notes && { label: t('schedule.property_notes'), value: prop.special_notes },
            ].filter(Boolean)
            if (items.length === 0) return null
            return (
              <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <div className="text-xs font-semibold text-sky-700 uppercase tracking-wider mb-2">{t('schedule.property_details')}</div>
                <div className="space-y-1">
                  {items.map(item => (
                    <div key={item.label} className="flex gap-2 text-xs">
                      <span className="font-semibold text-sky-800 shrink-0 w-24">{item.label}</span>
                      <span className="text-sky-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {selectedJob.status === 'pending_confirmation' && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">{t('schedule.pending_confirmation')}</span>
                {selectedJob.source === 'web_booking' && (
                  <span className="text-xs text-stone-400">{t('schedule.booked_via_web')}</span>
                )}
              </div>
              {selectedJob.clients?.phone && (
                <div className="text-sm text-stone-700 mb-3">
                  <span className="font-medium text-stone-500">{t('schedule.phone_label')} </span>
                  <a href={`tel:${selectedJob.clients.phone}`} className="text-emerald-700 font-medium hover:underline">{selectedJob.clients.phone}</a>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => handleConfirmJob(selectedJob)} className="flex-1 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 transition-colors">{t('schedule.confirm_booking')}</button>
                <button onClick={() => handleDeclineJob(selectedJob)} className="flex-1 py-2.5 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100 transition-colors">{t('schedule.decline')}</button>
              </div>
            </div>
          )}
          {selectedJob.status === 'scheduled' && <button onClick={() => handleCheckIn(selectedJob, 'arrive')} className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 mb-2">{t('schedule.mark_arrived')}</button>}
          {selectedJob.status === 'in_progress' && <button onClick={() => handleCheckIn(selectedJob, 'complete')} className="w-full py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 mb-2">{t('schedule.mark_completed')}</button>}
          {selectedJob.status === 'completed' && (
            <Link to="/invoices" className="w-full py-2.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-xl hover:bg-blue-100 transition-colors text-center block mt-2">
              {t('schedule.create_invoice')}
            </Link>
          )}

          <div className="flex gap-3 mt-4 pt-4 border-t border-stone-200">
            <button onClick={() => openEdit(selectedJob)} className="flex-1 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800">{t('schedule.edit_job_btn')}</button>
            {canDelete && (
              <button onClick={initiateJobDelete} className="px-4 py-2.5 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100">{t('common.actions.delete')}</button>
            )}
          </div>

          {/* Non-recurring delete confirm */}
          {deleteConfirm && !isRecurring(selectedJob) && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              {linkedDataWarning() && (
                <p className="text-xs text-red-600 mb-2">{linkedDataWarning()}</p>
              )}
              <p className="text-sm text-red-700 mb-3">{t('schedule.delete_confirm')}</p>
              <div className="flex gap-2">
                <button onClick={() => handleDelete('this')} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">{t('schedule.delete_yes')}</button>
                <button onClick={() => { setDeleteConfirm(false); setJobLinkedData(null) }} className="px-3 py-1.5 bg-white text-stone-600 text-sm rounded-lg border border-stone-200 hover:bg-stone-50">{t('common.actions.cancel')}</button>
              </div>
            </div>
          )}

          {/* Recurring delete options */}
          {showDeleteRecurring && (
            <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              {linkedDataWarning() && (
                <p className="text-xs text-red-600 mb-2">{linkedDataWarning()}</p>
              )}
              <p className="text-sm font-medium text-red-800 mb-3">{t('schedule.delete_recurring_title')}</p>
              <div className="space-y-2">
                <button onClick={() => handleDelete('this')} className="w-full p-3 bg-white border border-red-200 rounded-lg text-left hover:bg-red-100 transition-colors">
                  <div className="text-sm font-medium text-red-700">{t('schedule.delete_this_only')}</div>
                  <div className="text-xs text-red-500 mt-0.5">{t('schedule.delete_this_only_desc')}</div>
                </button>
                <button onClick={() => handleDelete('future')} className="w-full p-3 bg-white border border-red-200 rounded-lg text-left hover:bg-red-100 transition-colors">
                  <div className="text-sm font-medium text-red-700">{t('schedule.delete_future')}</div>
                  <div className="text-xs text-red-500 mt-0.5">{t('schedule.delete_future_desc')}</div>
                </button>
                <button onClick={() => handleDelete('all')} className="w-full p-3 bg-white border border-red-200 rounded-lg text-left hover:bg-red-100 transition-colors">
                  <div className="text-sm font-medium text-red-700">{t('schedule.delete_all')}</div>
                  <div className="text-xs text-red-500 mt-0.5">{t('schedule.delete_all_desc')}</div>
                </button>
                <button onClick={() => { setShowDeleteRecurring(false); setJobLinkedData(null) }} className="w-full py-2 text-stone-500 text-sm hover:text-stone-700">{t('common.actions.cancel')}</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Payment after completion modal ── */}
      {paymentModal && (
        <Modal onClose={() => setPaymentModal(null)}>
          <div className="text-center mb-6">
            <div className="text-emerald-600 text-lg font-medium mb-1">{t('schedule.payment_job_completed')}</div>
            <div className="text-sm text-stone-500">{paymentModal.title} — {clientName(paymentModal.client_id)}</div>
          </div>

          <div className="text-center mb-4">
            <div className="text-sm font-medium text-stone-700">{t('schedule.payment_question')}</div>
          </div>

          <div className="space-y-3">
            {payAmount === '__no__' ? (
              <div className="py-2.5 text-center text-stone-500 text-sm">{t('schedule.payment_none_recorded')}</div>
            ) : (
              <>
                <div>
                  <div className="text-xs text-stone-500 mb-1">
                    {t('schedule.payment_amount')}
                    {paymentModal.price ? ` (${t('schedule.payment_job_total', { amount: formatCurrency(paymentModal.price, currencySymbol) })})` : ''}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">{currencySymbol}</span>
                    <input type="number" value={payAmount} onChange={e => { setPayAmount(e.target.value); setPayErrors(pe => { const n = {...pe}; delete n.amount; return n }) }} placeholder="0.00" step="0.01" className="w-full pl-7 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                  </div>
                  {payErrors.amount && <p className="text-xs text-red-500 mt-1">{payErrors.amount}</p>}
                  {paymentModal.price && payAmount && Number(payAmount) > 0 && Number(payAmount) < Number(paymentModal.price) && (
                    <div className="text-xs text-amber-600 mt-1">{t('schedule.payment_partial', { amount: formatCurrency(Number(paymentModal.price) - Number(payAmount), currencySymbol) })}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.map(m => (
                    <button key={m} onClick={() => { setPayMethod(m); setPayErrors(pe => { const n = {...pe}; delete n.method; return n }) }} className={`px-3 py-2 text-sm font-medium rounded-xl transition-colors min-h-[44px] ${
                      payMethod === m ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}>{m}</button>
                  ))}
                </div>
                {payErrors.method && <p className="text-xs text-red-500 mt-1">{payErrors.method}</p>}
              </>
            )}
          </div>

          <div className="flex gap-2 mt-6 pt-4 border-t border-stone-200">
            <button onClick={() => setPaymentModal(null)} className="flex-1 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200 transition-colors">
              {t('schedule.payment_no')}
            </button>
            <button onClick={handleJobPayment} disabled={paymentSaving || !payAmount || Number(payAmount) <= 0} className="flex-1 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50 transition-colors">
              {paymentSaving ? t('schedule.payment_saving') : t('schedule.payment_save')}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit Job Modal ── */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal onClose={() => setModal(null)} wide>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{modal === 'add' ? t('schedule.form_new_job') : t('schedule.form_edit_job')}</h2>
              {recurringAction && (
                <p className="text-xs text-purple-600 mt-0.5">
                  {t(`schedule.editing_${recurringAction}`)}
                </p>
              )}
            </div>
            <button onClick={() => setModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('schedule.form_client')}</label>
              <select value={form.client_id} onChange={e => { setForm(f => ({...f, client_id: e.target.value})); setErrors(er => { const n = {...er}; delete n.client_id; return n }) }} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                <option value="">{t('schedule.form_select_client')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{formatName(c.first_name, c.last_name) || c.name}</option>)}
              </select>
              {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('schedule.form_service_type')}</label>
              <select value={form.service_type_id} onChange={e => handleServiceTypeChange(e.target.value)} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                <option value="">{t('schedule.form_select_type')}</option>
                {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Field label={t('schedule.form_title')} value={form.title} onChange={v => { setForm(f => ({...f, title: v})); setErrors(er => { const n = {...er}; delete n.title; return n }) }} placeholder={t('schedule.form_title_placeholder')} />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Field label={t('schedule.form_date')} value={form.date} onChange={v => { setForm(f => ({...f, date: v})); setErrors(er => { const n = {...er}; delete n.date; return n }) }} type="date" />
                {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('schedule.form_start_time', { tz: tzAbbr })}</label>
                <input type="time" value={form.start_time} onChange={e => { setForm(f => ({...f, start_time: e.target.value})); setErrors(er => { const n = {...er}; delete n.start_time; return n }) }} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                {errors.start_time && <p className="text-xs text-red-500 mt-1">{errors.start_time}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('schedule.form_duration')} value={form.duration_minutes} onChange={v => setForm(f => ({...f, duration_minutes: v}))} type="number" />
              <Field label={t('schedule.form_price', { symbol: currencySymbol })} value={form.price} onChange={v => setForm(f => ({...f, price: v}))} type="number" placeholder="0.00" />
            </div>

            {/* Frequency - only show on add */}
            {modal === 'add' && (
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('schedule.form_frequency')}</label>
                <div className="flex gap-2">
                  {['one_time','weekly','biweekly','monthly'].map(freq => (
                    <button key={freq} type="button" onClick={() => setForm(f => ({...f, frequency: freq}))} className={`flex-1 py-2 text-xs font-medium rounded-xl ${form.frequency === freq ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200' : 'bg-stone-50 text-stone-400 border border-stone-200'}`}>
                      {t(`schedule.freq_${freq}`)}
                    </button>
                  ))}
                </div>
                {form.frequency !== 'one_time' && <p className="text-xs text-stone-400 mt-1.5">{t('schedule.form_recurring_note')}</p>}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('schedule.form_status')}</label>
              {selectedJob?.payments?.length > 0 && form.status === 'completed' ? (
                <div className="px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-400">
                  {t('schedule.form_status_locked')}
                </div>
              ) : (
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 capitalize">
                  {['scheduled','in_progress','completed','cancelled'].map(s => <option key={s} value={s} className="capitalize">{s.replace('_',' ')}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">{t('schedule.form_assign_worker')}</label>
              <div className="flex flex-wrap gap-2">
                {workers.map(w => (
                  <button key={w.id} type="button" onClick={() => toggleAssignee(w.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${form.assignees.includes(w.id) ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200' : w.availability !== 'available' ? 'bg-stone-50 text-stone-300 border border-stone-200' : 'bg-stone-50 text-stone-500 border border-stone-200 hover:border-stone-300'}`}>
                    {w.name}{w.availability !== 'available' && ` (${w.availability === 'vacation' ? '🏖' : 'off'})`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setForm(f => ({ ...f, assignees: [], explicitlyUnassigned: true })); setRecurringWorkerChoice(null) }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${form.explicitlyUnassigned ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-200' : 'bg-stone-50 text-stone-500 border border-stone-200 hover:border-amber-300 hover:text-amber-600'}`}
                >
                  {t('schedule.form_unassigned_btn')}
                </button>
              </div>
              {errors.assignees && <p className="text-xs text-red-500 mt-1">{errors.assignees}</p>}
              {!errors.assignees && form.assignees.length === 0 && !form.explicitlyUnassigned && (
                <p className="text-xs text-amber-500 mt-1">{t('schedule.form_select_or_unassigned')}</p>
              )}
            </div>

            {/* Recurring worker assignment prompt */}
            {modal === 'add' && form.frequency !== 'one_time' && form.assignees.length > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm font-medium text-blue-800 mb-3">
                  Assign {form.assignees.length === 1 ? workers.find(w => w.id === form.assignees[0])?.name || 'this worker' : 'selected workers'} to all occurrences in this series?
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRecurringWorkerChoice('all')} className={`flex-1 py-2 text-xs font-medium rounded-xl ${recurringWorkerChoice === 'all' ? 'bg-blue-700 text-white' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'}`}>
                    {t('schedule.form_assign_all_yes')}
                  </button>
                  <button type="button" onClick={() => setRecurringWorkerChoice('first_only')} className={`flex-1 py-2 text-xs font-medium rounded-xl ${recurringWorkerChoice === 'first_only' ? 'bg-stone-700 text-white' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'}`}>
                    {t('schedule.form_assign_all_no')}
                  </button>
                </div>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-sm font-medium text-amber-800 mb-1">{t('schedule.form_conflict_warning')}</div>
                {conflicts.map(c => <div key={c.id} className="text-xs text-amber-700">{c.title} for {clientName(c.client_id)} at {formatTime(c.start_time, timeFormat)} ({c.duration_minutes}min)</div>)}
              </div>
            )}

            <Field label={t('schedule.form_notes')} value={form.notes} onChange={v => setForm(f => ({...f, notes: v}))} type="textarea" placeholder={t('schedule.form_notes_placeholder')} />
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-stone-200">
            <button onClick={() => setModal(null)} className="flex-1 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200">{t('common.actions.cancel')}</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? t('common.actions.saving') : modal === 'add' ? t('schedule.form_create_job') : t('schedule.form_save_changes')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Views ──

function MonthView({ days, year, month, today, jobsOnDate, dateStr, timeFormat, onDayClick }) {
  const { t } = useTranslation()
  const DAYS = t('schedule.days_short', { returnObjects: true })
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-stone-200">{DAYS.map(d => <div key={d} className="py-2 text-center text-xs font-semibold text-stone-400 uppercase tracking-wider">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[80px] bg-stone-50 border-b border-r border-stone-100" />
          const ds = dateStr(d); const dayJobs = jobsOnDate(ds); const isToday = ds === today
          return (
            <div key={i} onClick={() => onDayClick(d)} className="min-h-[80px] p-1.5 border-b border-r border-stone-100 hover:bg-stone-50 cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${isToday ? 'bg-emerald-700 text-white' : 'text-stone-600'}`}>{d}</span>
                {dayJobs.length > 0 && <span className="text-[10px] text-stone-400">{dayJobs.length}</span>}
              </div>
              <div className="space-y-0.5">
                {dayJobs.slice(0,3).map(j => <div key={j.id} className={`px-1.5 py-0.5 rounded text-[10px] font-medium truncate ${j.status==='completed'?'bg-emerald-50 text-emerald-600':j.status==='in_progress'?'bg-amber-50 text-amber-600':j.status==='cancelled'?'bg-stone-50 text-stone-400 line-through':'bg-blue-50 text-blue-600'}`}>{j.start_time ? formatTime(j.start_time, timeFormat) + ' ' : ''}{j.title}</div>)}
                {dayJobs.length > 3 && <div className="text-[10px] text-stone-400 pl-1">+{dayJobs.length-3} more</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ days, today, jobsOnDate, onJobClick, onAddJob, timeFormat }) {
  const { t } = useTranslation()
  const DAYS = t('schedule.days_short', { returnObjects: true })
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <div className="grid grid-cols-7 divide-x divide-stone-100">
        {days.map(d => {
          const ds = toDateStr(d); const dayJobs = jobsOnDate(ds); const isToday = ds === today
          return (
            <div key={ds} className="min-h-[300px]">
              <div className={`py-2 px-2 text-center border-b border-stone-100 ${isToday ? 'bg-emerald-50' : ''}`}>
                <div className="text-[10px] text-stone-400 uppercase">{DAYS[d.getDay()]}</div>
                <div className={`text-sm font-semibold ${isToday ? 'text-emerald-700' : 'text-stone-700'}`}>{d.getDate()}</div>
              </div>
              <div className="p-1 space-y-1">
                {dayJobs.map(j => (
                  <div key={j.id} onClick={() => onJobClick(j)} className={`p-1.5 rounded-lg text-[10px] cursor-pointer hover:opacity-80 ${j.status==='completed'?'bg-emerald-50 border border-emerald-100':j.status==='in_progress'?'bg-amber-50 border border-amber-100':j.status==='cancelled'?'bg-stone-50 border border-stone-100':'bg-blue-50 border border-blue-100'}`}>
                    <div className="font-medium truncate">{j.start_time ? formatTime(j.start_time, timeFormat) + ' ' : ''}{j.title}</div>
                    <div className="text-stone-500 truncate">{formatName(j.clients?.first_name, j.clients?.last_name) || j.clients?.name}</div>
                    {(formatAddress(j.clients || {}) || j.clients?.address) && <div className="text-stone-400 truncate">{formatAddress(j.clients || {}) || j.clients?.address}</div>}
                  </div>
                ))}
                <button onClick={() => onAddJob(d)} className="w-full py-1 text-[10px] text-stone-300 hover:text-stone-500 hover:bg-stone-50 rounded">+</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({ date, today, jobs, onJobClick, onAddJob, workerName, clientName, onCheckIn, tz, timeFormat, currencySymbol = '$', isWorker = false }) {
  const { t } = useTranslation()
  const ds = toDateStr(date); const isToday = ds === today
  const sorted = [...jobs].sort((a, b) => (a.start_time||'').localeCompare(b.start_time||''))
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-stone-400 text-sm mb-3">{t('schedule.day_empty')}</p>
          <button onClick={onAddJob} className="px-4 py-2 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800">{t('schedule.day_add_job')}</button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(job => (
            <div key={job.id} className={`p-4 rounded-xl border cursor-pointer hover:shadow-sm ${statusColors[job.status]}`} onClick={() => onJobClick(job)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                    {job.title}
                    {job.recurrence_group_id && <span className="text-purple-500 text-[10px]">↻</span>}
                  </div>
                  <div className="text-stone-600 text-xs mt-0.5">{clientName(job.client_id)}</div>
                  {(formatAddress(job.clients || {}) || job.clients?.address) && <div className="text-stone-400 text-xs mt-0.5">{formatAddress(job.clients || {}) || job.clients?.address}</div>}
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-stone-700">{formatTime(job.start_time, timeFormat)}</div>
                  <div className="text-xs text-stone-400">{job.duration_minutes}min</div>
                </div>
              </div>
              {job.job_assignments?.length > 0 && <div className="flex gap-1 mt-2">{job.job_assignments.map(a => <span key={a.user_id} className="text-xs text-stone-500">{workerName(a.user_id)}</span>)}</div>}
              {/* Property access details for workers */}
              {isWorker && (() => {
                const prop = job.clients?.client_properties?.[0]
                if (!prop) return null
                const items = [
                  prop.alarm_code && { label: t('schedule.property_alarm'), value: prop.alarm_code },
                  prop.key_info && { label: t('schedule.property_key'), value: prop.key_info },
                  prop.parking_instructions && { label: t('schedule.property_parking'), value: prop.parking_instructions },
                  prop.pet_details && { label: t('schedule.property_pets'), value: prop.pet_details },
                  prop.special_notes && { label: t('schedule.property_notes'), value: prop.special_notes },
                ].filter(Boolean)
                if (items.length === 0) return null
                return (
                  <div className="mt-2 p-2 bg-sky-50 border border-sky-200 rounded-lg" onClick={e => e.stopPropagation()}>
                    {items.map(item => (
                      <div key={item.label} className="flex gap-2 text-xs">
                        <span className="font-semibold text-sky-700 shrink-0 w-16">{item.label}</span>
                        <span className="text-sky-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {isToday && (
                <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                  {job.status === 'scheduled' && <button onClick={() => onCheckIn(job, 'arrive')} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">{t('schedule.arrived_btn')}</button>}
                  {job.status === 'in_progress' && <button onClick={() => onCheckIn(job, 'complete')} className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800">{t('schedule.completed_btn')}</button>}
                  {job.arrived_at && <span className="text-xs text-stone-400">Arrived {formatTimestamp(job.arrived_at, tz, timeFormat)}</span>}
                  {job.completed_at && <span className="text-xs text-stone-400">Done {formatTimestamp(job.completed_at, tz, timeFormat)}</span>}
                </div>
              )}
              {job.price && <div className="mt-2 text-xs font-medium text-stone-600">{formatCurrency(job.price, currencySymbol)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared ──

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-[8vh] overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`bg-white rounded-2xl shadow-xl p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  const base = "w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
  if (type === 'textarea') return <div>{label && <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>}<textarea value={value||''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={base + " resize-none"} /></div>
  return <div>{label && <label className="block text-xs font-medium text-stone-500 mb-1.5">{label}</label>}<input type={type} value={value||''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={base} /></div>
}

function InfoRow({ label, value }) {
  if (!value) return null
  return <div className="flex justify-between py-1.5"><span className="text-xs text-stone-400">{label}</span><span className="text-sm text-stone-700">{value}</span></div>
}
