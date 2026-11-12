-- As telas do dinheiro escutam um SINAL, não a tabela (F67, a sobra da F63).
--
-- O Financeiro, o Fechamento do dia, os dashboards, os relatórios e a sessão
-- de atendimento assinavam `financial_transactions` pelo Realtime: a linha
-- inteira (valor, cliente, quem vendeu) ia pelo websocket a todo membro da
-- unidade, também a quem o cargo deixa ver só "os meus". Como as comissões
-- (20261112006301) e o quadro do CRM: a tela assina "o dinheiro desta rede
-- mudou às X", sem conteúdo, e recarrega pelo servidor, que aplica o alcance.
--
-- ADITIVA: só cria. Aplicar ANTES do deploy do código que assina
-- `financeiro_sinais` (o canal do Realtime com uma tabela fora da publicação
-- falha inteiro). Tirar `financial_transactions` da publicação fica para
-- DEPOIS do deploy (o código no ar ainda a assina).

create table if not exists public.financeiro_sinais (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  mudou_em  timestamptz not null default now()
);

comment on table public.financeiro_sinais is
  'Sinal de "o dinheiro desta rede mudou" — sem conteúdo, só para o realtime das telas do financeiro.';

alter table public.financeiro_sinais enable row level security;

-- Tabela do Realtime: a leitura é `to authenticated` (F26).
create policy financeiro_sinais_select on public.financeiro_sinais
  for select to authenticated
  using ((tenant_id)::text = jwt_claim('tenant_id') and jwt_claim('role') <> 'CLIENT');

-- Ninguém grava pela sessão (sem política de escrita); as restritivas do
-- suporte valem para toda tabela nova (20261008000010).
create policy suporte_sem_escrita_ins on public.financeiro_sinais as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.financeiro_sinais as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.financeiro_sinais as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- Nenhuma variável com nome de coluna: prefixo v_. `financial_transactions`
-- não tem tenant_id (é da unidade): a rede vem pela unidade. Por COMANDO, não
-- por linha: um lote (o checkout do plano, a baixa automática) marca uma vez.
create or replace function private.on_financeiro_mudou()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.financeiro_sinais (tenant_id, mudou_em)
  select distinct b.tenant_id, now()
    from (select branch_id from novas union select branch_id from velhas) x
    join public.branches b on b.id = x.branch_id
  on conflict (tenant_id) do update set mudou_em = excluded.mudou_em
  where public.financeiro_sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end
$$;

revoke execute on function private.on_financeiro_mudou() from public, anon, authenticated;

-- As tabelas de transição não aceitam "insert or update or delete" num gatilho
-- só: um por evento, com as duas pontas que o evento tem.
create or replace function private.on_financeiro_mudou_ins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.financeiro_sinais (tenant_id, mudou_em)
  select distinct b.tenant_id, now() from novas x join public.branches b on b.id = x.branch_id
  on conflict (tenant_id) do update set mudou_em = excluded.mudou_em
  where public.financeiro_sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end $$;

create or replace function private.on_financeiro_mudou_del()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.financeiro_sinais (tenant_id, mudou_em)
  select distinct b.tenant_id, now() from velhas x join public.branches b on b.id = x.branch_id
  on conflict (tenant_id) do update set mudou_em = excluded.mudou_em
  where public.financeiro_sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end $$;

revoke execute on function private.on_financeiro_mudou_ins() from public, anon, authenticated;
revoke execute on function private.on_financeiro_mudou_del() from public, anon, authenticated;

drop trigger if exists trg_sinal_financeiro_ins on public.financial_transactions;
create trigger trg_sinal_financeiro_ins
  after insert on public.financial_transactions
  referencing new table as novas
  for each statement execute function private.on_financeiro_mudou_ins();

drop trigger if exists trg_sinal_financeiro_upd on public.financial_transactions;
create trigger trg_sinal_financeiro_upd
  after update on public.financial_transactions
  referencing new table as novas old table as velhas
  for each statement execute function private.on_financeiro_mudou();

drop trigger if exists trg_sinal_financeiro_del on public.financial_transactions;
create trigger trg_sinal_financeiro_del
  after delete on public.financial_transactions
  referencing old table as velhas
  for each statement execute function private.on_financeiro_mudou_del();

alter publication supabase_realtime add table public.financeiro_sinais;

notify pgrst, 'reload schema';
