import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { useAdminOrg } from '../../contexts/AdminOrgContext'
import { logAudit } from '../../lib/auditLog'
import { ADD_ONS } from '../../lib/tiers'
import { US_TIMEZONES } from '../../lib/timezone'
import PricingImport from '../../components/PricingImport'
import { applyProfilesToOrg, buildApplyToast } from '../../lib/industryProfiles'

// ─── Constants ────────────────────────────────────────────────

const FREQUENCIES = [
  { value: 'one_time',  label: 'One-time' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly',  label: 'Monthly' },
]
const BED_OPTIONS  = [1, 2, 3, 4, 5]
const BATH_OPTIONS = [1, 2, 3, 4]

const INPUT = 'w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600'
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// ─── Shared UI ────────────────────────────────────────────────

function TierBadge({ tier }) {
  const cls = {
    essentials: 'bg-stone-100 text-stone-600',
    pro:        'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls[tier] || 'bg-stone-100 text-stone-600'}`}>
      {tier}
    </span>
  )
}

function SectionCard({ title, children, action }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-stone-700">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function ConfirmModal({ title, message, onConfirm, onCancel, danger = true }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="font-bold text-stone-900 mb-2">{title}</h3>
        <p className="text-stone-500 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 border border-stone-200 rounded-xl text-stone-600 text-sm hover:bg-stone-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-white text-sm font-medium ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-700 hover:bg-emerald-800'}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add User Modal ───────────────────────────────────────────

function AddUserModal({ orgId, onClose, onAdded, adminUser }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'worker' })
  const [loading, setLoading] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const newId = crypto.randomUUID()
    const { error } = await supabase.from('users').insert({
      id:          newId,
      name:        form.name.trim(),
      email:       form.email.trim().toLowerCase(),
      phone:       form.phone.trim() || null,
      role:        form.role,
      org_id:      orgId,
      auth_linked: false,
    })
    if (error) { showToast(error.message, 'error'); setLoading(false); return }
    showToast('User added')
    if (adminUser) {
      await logAudit({ supabase, user: adminUser, action: 'create', entityType: 'user', entityId: newId, changes: { name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, org_id: orgId }, metadata: { source: 'admin_panel' } })
    }
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100">
          <h3 className="font-bold text-stone-900">Add User</h3>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <input required placeholder="Name" value={form.name} onChange={e => set('name', e.target.value)} className={INPUT} />
          <input required type="email" placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} className={INPUT} />
          <input type="tel" placeholder="Phone (optional)" value={form.phone} onChange={e => set('phone', e.target.value)} className={INPUT} />
          <select value={form.role} onChange={e => set('role', e.target.value)} className={INPUT}>
            <option value="ceo">Owner (CEO)</option>
            <option value="manager">Manager</option>
            <option value="worker">Worker</option>
          </select>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-stone-200 rounded-xl text-stone-600 text-sm hover:bg-stone-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50">
              {loading ? 'Adding…' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function AdminOrgDetail({ user: adminUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { setAdminViewOrg } = useAdminOrg()

  const [org, setOrg]         = useState(null)
  const [loading, setLoading] = useState(true)

  // Org form state
  const [form, setFormState] = useState(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [saving, setSaving]   = useState(false)

  // Users state
  const [users, setUsers]             = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [showAddUser, setShowAddUser] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(null)

  // Service types state
  const [stList, setStList]           = useState([])
  const [stForm, setStForm]           = useState({ name: '', default_duration_minutes: 120 })
  const [stEditing, setStEditing]     = useState(null)
  const [stEditForm, setStEditForm]   = useState({})
  const [stSaving, setStSaving]       = useState(false)

  // Pricing matrix state
  const [pmServiceTypes, setPmServiceTypes]           = useState([])
  const [selectedServiceType, setSelectedServiceType] = useState(null)
  const [selectedFrequency, setSelectedFrequency]     = useState('one_time')
  const [pricingData, setPricingData]                 = useState({})
  const [pricingLoaded, setPricingLoaded]             = useState(false)
  const [pricingSaving, setPricingSaving]             = useState(false)
  const [showPricingImport, setShowPricingImport]     = useState(false)

  useEffect(() => { fetchOrg() }, [id])

  async function fetchOrg() {
    setLoading(true)
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) {
      showToast('Organization not found.', 'error')
      navigate('/admin/orgs')
      return
    }
    setOrg(data)
    setFormState({
      name:               data.name,
      slug:               data.slug || '',
      tier:               data.subscription_tier,
      status:             data.subscription_status,
      addOns:             data.add_ons || [],
      isFoundingCustomer: data.is_founding_customer,
      trialEndsAt:        data.trial_ends_at ? data.trial_ends_at.slice(0, 10) : '',
      timezone:           data.settings?.timezone || 'America/Los_Angeles',
      timeFormat:         data.settings?.time_format || '12h',
    })
    setLoading(false)
    fetchUsers()
    loadServiceTypes()
  }

  function setField(k, v) {
    setFormState(p => {
      const next = { ...p, [k]: v }
      if (k === 'name' && !slugEdited) {
        next.slug = v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      }
      return next
    })
  }

  function toggleAddOn(slug) {
    setFormState(p => ({
      ...p,
      addOns: p.addOns.includes(slug) ? p.addOns.filter(a => a !== slug) : [...p.addOns, slug],
    }))
  }

  async function saveOrg() {
    setSaving(true)
    const changes = {}
    if (form.name.trim() !== org.name) changes.name = { from: org.name, to: form.name.trim() }
    if (form.tier !== org.subscription_tier) changes.subscription_tier = { from: org.subscription_tier, to: form.tier }
    if (form.status !== org.subscription_status) changes.subscription_status = { from: org.subscription_status, to: form.status }

    const { error } = await supabase.from('organizations').update({
      name:                 form.name.trim(),
      slug:                 form.slug,
      subscription_tier:   form.tier,
      subscription_status: form.status,
      add_ons:             form.addOns,
      is_founding_customer: form.isFoundingCustomer,
      trial_ends_at:       form.trialEndsAt || null,
      settings: {
        ...(org.settings || {}),
        timezone:    form.timezone,
        time_format: form.timeFormat,
      },
    }).eq('id', id)

    if (error) {
      showToast('Failed to save changes. Please try again.', 'error')
    } else {
      showToast('Organization saved')
      if (Object.keys(changes).length > 0 && adminUser) {
        await logAudit({ supabase, user: adminUser, action: 'update', entityType: 'organization', entityId: id, changes, metadata: { source: 'admin_panel' } })
      }
      fetchOrg()
    }
    setSaving(false)
  }

  // ─── Users ───────────────────────────────────────────────────

  async function fetchUsers() {
    setUsersLoading(true)
    const { data } = await supabase.from('users').select('*').eq('org_id', id).order('name')
    setUsers(data || [])
    setUsersLoading(false)
  }

  async function changeRole(userId, newRole) {
    const oldUser = users.find(u => u.id === userId)
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
    if (error) {
      showToast('Failed to update role.', 'error')
    } else {
      showToast('Role updated')
      if (adminUser) {
        await logAudit({ supabase, user: adminUser, action: 'update', entityType: 'user', entityId: userId, changes: { role: { from: oldUser?.role, to: newRole } }, metadata: { source: 'admin_panel', org_id: id } })
      }
      fetchUsers()
    }
  }

  async function removeUser(userId) {
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (error) {
      showToast('Failed to remove user.', 'error')
    } else {
      showToast('User removed')
      fetchUsers()
    }
    setRemoveConfirm(null)
  }

  // ─── Service Types ────────────────────────────────────────────

  async function loadServiceTypes() {
    const { data } = await supabase
      .from('service_types')
      .select('id, name, description, default_duration_minutes, is_active')
      .eq('org_id', id)
      .order('name')
    setStList(data || [])
    const active = (data || []).filter(t => t.is_active)
    setPmServiceTypes(active)
    if (active.length > 0) setSelectedServiceType(prev => prev || active[0].id)
  }

  async function addServiceType() {
    if (!stForm.name.trim()) return
    setStSaving(true)
    const { error } = await supabase.from('service_types').insert({
      org_id:                   id,
      name:                     stForm.name.trim(),
      default_duration_minutes: Number(stForm.default_duration_minutes) || 120,
    })
    if (error) { showToast('Failed to add service type.', 'error') }
    else { setStForm({ name: '', default_duration_minutes: 120 }); await loadServiceTypes() }
    setStSaving(false)
  }

  async function saveEditServiceType(stId) {
    if (!stEditForm.name?.trim()) return
    setStSaving(true)
    const { error } = await supabase.from('service_types').update({
      name:                     stEditForm.name.trim(),
      description:              stEditForm.description?.trim() || null,
      default_duration_minutes: Number(stEditForm.default_duration_minutes) || 120,
    }).eq('id', stId)
    if (error) { showToast('Failed to update service type.', 'error') }
    else { setStEditing(null); await loadServiceTypes() }
    setStSaving(false)
  }

  async function toggleServiceTypeActive(st) {
    const { error } = await supabase.from('service_types').update({ is_active: !st.is_active }).eq('id', st.id)
    if (error) { showToast('Failed to update service type.', 'error') }
    else { await loadServiceTypes() }
  }

  async function deleteServiceType(stId) {
    const { error } = await supabase.from('service_types').delete().eq('id', stId)
    if (error) { showToast('Failed to delete service type. It may be in use.', 'error') }
    else { await loadServiceTypes() }
  }

  // ─── Pricing Matrix ───────────────────────────────────────────

  async function loadPricing() {
    const { data } = await supabase.from('pricing_matrix').select('*').eq('org_id', id)
    const map = {}
    for (const row of data || []) {
      map[`${row.service_type_id}:${row.frequency}:${row.bedrooms}:${row.bathrooms}`] = String(row.price)
    }
    setPricingData(map)
    setPricingLoaded(true)
  }

  function getPricingValue(stId, freq, beds, baths) {
    return pricingData[`${stId}:${freq}:${beds}:${baths}`] || ''
  }

  function updatePricingValue(stId, freq, beds, baths, val) {
    setPricingData(prev => ({ ...prev, [`${stId}:${freq}:${beds}:${baths}`]: val }))
  }

  async function savePricing() {
    if (!selectedServiceType) return
    setPricingSaving(true)
    const rows = []
    for (const { value: freq } of FREQUENCIES) {
      for (const beds of BED_OPTIONS) {
        for (const baths of BATH_OPTIONS) {
          const val = getPricingValue(selectedServiceType, freq, beds, baths)
          if (val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
            rows.push({ org_id: id, service_type_id: selectedServiceType, bedrooms: beds, bathrooms: baths, frequency: freq, price: Number(val) })
          }
        }
      }
    }
    await supabase.from('pricing_matrix').delete().eq('org_id', id).eq('service_type_id', selectedServiceType)
    if (rows.length > 0) {
      const { error } = await supabase.from('pricing_matrix').insert(rows)
      if (error) { showToast('Failed to save pricing.', 'error'); setPricingSaving(false); return }
    }
    showToast(`Pricing saved — ${rows.length} price${rows.length !== 1 ? 's' : ''} set`)
    setPricingSaving(false)
  }

  useEffect(() => {
    if (pmServiceTypes.length > 0) loadPricing()
  }, [pmServiceTypes])

  if (loading || !form) {
    return <div className="p-8 text-stone-400 text-sm">Loading…</div>
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link to="/admin/orgs" className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 mb-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            All organizations
          </Link>
          <h1 className="text-2xl font-bold text-stone-900">{org.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <TierBadge tier={org.subscription_tier} />
            <span className="text-stone-400 text-xs">·</span>
            <span className="text-xs text-stone-400">Created {fmtDate(org.created_at)}</span>
          </div>
        </div>
        <button
          onClick={() => { setAdminViewOrg(org); navigate('/') }}
          className="flex-shrink-0 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600"
        >
          View As This Org
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT COLUMN ─── */}
        <div className="space-y-6">

          {/* Organization Settings */}
          <SectionCard title="Organization Settings">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Business name</label>
                <input value={form.name} onChange={e => setField('name', e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Slug</label>
                <input
                  value={form.slug}
                  onChange={e => {
                    setSlugEdited(true)
                    setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-'))
                  }}
                  placeholder="org-slug"
                  className={INPUT}
                />
                {form.slug && (
                  <p className="text-xs text-stone-400 mt-1">
                    Booking URL: <span className="font-mono text-stone-600">timelyops.com/book/{form.slug}</span>
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Timezone</label>
                  <select value={form.timezone} onChange={e => setField('timezone', e.target.value)} className={INPUT}>
                    {US_TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Time format</label>
                  <select value={form.timeFormat} onChange={e => setField('timeFormat', e.target.value)} className={INPUT}>
                    <option value="12h">12-hour</option>
                    <option value="24h">24-hour</option>
                  </select>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Subscription */}
          <SectionCard title="Subscription">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Tier</label>
                  <select value={form.tier} onChange={e => setField('tier', e.target.value)} className={INPUT}>
                    <option value="essentials">Essentials ($99/mo)</option>
                    <option value="pro">Pro ($149/mo)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Status</label>
                  <select value={form.status} onChange={e => setField('status', e.target.value)} className={INPUT}>
                    <option value="active">Active</option>
                    <option value="trialing">Trialing</option>
                    <option value="past_due">Past Due</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              {form.status === 'trialing' && (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Trial ends at</label>
                  <input type="date" value={form.trialEndsAt} onChange={e => setField('trialEndsAt', e.target.value)} className={INPUT} />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isFoundingCustomer} onChange={e => setField('isFoundingCustomer', e.target.checked)} className="w-4 h-4 rounded accent-emerald-700" />
                <span className="text-sm text-stone-700">Founding customer</span>
              </label>
              <div>
                <label className="block text-xs text-stone-500 mb-2">Add-ons</label>
                <div className="space-y-1.5">
                  {Object.entries(ADD_ONS).map(([slug, addon]) => (
                    <label key={slug} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.addOns.includes(slug)} onChange={() => toggleAddOn(slug)} className="w-4 h-4 rounded accent-emerald-700" />
                      <span className="text-sm text-stone-700">{addon.name}</span>
                      <span className="text-xs text-stone-400">${addon.price}/mo</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={saveOrg}
              disabled={saving}
              className="mt-4 w-full py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </SectionCard>

          {/* Meta */}
          <SectionCard title="Info">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-400">Org ID</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(org.id); showToast('Copied') }}
                  className="font-mono text-stone-500 hover:text-stone-800"
                >
                  {org.id.slice(0, 8)}…
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Created</span>
                <span className="text-stone-600">{fmtDate(org.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Slug</span>
                <span className="font-mono text-stone-500">{org.slug || '—'}</span>
              </div>
            </div>
          </SectionCard>

        </div>

        {/* ── RIGHT COLUMN ─── */}
        <div className="space-y-6">

          {/* Users */}
          <SectionCard
            title={`Users (${users.length})`}
            action={
              <button
                onClick={() => setShowAddUser(true)}
                className="text-xs text-emerald-700 font-medium hover:underline"
              >
                + Add User
              </button>
            }
          >
            {usersLoading ? (
              <p className="text-sm text-stone-400">Loading…</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-stone-400">No users in this org.</p>
            ) : (
              <div className="divide-y divide-stone-50">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-2 py-2.5">
                    <div className="flex-1 min-w-0">
                      <Link to={`/admin/users/${u.id}`} className="text-sm font-medium text-stone-800 hover:text-emerald-700 truncate block">
                        {u.name || '—'}
                      </Link>
                      <div className="text-xs text-stone-400 truncate">{u.email || u.phone || '—'}</div>
                    </div>
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="text-xs border border-stone-200 rounded-lg px-2 py-1 bg-white text-stone-700 focus:outline-none"
                    >
                      <option value="ceo">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="worker">Worker</option>
                    </select>
                    <button
                      onClick={() => setRemoveConfirm({ userId: u.id, userName: u.name })}
                      className="p-1 text-stone-300 hover:text-red-500 rounded flex-shrink-0"
                      title="Remove user"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Service Types */}
          <SectionCard title="Service Types">
            <div className="space-y-1.5 mb-3">
              {stList.length === 0 && (
                <p className="text-xs text-stone-400">No service types yet.</p>
              )}
              {stList.map(st => (
                <div key={st.id} className={`border rounded-lg overflow-hidden ${stEditing === st.id ? 'border-emerald-200' : 'border-stone-100'}`}>
                  {stEditing === st.id ? (
                    <div className="p-2 space-y-1.5">
                      <input
                        autoFocus
                        className="w-full px-2 py-1 border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                        value={stEditForm.name}
                        onChange={e => setStEditForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Name"
                      />
                      <input
                        className="w-full px-2 py-1 border border-stone-200 rounded-lg text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                        value={stEditForm.description || ''}
                        onChange={e => setStEditForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Description (optional)"
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min="15" step="15"
                          className="w-16 px-2 py-1 border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                          value={stEditForm.default_duration_minutes}
                          onChange={e => setStEditForm(p => ({ ...p, default_duration_minutes: e.target.value }))}
                        />
                        <span className="text-[10px] text-stone-400">min</span>
                        <div className="flex gap-1 ml-auto">
                          <button onClick={() => saveEditServiceType(st.id)} disabled={stSaving} className="px-2 py-1 bg-emerald-700 text-white text-xs rounded-lg hover:bg-emerald-800 disabled:opacity-50">Save</button>
                          <button onClick={() => setStEditing(null)} className="px-2 py-1 border border-stone-200 text-stone-600 text-xs rounded-lg hover:bg-stone-50">Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-2">
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${st.is_active ? 'text-stone-800' : 'text-stone-400 line-through'}`}>{st.name}</span>
                        <span className="text-[10px] text-stone-400 ml-1.5">{st.default_duration_minutes}m</span>
                        {st.description && <div className="text-[10px] text-stone-400 truncate">{st.description}</div>}
                      </div>
                      <button
                        onClick={() => toggleServiceTypeActive(st)}
                        className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium ${st.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                      >
                        {st.is_active ? 'Active' : 'Off'}
                      </button>
                      <button
                        onClick={() => { setStEditing(st.id); setStEditForm({ name: st.name, description: st.description || '', default_duration_minutes: st.default_duration_minutes }) }}
                        className="flex-shrink-0 p-1 text-stone-400 hover:text-stone-600 rounded hover:bg-stone-50"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button
                        onClick={() => deleteServiceType(st.id)}
                        className="flex-shrink-0 p-1 text-stone-400 hover:text-red-500 rounded hover:bg-red-50"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                className="flex-1 px-2 py-1.5 border border-stone-200 rounded-lg text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                placeholder="New service type name"
                value={stForm.name}
                onChange={e => setStForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addServiceType() }}
              />
              <input
                type="number" min="15" step="15"
                className="w-16 px-2 py-1.5 border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                placeholder="120m"
                value={stForm.default_duration_minutes}
                onChange={e => setStForm(p => ({ ...p, default_duration_minutes: e.target.value }))}
              />
              <button
                onClick={addServiceType}
                disabled={stSaving || !stForm.name.trim()}
                className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </SectionCard>

          {/* Pricing Matrix */}
          <SectionCard title="Pricing Matrix">
            {pmServiceTypes.length === 0 ? (
              <p className="text-sm text-stone-400">No active service types. Add at least one above to set pricing.</p>
            ) : (
              <>
                {/* Service type tabs */}
                {pmServiceTypes.length > 1 && (
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {pmServiceTypes.map(st => (
                      <button
                        key={st.id}
                        onClick={() => setSelectedServiceType(st.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          selectedServiceType === st.id
                            ? 'bg-emerald-700 text-white'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        {st.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Frequency tabs */}
                <div className="flex gap-1 mb-3 flex-wrap">
                  {FREQUENCIES.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setSelectedFrequency(f.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        selectedFrequency === f.value
                          ? 'bg-stone-800 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Price grid */}
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr>
                        <th className="pb-2 pr-3 text-stone-400 font-medium text-left">Beds\Baths</th>
                        {BATH_OPTIONS.map(b => (
                          <th key={b} className="pb-2 px-1 text-stone-400 font-medium text-center">{b}ba</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {BED_OPTIONS.map(beds => (
                        <tr key={beds}>
                          <td className="py-1 pr-3 text-stone-500 font-medium">{beds}bd</td>
                          {BATH_OPTIONS.map(baths => (
                            <td key={baths} className="py-1 px-1">
                              <div className="relative">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs pointer-events-none">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="5"
                                  placeholder="—"
                                  value={getPricingValue(selectedServiceType, selectedFrequency, beds, baths)}
                                  onChange={e => updatePricingValue(selectedServiceType, selectedFrequency, beds, baths, e.target.value)}
                                  className="w-16 pl-4 pr-1 py-1 border border-stone-200 rounded-lg text-xs text-stone-800 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-emerald-600 text-right"
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={savePricing}
                    disabled={pricingSaving}
                    className="flex-1 py-2 bg-emerald-700 text-white text-xs font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {pricingSaving ? 'Saving…' : 'Save Pricing'}
                  </button>
                  <button
                    onClick={() => setShowPricingImport(true)}
                    className="flex-1 py-2 border border-stone-200 text-stone-600 text-xs font-medium rounded-xl hover:bg-stone-50 flex items-center justify-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Import CSV
                  </button>
                </div>
              </>
            )}
          </SectionCard>

        </div>
      </div>

      {/* Modals */}

      {showAddUser && (
        <AddUserModal
          orgId={id}
          onClose={() => setShowAddUser(false)}
          onAdded={() => { setShowAddUser(false); fetchUsers() }}
          adminUser={adminUser}
        />
      )}

      {removeConfirm && (
        <ConfirmModal
          title="Remove user"
          message={`Remove ${removeConfirm.userName} from this org? This cannot be undone.`}
          onConfirm={() => removeUser(removeConfirm.userId)}
          onCancel={() => setRemoveConfirm(null)}
        />
      )}

      {showPricingImport && (
        <PricingImport
          orgId={id}
          serviceTypes={pmServiceTypes}
          orgName={org.name}
          onClose={() => setShowPricingImport(false)}
          onImported={() => { setShowPricingImport(false); loadPricing() }}
        />
      )}
    </div>
  )
}
