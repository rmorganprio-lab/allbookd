-- Unique constraint enables upsert (ON CONFLICT DO UPDATE) for pricing matrix imports
ALTER TABLE pricing_matrix
  ADD CONSTRAINT pricing_matrix_unique_combination
  UNIQUE (org_id, service_type_id, bedrooms, bathrooms, frequency);
