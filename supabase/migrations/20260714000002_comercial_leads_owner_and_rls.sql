-- Fase 2 — COMERCIAL no CRM: dono do lead + RLS de leitura de rede.
-- (Aplicado no remoto via MCP. Padrão real do banco usa public.jwt_claim, NÃO auth.jwt_claim.)

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.users(id);
CREATE INDEX IF NOT EXISTS leads_owner_id_idx ON public.leads(owner_id);

create policy "Comercial le leads da rede" on public.leads
  for select using (
    tenant_id::text = jwt_claim('tenant_id')
    and jwt_claim('role') in ('COMERCIAL','GERENTE_COMERCIAL')
  );

create policy "Comercial ve filiais da rede" on public.branches
  for select using (
    tenant_id::text = jwt_claim('tenant_id')
    and jwt_claim('role') in ('COMERCIAL','GERENTE_COMERCIAL')
  );

create policy "Comercial le conversas da rede" on public.conversations
  for select using (
    tenant_id::text = jwt_claim('tenant_id')
    and jwt_claim('role') in ('COMERCIAL','GERENTE_COMERCIAL')
  );
