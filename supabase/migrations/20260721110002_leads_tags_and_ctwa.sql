-- Tags de lead (espelha clients.tags): tag de origem auto-aplicada + tags manuais
-- (incl. designação de filial). ctwa_clid: click id de anúncio click-to-WhatsApp (Meta).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_leads_tags ON public.leads USING gin (tags);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ctwa_clid text;
