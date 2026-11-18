-- A varredura de conformidade de 18/11 — as taxas da maquininha (VF2-01 e
-- VF2-02). Não depende do código novo: é tudo no banco.
--
-- VF2-01 — UMA regra para as vezes do cartão: `cartao_vezes` (2–12, só no
-- crédito), nulo = 1x. Nunca `parcela_total`. A baixa no crédito à vista grava
-- `cartao_vezes` nulo; a parcela 2/3 do crediário tem `parcela_total` = 3. O
-- recebível da operadora já lia `coalesce(cartao_vezes, 1)` (1x), mas a
-- comissão (`private.comissao_base_do_pagamento`, `private.comissao_conta_detalhe`),
-- os avisos e as taxas do Fechamento, as vendas sem taxa e os custos da venda
-- liam `coalesce(cartao_vezes, parcela_total, 1)` (3x) — herança de
-- 20261020000005. A mesma parcela pagava 3% no recebível e 6% na comissão, no
-- DRE e no CSV, e o aviso dizia "Sem taxa… Crédito 3x" de uma venda à vista
-- (vendas-financeiro.md §9.6, F2c e C75; princípio 3).
--
-- VF2-02 — "O lançamento já gravado fica com a taxa que tem" (vendas-financeiro.md
-- §9.6, C75). `metrics_caixa_dos_lancamentos` e os custos da venda partiam do
-- RETRATO (`private.taxa_gravada_do_cartao`, o recebível da operadora), mas
-- só o crédito em 2+ vezes tinha recebível: o débito, o crédito 1x e o Pix
-- eram refeitos com a taxa de AGORA — e os avisos do Fechamento e as taxas
-- por maquininha refaziam tudo com ela. Mudou a taxa na Configuração, o
-- passado mudava, e dois números do mesmo dia divergiam.
--   - `financial_transactions.taxa_pct_retrato`: a taxa (%) do recebimento no
--     momento em que ele é PAGO (gatilho `trg_taxa_do_lancamento`, depois de
--     `trg_maquininha_do_lancamento`), no Pix, no débito e no crédito; refeita
--     só quando a forma, as vezes, a bandeira ou a maquininha do pago mudam
--     (a bandeira informada depois, como já fazia o recebível).
--   - Os já pagos ganham o retrato da taxa de hoje (é a que eles mostravam).
--   - `private.taxa_gravada_do_cartao` lê o recebível (o crédito em N vezes,
--     com a sobra do arredondamento) e, sem ele, o retrato do lançamento.
--   - Toda leitura da taxa de lançamento gravado parte dela; a taxa de agora
--     fica só como reserva de quem não tem retrato nenhum.
-- A comissão segue como está escrito em comissoes.md ("Taxa:
-- `private.comissao_taxa_pct`"): a linha se acerta quando o pagamento entra;
-- aqui ela só passa a ler as vezes certas.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

-- ---------------------------------------------------------------------------
-- VF2-02: o retrato da taxa do lançamento.
-- ---------------------------------------------------------------------------
alter table public.financial_transactions add column if not exists taxa_pct_retrato numeric;
comment on column public.financial_transactions.taxa_pct_retrato is
  'A taxa da maquininha (%) do recebimento no momento em que foi pago (Pix, débito, crédito). O já gravado fica com a taxa que tem (vendas-financeiro.md §9.6, C75).';

create or replace function private.taxa_do_lancamento_retrata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  if not (new.is_paid and new.type::text = 'INCOME' and coalesce(new.category, '') <> 'Estorno'
          and new.payment_method is not null and new.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')) then
    new.taxa_pct_retrato := null;
    return new;
  end if;
  -- O já pago fica com a taxa que tem — a não ser que o próprio pagamento mude
  -- (a forma, as vezes, a bandeira ou a maquininha informadas depois).
  if tg_op = 'UPDATE' and old.is_paid and old.taxa_pct_retrato is not null
     and old.payment_method is not distinct from new.payment_method
     and old.cartao_vezes is not distinct from new.cartao_vezes
     and old.cartao_bandeira is not distinct from new.cartao_bandeira
     and old.maquininha_id is not distinct from new.maquininha_id then
    new.taxa_pct_retrato := old.taxa_pct_retrato;
    return new;
  end if;
  select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
  -- VF2-01: as vezes do cartão (nulo = 1x), nunca as do crediário.
  new.taxa_pct_retrato := coalesce(private.comissao_taxa_pct(v_tenant, new.payment_method::text,
    coalesce(new.cartao_vezes, 1), new.cartao_bandeira, new.maquininha_id), 0);
  return new;
end
$$;

revoke all on function private.taxa_do_lancamento_retrata() from public, anon, authenticated;

drop trigger if exists trg_taxa_do_lancamento on public.financial_transactions;
create trigger trg_taxa_do_lancamento
  before insert or update of is_paid, payment_method, cartao_vezes, cartao_bandeira, maquininha_id, type, category, branch_id, taxa_pct_retrato
  on public.financial_transactions
  for each row execute function private.taxa_do_lancamento_retrata();

-- Os já pagos: o retrato da taxa de hoje (a que eles mostravam até aqui).
-- Sem a auditoria (não é uma edição de ninguém) — só esta coluna muda.
alter table public.financial_transactions disable trigger auditoria_upd;
update public.financial_transactions t
   set taxa_pct_retrato = coalesce(private.comissao_taxa_pct(b.tenant_id, t.payment_method::text,
         coalesce(t.cartao_vezes, 1), t.cartao_bandeira, t.maquininha_id), 0)
  from public.branches b
 where b.id = t.branch_id
   and t.is_paid and t.type::text = 'INCOME' and coalesce(t.category, '') <> 'Estorno'
   and t.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
   and t.taxa_pct_retrato is null;
alter table public.financial_transactions enable trigger auditoria_upd;

-- O retrato: o recebível da operadora (o crédito em N vezes, com a sobra do
-- arredondamento na última parcela); sem ele, o do lançamento.
create or replace function private.taxa_gravada_do_cartao(p_transacao uuid, p_valor numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case when sum(r.valor_original) > 0
                 then round(sum(round(r.valor_original * r.taxa_pct / 100, 2) + coalesce(r.taxa_sobra, 0))
                            * p_valor / sum(r.valor_original), 2) end
       from public.recebiveis_do_cartao r
      where r.transaction_id = p_transacao),
    (select round(p_valor * t.taxa_pct_retrato / 100, 2)
       from public.financial_transactions t
      where t.id = p_transacao and t.taxa_pct_retrato is not null))
$$;

-- Os avisos do Fechamento (a taxa do dia) e as taxas por maquininha: o retrato.
select pg_temp.trocar_no_corpo(
  'public.metrics_avisos_do_fechamento(uuid,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)'::regprocedure,
  array[
    $t$select r.amount, r.payment_method::text as metodo, coalesce(r.cartao_vezes, r.parcela_total, 1) as vezes,$t$,
    $t$sum(r.amount * private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira, r.maquininha) / 100), 2)$t$
  ],
  array[
    $t$select r.id, r.estorno_de, r.amount, r.payment_method::text as metodo, coalesce(r.cartao_vezes, 1) as vezes,$t$,
    $t$sum(coalesce(private.taxa_gravada_do_cartao(coalesce(r.estorno_de, r.id), r.amount),
                  round(r.amount * private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira, r.maquininha) / 100, 2))), 2)$t$
  ],
  array[1, 1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_taxas_por_maquininha(uuid,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,
  array[
    $t$select r.amount, r.payment_method::text as metodo, coalesce(r.cartao_vezes, r.parcela_total, 1) as vezes,$t$,
    $t$r.amount * private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira, r.maquininha_id) / 100 as taxa$t$
  ],
  array[
    $t$select r.id, r.estorno_de, r.amount, r.payment_method::text as metodo, coalesce(r.cartao_vezes, 1) as vezes,$t$,
    $t$coalesce(private.taxa_gravada_do_cartao(coalesce(r.estorno_de, r.id), r.amount),
                    round(r.amount * private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira, r.maquininha_id) / 100, 2)) as taxa$t$
  ],
  array[1, 1]);

