-- D12 da 26ª simulação: o pago com o programa DESLIGADO não conta ponto.
--
-- O Heitor, 18/11: "se o programa é ligado no meio não conta ponto".
--
-- O pacote de R$ 400 no crediário: a entrada de R$ 200 paga com a fidelidade
-- desligada, a rede liga o programa, e a parcela de R$ 200 deu 400 pontos (1
-- ponto por R$ 1). A conta cumulativa (`fidelidade_pontos_do_pagamento`, D14:
-- o alvo é o que já foi pago, menos o que já foi dado) somava no "já pago" a
-- entrada de antes — e a dava na parcela. Agora o alvo e o "já deu" contam só
-- os pagamentos feitos com o programa LIGADO: a parcela dá 200.
--
-- 1. `public.fidelidade_ligada`: quando o programa da rede foi ligado pela
--    última vez (uma linha por rede). A config não guardava. O gatilho da
--    config grava `now()` quando ela nasce ligada ou passa de desligada a
--    ligada. Religado depois de desligar, a conta recomeça do novo "ligado
--    em": o que foi pago no período ligado de antes já deu os pontos dele, e
--    sai do alvo e do "já deu" juntos (a conta não deve nem tira nada); o que
--    foi pago no intervalo desligado não conta.
--    Tabela própria, e não coluna em `loyalty_configs`: a config é auditada, e
--    uma coluna de controle sairia crua na frase da Auditoria.
--    Só o servidor lê (RLS sem política de leitura; as restritivas do suporte).
-- 2. O passado: a config ligada hoje ganha o "ligado em" da Auditoria da config
--    — a criação já ligada ou a última edição que ligou (`auditoria`, desde
--    2026-11-15). Sem registro (config de antes da Auditoria), a criação da
--    config: antes dela não havia programa. Em 18/11 as 13 configs ligadas
--    nasceram ligadas e têm a criação auditada.
-- 3. Os quatro ramos cumulativos de `fidelidade_pontos_do_pagamento` (o pacote
--    e o pré-pago, nos dois modos; o plano; o atendimento avulso): o "já pago"
--    só com `paid_at` (ou, sem ele, a criação) desde o "ligado em", e o "já
--    deu" só dos pagamentos desse período (o estorno, pelo pagamento que ele
--    estornou). No modo "por procedimento" o alvo segue proporcional ao pago
--    (decisão do Claude, 26ª, princípio 3): os pontos do procedimento × a parte
--    paga com o programa ligado ÷ o total — o pacote de 10 pontos pago metade
--    antes de ligar dá 5; os 10 inteiros, só se tudo foi pago com ele ligado.
--    Os ramos de um pagamento só (crédito vendido, produto, o resto) não mudam:
--    o gatilho só pontua com o programa ligado.
--
-- Partes do corpo VIVO (o padrão `pg_temp.trocar_no_corpo`), com a contagem;
-- o corpo vivo é o da 20261121000001 (nenhuma pendente mexe nele).

-- ─── 1. O "ligado em" ──────────────────────────────────────────────────────
create table if not exists public.fidelidade_ligada (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  ligado_em timestamptz not null default now()
);

comment on table public.fidelidade_ligada is
  'Quando o programa de fidelidade da rede foi ligado pela última vez (D12 da 26ª): o pago antes não conta ponto.';

alter table public.fidelidade_ligada enable row level security;

-- Ninguém lê nem grava pela sessão; as restritivas do suporte valem para toda
-- tabela nova (20261008000010).
create policy suporte_sem_escrita_ins on public.fidelidade_ligada as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.fidelidade_ligada as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.fidelidade_ligada as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- O gatilho da config: nasceu ligada, ou passou de desligada a ligada.
create or replace function private.fidelidade_marcar_ligada()
returns trigger
language plpgsql
security definer
set search_path to ''
as $f$
begin
  if coalesce(new.enabled, false)
     and (tg_op = 'INSERT' or not coalesce(old.enabled, false)) then
    insert into public.fidelidade_ligada (tenant_id, ligado_em)
    values (new.tenant_id, now())
    on conflict (tenant_id) do update set ligado_em = excluded.ligado_em;
  end if;
  return null;
