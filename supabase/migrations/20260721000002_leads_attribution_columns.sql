-- Colunas de atribuição de marketing referenciadas por actions/leads.ts
-- (createLead insert + convertLeadToClient select) mas ausentes no banco clonado.
-- Sem elas, QUALQUER criação de lead falha com
-- "Could not find the 'fbclid' column of 'leads' in the schema cache".
-- Todas nullable: vêm de campos ocultos preenchidos por URL (anúncios);
-- na criação manual ficam null.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fbclid       text,
  ADD COLUMN IF NOT EXISTS gclid        text,
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text;
