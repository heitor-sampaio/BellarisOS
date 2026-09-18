-- Abas de Relatórios liberadas por cargo.
--
-- `reports` num nível só era grosso demais: liberar relatórios ao time
-- comercial entregava junto o faturamento da rede. Cada aba passa a ser uma
-- linha aqui, e o cargo só enxerga as que tiver.
--
-- Sem linha nenhuma = sem relatório. Foi decisão de produto (2026-09-18):
-- começar fechado e abrir o que cada cargo precisa, em vez de herdar tudo.
-- Quem é da rede não depende desta tabela — `isNetworkAdmin` já recebe tudo —,
-- mas os cargos de sistema são semeados assim mesmo, para o banco descrever o
-- acesso sem depender do claim.

create table if not exists public.role_report_tabs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id)      on delete cascade,
  role_id    uuid not null references public.tenant_roles(id) on delete cascade,
  tab        text not null check (tab in (
    'overview', 'financeiro', 'agenda', 'clientes',
    'procedimentos', 'profissionais', 'estoque', 'comercial'
  )),
  created_at timestamptz not null default now(),
  unique (role_id, tab)
);

create index if not exists role_report_tabs_tenant_role_idx
  on public.role_report_tabs (tenant_id, role_id);

alter table public.role_report_tabs enable row level security;

-- Mesmas regras de `role_permissions`: a rede inteira lê, só quem tem
-- abrangência de rede escreve.
drop policy if exists role_report_tabs_select on public.role_report_tabs;
create policy role_report_tabs_select on public.role_report_tabs
  for select using (tenant_id = (jwt_claim('tenant_id'))::uuid);

drop policy if exists role_report_tabs_insert on public.role_report_tabs;
create policy role_report_tabs_insert on public.role_report_tabs
  for insert with check (eh_da_rede() and tenant_id = (jwt_claim('tenant_id'))::uuid);

drop policy if exists role_report_tabs_update on public.role_report_tabs;
create policy role_report_tabs_update on public.role_report_tabs
  for update using (eh_da_rede() and tenant_id = (jwt_claim('tenant_id'))::uuid);

drop policy if exists role_report_tabs_delete on public.role_report_tabs;
create policy role_report_tabs_delete on public.role_report_tabs
  for delete using (eh_da_rede() and tenant_id = (jwt_claim('tenant_id'))::uuid);

-- Cargos de sistema (Admin da rede) enxergam todas as abas.
insert into public.role_report_tabs (tenant_id, role_id, tab)
select r.tenant_id, r.id, t.tab
from public.tenant_roles r
cross join (values
  ('overview'), ('financeiro'), ('agenda'), ('clientes'),
  ('procedimentos'), ('profissionais'), ('estoque'), ('comercial')
) as t(tab)
where r.is_system
on conflict (role_id, tab) do nothing;