end
$f$;

revoke execute on function private.fidelidade_marcar_ligada() from public, anon, authenticated;

drop trigger if exists trg_fidelidade_marcar_ligada on public.loyalty_configs;
create trigger trg_fidelidade_marcar_ligada
  after insert or update of enabled on public.loyalty_configs
  for each row execute function private.fidelidade_marcar_ligada();

-- Quando o programa da rede foi ligado (sem registro: sempre).
create or replace function private.fidelidade_ligada_em(p_tenant uuid)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $f$
  select coalesce((select fl.ligado_em from public.fidelidade_ligada fl where fl.tenant_id = p_tenant), '-infinity'::timestamptz)
$f$;

revoke execute on function private.fidelidade_ligada_em(uuid) from public, anon, authenticated;
grant execute on function private.fidelidade_ligada_em(uuid) to service_role;

-- ─── 2. O passado, pela Auditoria da config ────────────────────────────────
insert into public.fidelidade_ligada (tenant_id, ligado_em)
select c.tenant_id,
       coalesce((
         select max(a.criado_em) from public.auditoria a
          where a.tabela = 'loyalty_configs' and a.registro_id = c.id::text
            and coalesce(a.depois ->> 'enabled', '') = 'true'
            and (a.operacao = 'criou' or 'enabled' = any (a.colunas))
       ), c.created_at)
  from public.loyalty_configs c
 where c.enabled
on conflict (tenant_id) do nothing;

-- ─── 3. A conta ────────────────────────────────────────────────────────────
create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  de text;
  para text;
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    -- O arquivo pode ter vindo com CRLF; o corpo no banco, não.
    de := replace(p_de[i], chr(13), '');
    para := replace(p_para[i], chr(13), '');
    n := (length(d) - length(replace(d, de, ''))) / length(de);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, de, para);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure,
  array[
-- 1. O "ligado em" da rede, uma vez.
$t$  v_alvo      int;
begin
$t$,
-- 2. O "já deu" do plano lia só a linha de pontos: agora pelo pagamento dela.
$t$      from public.loyalty_transactions l
     where l.treatment_plan_id = p_tx.treatment_plan_id
       and l.kind in ('GANHO', 'ESTORNO_GANHO');$t$,
-- 3. O "já pago" dos quatro ramos (pacote e pré-pago nos dois modos, plano, avulso).
$t$and f.payment_method is distinct from 'INTERNAL_CREDIT';$t$,
-- 4. O "já deu" do pacote e do pré-pago (nos dois modos) e do avulso.
$t$and l.kind in ('GANHO', 'ESTORNO_GANHO');$t$],
  array[
$t$  v_alvo      int;
  -- D12 da 26ª: o pago antes de o programa ser ligado não conta ponto.
  v_ligado    timestamptz := private.fidelidade_ligada_em(p_cfg.tenant_id);
begin
$t$,
$t$      from public.loyalty_transactions l
      left join public.financial_transactions f on f.id = l.transaction_id
      left join public.financial_transactions o on o.id = f.estorno_de
     where l.treatment_plan_id = p_tx.treatment_plan_id
       and l.kind in ('GANHO', 'ESTORNO_GANHO')
       and coalesce(o.paid_at, o.created_at, f.paid_at, f.created_at, l.created_at) >= v_ligado;$t$,
$t$and f.payment_method is distinct from 'INTERNAL_CREDIT'
       and coalesce(f.paid_at, f.created_at) >= v_ligado;$t$,
$t$and l.kind in ('GANHO', 'ESTORNO_GANHO')
       and coalesce(o.paid_at, o.created_at, f.paid_at, f.created_at) >= v_ligado;$t$],
  array[1, 1, 4, 3]);

notify pgrst, 'reload schema';
