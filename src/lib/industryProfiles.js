import { supabase } from './supabase'

// Copy profile service types into an org (skips names that already exist).
// Returns { totalAdded, totalSkipped, perProfile: [{ name, added, skipped }] }
export async function applyProfilesToOrg(orgId, profileIds, profileNameMap = {}) {
  if (!profileIds || profileIds.length === 0) return { totalAdded: 0, totalSkipped: 0, perProfile: [] }

  const [{ data: profileSTs }, { data: existingSTs }] = await Promise.all([
    supabase
      .from('profile_service_types')
      .select('name, description, default_duration_minutes, profile_id')
      .in('profile_id', profileIds)
      .order('sort_order'),
    supabase
      .from('service_types')
      .select('name')
      .eq('org_id', orgId),
  ])

  const existingNames = new Set((existingSTs || []).map(st => st.name.toLowerCase()))

  const perProfile = []
  const seenGlobal = new Set()
  const toInsert = []

  for (const pid of profileIds) {
    const pName = profileNameMap[pid] || pid
    const sts = (profileSTs || []).filter(st => st.profile_id === pid)
    let added = 0
    let skipped = 0

    for (const st of sts) {
      const key = st.name.toLowerCase()
      if (existingNames.has(key) || seenGlobal.has(key)) {
        skipped++
      } else {
        seenGlobal.add(key)
        toInsert.push({
          org_id: orgId,
          name: st.name,
          description: st.description || null,
          default_duration_minutes: st.default_duration_minutes,
          is_active: true,
        })
        added++
      }
    }

    perProfile.push({ name: pName, added, skipped })
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from('service_types').insert(toInsert)
    if (insertErr) throw new Error(`Failed to copy service types: ${insertErr.message}`)
  }

  const records = profileIds.map(pid => ({ org_id: orgId, profile_id: pid }))
  await supabase.from('organization_profiles').upsert(records, { onConflict: 'org_id,profile_id' })

  const totalAdded = toInsert.length
  const totalSkipped = perProfile.reduce((s, p) => s + p.skipped, 0)
  return { totalAdded, totalSkipped, perProfile }
}

export function buildApplyToast({ totalAdded, totalSkipped, perProfile }) {
  const parts = perProfile
    .filter(p => p.added > 0)
    .map(p => `${p.added} from ${p.name}`)
  let msg = parts.length > 0
    ? `Added ${parts.join(', ')}.`
    : 'No new service types to add.'
  if (totalSkipped > 0) msg += ` ${totalSkipped} already existed and were skipped.`
  return msg
}
