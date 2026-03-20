/**
 * Append an entry to audit_log.
 *
 * @param {object} opts
 * @param {object} opts.supabase       - Supabase client
 * @param {object} opts.user           - Real logged-in user (never impersonated)
 * @param {object|null} opts.adminViewOrg - Org being viewed when admin is scoped (or null)
 * @param {string} opts.action         - 'create' | 'update' | 'delete'
 * @param {string} opts.entityType     - 'client' | 'invoice' | 'user' | 'organization' | etc.
 * @param {string} [opts.entityId]     - UUID of the affected record
 * @param {object} [opts.changes]      - { field: { from, to } } for updates; full record for create/delete
 * @param {object} [opts.metadata]     - Extra context
 */
export async function logAudit({
  supabase,
  user,
  adminViewOrg,
  action,
  entityType,
  entityId,
  changes,
  metadata,
}) {
  const isAdminAction = !!adminViewOrg
  const orgId = adminViewOrg?.id || user?.org_id

  const { error } = await supabase.from('audit_log').insert({
    org_id: orgId,
    user_id: user.id,
    user_name: user.name,
    user_role: user.is_platform_admin ? 'platform_admin' : user.role,
    is_admin_action: isAdminAction,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    changes: changes || null,
    metadata: {
      ...metadata,
      ...(isAdminAction ? { admin_viewing_org: adminViewOrg.name } : {}),
    },
  })

  if (error) {
    // Never throw — audit logging failure should never break the main operation
    console.warn('audit_log insert failed:', error.message)
  }
}
