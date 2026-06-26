ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS general_anamnesis JSONB;
