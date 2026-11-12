-- As telas de comissão escutam um SINAL, não a tabela (F63, C1 do
-- levantamento das regras).
--
-- O Financeiro e "Comissões da equipe" assinavam `commissions` pelo Realtime.
-- A política de leitura era `can_access_branch`: toda a unidade lia — e
-- recebia pelo websocket — a comissão de cada colega, inclusive quem o cargo
-- deixa ver só "as minhas". Mesmo caso do quadro de oportunidades
-- (20260928000006): a tela não assina os dados, assina "as comissões desta
-- rede mudaram às X", sem conteúdo, e recarrega pelo servidor, que aplica o
-- alcance de sempre.
--
-- ADITIVA: só cria. Aplicar ANTES do deploy do código que assina
-- `comissoes_sinais` (o canal do Realtime com uma tabela fora da publicação
-- falha inteiro). A leitura de `commissions` pela sessão sai na
-- 20261112006302, depois do deploy.

create table if not exists public.comissoes_sinais (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  mudou_em  timestamptz not null default now()
);

comment on table public.comissoes_sinais is
  'Sinal de "as comissões desta rede mudaram" — sem conteúdo, só para o realtime das telas de comissão.';

alter table public.comissoes_sinais enable row level security;

-- Tabela do Realtime: a leitura é `to authenticated` (F26).
create policy comissoes_sinais_select on public.comissoes_sinais
  for select to authenticated
  using ((tenant_id)::text = jwt_claim('tenant_id') and jwt_claim('role') <> 'CLIENT');

-- Ninguém grava pela sessão (sem política de escrita); as restritivas do
-- suporte valem para toda tabela nova (20261008000010).
create policy suporte_sem_escrita_ins on public.comissoes_sinais as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.comissoes_sinais as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.comissoes_sinais as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- Nenhuma variável com nome de coluna: prefixo v_. `commissions` não tem
-- tenant_id (é da unidade): a rede vem pela unidade.
create or replace function public.on_comissoes_mudaram()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha  jsonb;
  v_tenant uuid;
begin
  if tg_op = 'DELETE' then v_linha := to_jsonb(old); else v_linha := to_jsonb(new); end if;
  v_tenant := nullif(v_linha ->> 'tenant_id', '')::uuid;
  if v_tenant is null and v_linha ? 'branch_id' then
    select b.tenant_id into v_tenant from public.branches b where b.id = nullif(v_linha ->> 'branch_id', '')::uuid;
  end if;
  if v_tenant is null then return null; end if;
  insert into public.comissoes_sinais (tenant_id, mudou_em) values (v_tenant, now())
  on conflict (tenant_id) do update set mudou_em = excluded.mudou_em
  where comissoes_sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end
$$;

revoke execute on function public.on_comissoes_mudaram() from public, anon, authenticated;

drop trigger if exists trg_sinal_comissoes on public.commissions;
create trigger trg_sinal_comissoes
  after insert or update or delete on public.commissions
  for each row execute function public.on_comissoes_mudaram();

drop trigger if exists trg_sinal_comissoes_linhas on public.commission_lines;
create trigger trg_sinal_comissoes_linhas
  after insert or update or delete on public.commission_lines
  for each row execute function public.on_comissoes_mudaram();

drop trigger if exists trg_sinal_comissoes_fechamentos on public.commission_payouts;
create trigger trg_sinal_comissoes_fechamentos
  after insert or update or delete on public.commission_payouts
  for each row execute function public.on_comissoes_mudaram();

drop trigger if exists trg_sinal_comissoes_regras on public.commission_rules;
create trigger trg_sinal_comissoes_regras
  after insert or update or delete on public.commission_rules
  for each row execute function public.on_comissoes_mudaram();

alter publication supabase_realtime add table public.comissoes_sinais;

notify pgrst, 'reload schema';
