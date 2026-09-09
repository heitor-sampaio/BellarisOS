-- Pedido de acesso aos dados pessoais (LGPD art. 18).
--
-- A tabela `lgpd_requests` existia desde o schema inicial e nunca teve uso no
-- código: guardava client_id/type/status e nada mais — sem onde registrar o
-- resultado, sem escopo de tenant e sem como tratar a parte clínica.
--
-- Regra de produto: o pacote base (cadastro, agenda, financeiro, fidelidade,
-- comunicações) é gerado automaticamente; anamnese, evolução, termos e fotos
-- só entram se alguém da equipe com permissão de prontuário liberar o pedido.

alter table public.lgpd_requests
  add column if not exists tenant_id           uuid references public.tenants(id),
  add column if not exists include_medical     boolean     not null default false,
  add column if not exists medical_status      text        not null default 'not_requested',
  add column if not exists medical_reviewed_by uuid        references public.users(id),
  add column if not exists medical_reviewed_at timestamptz,
  add column if not exists export_json_path    text,
  add column if not exists export_pdf_path     text,
  add column if not exists expires_at          timestamptz,
  add column if not exists error_message       text,
  add column if not exists updated_at          timestamptz not null default now();

update public.lgpd_requests r
   set tenant_id = c.tenant_id
  from public.clients c
 where c.id = r.client_id and r.tenant_id is null;

alter table public.lgpd_requests
  add constraint lgpd_requests_type_check
  check (type in ('export', 'delete'));

alter table public.lgpd_requests
  add constraint lgpd_requests_status_check
  check (status in ('pending', 'processing', 'completed', 'failed'));

alter table public.lgpd_requests
  add constraint lgpd_requests_medical_status_check
  check (medical_status in ('not_requested', 'pending', 'approved', 'denied'));

create index if not exists idx_lgpd_requests_status on public.lgpd_requests(status, requested_at);
create index if not exists idx_lgpd_requests_tenant on public.lgpd_requests(tenant_id, requested_at desc);
create index if not exists idx_lgpd_requests_client on public.lgpd_requests(client_id, requested_at desc);

-- Um pedido em aberto por cliente de cada vez: sem isto um clique repetido
-- enfileira exportações idênticas do mesmo cadastro.
create unique index if not exists idx_lgpd_requests_one_open
  on public.lgpd_requests(client_id, type)
  where status in ('pending', 'processing');

-- O bucket privado `lgpd-exports` é criado sob demanda pela aplicação
-- (`ensurePrivateBucket`), como os demais buckets do projeto.

notify pgrst, 'reload schema';
