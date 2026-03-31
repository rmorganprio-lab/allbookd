import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { logAudit } from '../../lib/auditLog'

const INPUT = 'w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600'
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

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

export default function AdminUserDetail({ user: adminUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [userData, setUserData]         = useState(null)
  const [loading, setLoading]           = useState(true)
  const [orgs, setOrgs]                 = useState([])
  const [saving, setSaving]             = useState(false)
  const [isPlatformAdmin, setIsAdmin]   = useState(false)
  const [confirm, setConfirm]           = useState(null) // 'toggleAdmin' | { type: 'reassignOrg', orgName }

  const [form, setFormState] = useState({
    name:  '',
    email: '',
    phone: '',
    orgId: '',
    role:  'worker',
  })

  useEffect(() => { fetchUser(); fetchOrgs() }, [id])

  async function fetchUser() {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('*, organizations(*)')
      .eq('id', id)
      .single()
    if (error || !data) {
      showToast('User not found.', 'error')
      navigate('/admin/users')
      return
    }
    setUserData(data)
    setIsAdmin(data.is_platform_admin)
    setFormState({
      name:  data.name  || '',
      email: data.email || '',
      phone: data.phone || '',
      orgId: data.org_id || '',
      role:  data.role  || 'worker',
    })
    setLoading(false)
  }

  async function fetchOrgs() {
    const { data } = await supabase.from('organizations').select('id, name').order('name')
    setOrgs(data || [])
  }

  function setField(k, v) { setFormState(p => ({ ...p, [k]: v })) }

  const emailChanged = userData ? form.email.trim() !== (userData.email || '') : false
  const phoneChanged = userData ? form.phone.trim() !== (userData.phone || '') : false
  const orgChanged   = userData ? form.orgId !== (userData.org_id || '') : false

  async function saveChanges() {
    setSaving(true)

    // Update auth.users credentials if auth-linked and changed
    if (userData?.auth_linked && (emailChanged || phoneChanged)) {
      const body = { auth_user_id: id }
      if (emailChanged) body.email = form.email.trim().toLowerCase() || null
      if (phoneChanged) body.phone = form.phone.trim() || null
      const { error: fnError } = await supabase.functions.invoke('admin-update-auth-user', { body })
      if (fnError) {
        showToast('Failed to update login credentials: ' + fnError.message, 'error')
        setSaving(false)
        setConfirm(null)
        return
      }
    }

    const { error } = await supabase.from('users').update({
      name:   form.name.trim(),
      email:  form.email.trim().toLowerCase() || null,
      phone:  form.phone.trim() || null,
      org_id: form.orgId || null,
      role:   form.role,
    }).eq('id', id)

    if (error) {
      showToast(error.message, 'error')
    } else {
      showToast('User saved')
      const changes = {}
      if (form.role !== userData.role) changes.role = { from: userData.role, to: form.role }
      if (emailChanged) changes.email = { from: userData.email, to: form.email.trim().toLowerCase() }
      if (phoneChanged) changes.phone = { from: userData.phone, to: form.phone.trim() }
      if (orgChanged)   changes.org_id = { from: userData.org_id, to: form.orgId }
      if (Object.keys(changes).length > 0 && adminUser) {
        await logAudit({ supabase, user: adminUser, action: 'update', entityType: 'user', entityId: id, changes, metadata: { source: 'admin_panel' } })
      }
      fetchUser()
    }
    setSaving(false)
    setConfirm(null)
  }

  function handleSave() {
    if (orgChanged) {
      const orgName = orgs.find(o => o.id === form.orgId)?.name || 'new org'
      setConfirm({ type: 'reassignOrg', orgName })
    } else {
      saveChanges()
    }
  }

  async function togglePlatformAdmin() {
    const newVal = !isPlatformAdmin
    const { error } = await supabase.from('users').update({ is_platform_admin: newVal }).eq('id', id)
    if (error) {
      showToast(error.message, 'error')
    } else {
      setIsAdmin(newVal)
      showToast(newVal ? 'Platform admin granted' : 'Platform admin revoked')
      if (adminUser) {
        await logAudit({ supabase, user: adminUser, action: 'update', entityType: 'user', entityId: id, changes: { is_platform_admin: { from: !newVal, to: newVal } }, metadata: { source: 'admin_panel' } })
      }
    }
    setConfirm(null)
  }

  if (loading) return <div className="p-8 text-stone-400 text-sm">Loading…</div>

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link to="/admin/users" className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 mb-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          All users
        </Link>
        <h1 className="text-2xl font-bold text-stone-900">{userData.name || 'User'}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-stone-500 capitalize">{userData.role}</span>
          {userData.organizations?.name && (
            <>
              <span className="text-stone-300">·</span>
              <Link to={`/admin/orgs/${userData.org_id}`} className="text-xs text-emerald-700 hover:underline">
                {userData.organizations.name}
              </Link>
            </>
          )}
          {isPlatformAdmin && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">platform admin</span>
          )}
        </div>
      </div>

      <div className="space-y-6">

        {/* Profile */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Profile</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Name</label>
              <input value={form.name} onChange={e => setField('name', e.target.value)} className={INPUT} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} className={INPUT} placeholder="email@example.com" />
              {emailChanged && userData?.auth_linked && (
                <p className="text-xs text-amber-600 mt-1">This will also update their login email.</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} className={INPUT} placeholder="+1 650 000 0000" />
              {phoneChanged && userData?.auth_linked && (
                <p className="text-xs text-amber-600 mt-1">This will also update their login phone.</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Organization</label>
              <select value={form.orgId} onChange={e => setField('orgId', e.target.value)} className={INPUT}>
                <option value="">— No organization —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Role</label>
              <select value={form.role} onChange={e => setField('role', e.target.value)} className={INPUT}>
                <option value="ceo">Owner (CEO)</option>
                <option value="manager">Manager</option>
                <option value="worker">Worker</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Platform Admin */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-700">Platform Admin</p>
              <p className="text-xs text-stone-400 mt-0.5">Full access to all organizations and admin tools</p>
            </div>
            <button
              onClick={() => setConfirm('toggleAdmin')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPlatformAdmin ? 'bg-emerald-700' : 'bg-stone-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPlatformAdmin ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Info</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-stone-400">User ID</span>
              <button
                onClick={() => { navigator.clipboard.writeText(userData.id); showToast('Copied') }}
                className="font-mono text-stone-500 hover:text-stone-800"
              >
                {userData.id.slice(0, 8)}…
              </button>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Created</span>
              <span className="text-stone-600">{fmtDate(userData.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-400">Auth linked</span>
              <span className={userData.auth_linked ? 'text-emerald-700' : 'text-stone-400'}>
                {userData.auth_linked ? 'Yes' : 'No — pending first login'}
              </span>
            </div>
            {userData.organizations && (
              <div className="flex justify-between">
                <span className="text-stone-400">Organization</span>
                <Link to={`/admin/orgs/${userData.org_id}`} className="text-emerald-700 hover:underline">
                  {userData.organizations.name}
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modals */}

      {confirm === 'toggleAdmin' && (
        <ConfirmModal
          title={isPlatformAdmin ? 'Revoke platform admin?' : 'Grant platform admin?'}
          message={
            isPlatformAdmin
              ? `${userData.name || 'This user'} will lose full platform access.`
              : `This gives ${userData.name || 'this user'} full access to ALL organizations and platform settings. Only do this for yourself or trusted team members.`
          }
          danger={!isPlatformAdmin}
          onConfirm={togglePlatformAdmin}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.type === 'reassignOrg' && (
        <ConfirmModal
          title="Reassign organization?"
          message={`Move ${userData.name || 'this user'} to ${confirm.orgName}? They will lose access to their current org's data.`}
          danger={false}
          onConfirm={saveChanges}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
