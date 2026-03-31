-- ============================================================
-- Migration: platform_admin_rls
-- 2026-03-31
--
-- Creates the is_platform_admin() SECURITY DEFINER function and
-- adds platform admin bypass RLS policies to all tables.
--
-- Without the SECURITY DEFINER function, a platform admin policy
-- that does EXISTS (SELECT 1 FROM users WHERE ... AND is_platform_admin = true)
-- can cause infinite recursion when RLS on the users table is active.
-- The function runs with the definer's privileges, bypassing RLS on
-- the users lookup, which breaks the recursion cycle.
-- ============================================================


-- ============================================================
-- SECTION 1: SECURITY DEFINER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM users WHERE id = auth.uid()),
    false
  )
$$;


-- ============================================================
-- SECTION 2: UPDATE EXISTING PLATFORM ADMIN POLICIES
--
-- Three tables already have platform admin policies using a direct
-- table lookup. Replace them with the SECURITY DEFINER function call.
-- ============================================================

-- org_sequences (created in 20260325140000)
DROP POLICY IF EXISTS "org_sequences_platform_admin" ON org_sequences;
CREATE POLICY "org_sequences_platform_admin" ON org_sequences
  FOR ALL USING (is_platform_admin());

-- credit_notes (created in 20260325140000)
DROP POLICY IF EXISTS "credit_notes_platform_admin" ON credit_notes;
CREATE POLICY "credit_notes_platform_admin" ON credit_notes
  FOR ALL USING (is_platform_admin());

-- booking_conversations (created in 20260325160000)
DROP POLICY IF EXISTS "booking_conversations_platform_admin" ON booking_conversations;
CREATE POLICY "booking_conversations_platform_admin" ON booking_conversations
  FOR ALL USING (is_platform_admin());


-- ============================================================
-- SECTION 3: ADD PLATFORM ADMIN BYPASS TO ALL REMAINING TABLES
--
-- Every table with RLS gets a "FOR ALL" policy that allows platform
-- admins through. These are additive — existing org-scoped policies
-- remain in place for normal users.
-- ============================================================

-- organizations
CREATE POLICY "organizations_platform_admin" ON organizations
  FOR ALL USING (is_platform_admin());

-- users
CREATE POLICY "users_platform_admin" ON users
  FOR ALL USING (is_platform_admin());

-- clients
CREATE POLICY "clients_platform_admin" ON clients
  FOR ALL USING (is_platform_admin());

-- client_properties
CREATE POLICY "client_properties_platform_admin" ON client_properties
  FOR ALL USING (is_platform_admin());

-- service_types
CREATE POLICY "service_types_platform_admin" ON service_types
  FOR ALL USING (is_platform_admin());

-- pricing_matrix
CREATE POLICY "pricing_matrix_platform_admin" ON pricing_matrix
  FOR ALL USING (is_platform_admin());

-- quotes
CREATE POLICY "quotes_platform_admin" ON quotes
  FOR ALL USING (is_platform_admin());

-- quote_line_items
CREATE POLICY "quote_line_items_platform_admin" ON quote_line_items
  FOR ALL USING (is_platform_admin());

-- jobs
CREATE POLICY "jobs_platform_admin" ON jobs
  FOR ALL USING (is_platform_admin());

-- job_assignments
CREATE POLICY "job_assignments_platform_admin" ON job_assignments
  FOR ALL USING (is_platform_admin());

-- invoices
CREATE POLICY "invoices_platform_admin" ON invoices
  FOR ALL USING (is_platform_admin());

-- invoice_line_items
CREATE POLICY "invoice_line_items_platform_admin" ON invoice_line_items
  FOR ALL USING (is_platform_admin());

-- payments
CREATE POLICY "payments_platform_admin" ON payments
  FOR ALL USING (is_platform_admin());

-- client_timeline
CREATE POLICY "client_timeline_platform_admin" ON client_timeline
  FOR ALL USING (is_platform_admin());

-- leads
CREATE POLICY "leads_platform_admin" ON leads
  FOR ALL USING (is_platform_admin());

-- audit_log
CREATE POLICY "audit_log_platform_admin" ON audit_log
  FOR ALL USING (is_platform_admin());

-- email_log
CREATE POLICY "email_log_platform_admin" ON email_log
  FOR ALL USING (is_platform_admin());

-- industry_profiles
CREATE POLICY "industry_profiles_platform_admin" ON industry_profiles
  FOR ALL USING (is_platform_admin());

-- profile_service_types
CREATE POLICY "profile_service_types_platform_admin" ON profile_service_types
  FOR ALL USING (is_platform_admin());

-- organization_profiles
CREATE POLICY "organization_profiles_platform_admin" ON organization_profiles
  FOR ALL USING (is_platform_admin());
