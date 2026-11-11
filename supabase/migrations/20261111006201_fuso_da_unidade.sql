-- F62 — o fuso da clínica (o Heitor, 2026-11-11: "Não, deixa a clinica
-- configurar o seu fuso"). A unidade tem o fuso dela, com o horário de
-- Brasília como padrão: quem não mexer não vê nada mudar.
--
-- A lista é a dos fusos do Brasil (lib/unidades/fuso.ts, a mesma): o oeste do
-- Amazonas (UTC−5) usa o do Acre, que é a mesma hora.

alter table public.branches
  add column if not exists fuso text not null default 'America/Sao_Paulo';

alter table public.branches
  add constraint branches_fuso_valido check (fuso in (
    'America/Sao_Paulo', 'America/Noronha', 'America/Manaus', 'America/Boa_Vista',
    'America/Porto_Velho', 'America/Cuiaba', 'America/Campo_Grande', 'America/Rio_Branco'
  ));

comment on column public.branches.fuso is
  'O fuso horário da unidade (F62): a agenda, o "hoje", o Fechamento, os indicadores dela, o cron e os documentos. Padrão: o horário de Brasília.';

-- O fuso de UMA unidade (o de Brasília, sem ela). Em public e sem security
-- definer: as métricas que a usam rodam pelo service role, que não tem o
-- schema private, e o fuso não é segredo (a sessão só lê as unidades da rede
-- dela, pela RLS de branches).
create or replace function public.fuso_da_unidade(p_branch uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select b.fuso from public.branches b where b.id = p_branch), 'America/Sao_Paulo')
$$;

-- O fuso de um RECORTE (as unidades pedidas; sem elas, as ativas da rede): o
-- delas quando todas têm o mesmo, senão o de Brasília. É o fuso da janela do
-- período no consolidado; o DIA de cada lançamento é o da unidade dele
-- (fuso_da_unidade). A mesma regra do app: `fusoComum` (lib/unidades/fuso.ts).
create or replace function public.fuso_do_recorte(p_tenant uuid, p_branch_ids uuid[] default null)
returns text
language sql
stable
set search_path = ''
as $$
  select case when count(distinct b.fuso) = 1 then min(b.fuso) else 'America/Sao_Paulo' end
  from public.branches b
  where b.tenant_id = p_tenant
    and (case when coalesce(cardinality(p_branch_ids), 0) > 0 then b.id = any(p_branch_ids) else b.is_active end)
$$;

grant execute on function public.fuso_da_unidade(uuid) to anon, authenticated, service_role;
grant execute on function public.fuso_do_recorte(uuid, uuid[]) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