-- ---------------------------------------------------------------------------
-- VF2-01: as vezes do cartão em toda leitura.
-- ---------------------------------------------------------------------------
select pg_temp.trocar_no_corpo(
  'public.metrics_vendas_sem_taxa_do_fechamento(uuid,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,
  array[$t$coalesce(r.cartao_vezes, r.parcela_total, 1)$t$], array[$t$coalesce(r.cartao_vezes, 1)$t$], array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_custos_da_venda(uuid,uuid[],timestamp with time zone,timestamp with time zone,uuid)'::regprocedure,
  array[$t$coalesce(r.cartao_vezes, r.parcela_total, 1)$t$], array[$t$coalesce(r.cartao_vezes, 1)$t$], array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_series_dos_custos_da_venda(uuid,uuid[],timestamp with time zone,timestamp with time zone,text,uuid)'::regprocedure,
  array[$t$coalesce(r.cartao_vezes, r.parcela_total, 1)$t$], array[$t$coalesce(r.cartao_vezes, 1)$t$], array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_caixa_dos_lancamentos(uuid,uuid[])'::regprocedure,
  array[$t$coalesce(t.cartao_vezes, t.parcela_total, 1)$t$, $t$coalesce(o.cartao_vezes, o.parcela_total, 1)$t$],
  array[$t$coalesce(t.cartao_vezes, 1)$t$, $t$coalesce(o.cartao_vezes, 1)$t$],
  array[1, 1]);

select pg_temp.trocar_no_corpo(
  'private.comissao_base_do_pagamento(uuid,uuid)'::regprocedure,
  array[$t$coalesce(f.cartao_vezes, f.parcela_total, 1)$t$, $t$coalesce(v_f.cartao_vezes, v_f.parcela_total, 1)$t$],
  array[$t$coalesce(f.cartao_vezes, 1)$t$, $t$coalesce(v_f.cartao_vezes, 1)$t$],
  array[1, 1]);

select pg_temp.trocar_no_corpo(
  'private.comissao_conta_detalhe(uuid)'::regprocedure,
  array[
    $t$coalesce(f.cartao_vezes, f.parcela_total, 1)$t$,
    $t$coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1)$t$
  ],
  array[$t$coalesce(f.cartao_vezes, 1)$t$, $t$coalesce(f.cartao_vezes, 1)$t$],
  array[1, 1]);

drop function pg_temp.trocar_no_corpo(regprocedure, text[], text[], int[]);

notify pgrst, 'reload schema';
