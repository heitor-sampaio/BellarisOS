-- O cartão de crédito em N vezes vira N parcelas A RECEBER DA OPERADORA, mês a
-- mês (F2c da 5ª simulação; decisões do Heitor, 2026-11-01: "no financeiro mês
-- a mês, como a receber" e "conta no mês do dia da venda").
--
-- A VENDA continua UM lançamento pago (`financial_transactions`, com
-- `cartao_vezes`): a receita entra inteira no dia da venda pela regra única
-- (metrics_receitas_pagas), a comissão libera na hora (H4) e os pontos saem no
-- pagamento. O que muda é o fluxo de caixa: a operadora deposita em parcelas,
-- e cada uma é uma linha AQUI — fora de financial_transactions de propósito,
-- para que nada que conta receita, ponto, comissão ou dívida da cliente a veja
-- (a baixa da parcela nunca soma receita, por construção).
--
-- - Nasce por gatilho no lançamento pago no crédito em 2+ vezes (as cinco
--   portas de venda gravam por lugares diferentes; o gatilho vale para todas).
-- - O vencimento é o MESMO DIA nos meses seguintes ao pagamento (o 31 vira o
--   último dia do mês curto), no fuso de Brasília: uma parcela por mês.
-- - A parcela vira recebida SOZINHA na data (na leitura: vencimento ≤ agora),
--   e a recepção pode marcá-la antes (antecipação, `recebida_em`).
-- - A taxa da maquininha é a de `payment_fees` para N vezes
--   (private.comissao_taxa_pct, a mesma da comissão), retratada na venda.
-- - O estorno da venda (inteiro ou em parte — o cancelamento do pacote reduz o
--   lançamento) é acompanhado pelo gatilho: cai primeiro o que ainda não foi
--   recebido, do mais novo para o mais antigo; depois, o já recebido é
--   ESTORNADO (a operadora toma de volta). Mesma transação de quem estornou.
-- - As vendas antigas no cartão N× (3 na produção) ficam como estão: o
--   gatilho só age em lançamento novo ou que passa a pago.

-- 1 ---------------------------------------------------------------------------
create table if not exists public.recebiveis_do_cartao (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  branch_id       uuid not null references public.branches(id) on delete cascade,
  transaction_id  uuid not null references public.financial_transactions(id) on delete cascade,
  parcela_numero  smallint not null check (parcela_numero >= 1),
  parcela_total   smallint not null check (parcela_total between 2 and 12 and parcela_numero <= parcela_total),
  -- O que a operadora ainda deve desta parcela (bruto); cai no estorno.
  valor           numeric(12,2) not null check (valor >= 0),
  valor_original  numeric(12,2) not null check (valor_original > 0),
  -- O que a operadora tomou de volta de uma parcela JÁ recebida (estorno).
  estornado       numeric(12,2) not null default 0 check (estornado >= 0),
  taxa_pct        numeric(6,3) not null default 0,
  taxa            numeric(12,2) generated always as (round(valor * taxa_pct / 100, 2)) stored,
  liquido         numeric(12,2) generated always as (valor - round(valor * taxa_pct / 100, 2)) stored,
  vencimento      timestamptz not null,
  -- Marcada à mão antes do vencimento (a operadora antecipou).
  recebida_em     timestamptz,
  recebida_por    text,
  cancelada_em    timestamptz,
  estornada_em    timestamptz,
  created_at      timestamptz not null default now(),
  unique (transaction_id, parcela_numero)
);
create index if not exists recebiveis_do_cartao_tenant_vencimento on public.recebiveis_do_cartao (tenant_id, vencimento);
create index if not exists recebiveis_do_cartao_branch on public.recebiveis_do_cartao (branch_id);

alter table public.recebiveis_do_cartao enable row level security;

-- A sessão da equipe só LÊ (a cliente, nada: não é dívida dela). Quem grava é
-- o gatilho e o servidor.
create policy recebiveis_do_cartao_select on public.recebiveis_do_cartao for select using (
  (jwt_claim('role') <> 'CLIENT') and ((tenant_id)::text = jwt_claim('tenant_id')) and private.can_access_branch(branch_id)
);

create policy suporte_sem_escrita_ins on public.recebiveis_do_cartao as restrictive for insert with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_upd on public.recebiveis_do_cartao as restrictive for update using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
) with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_del on public.recebiveis_do_cartao as restrictive for delete using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);

-- 2 ---------------------------------------------------------------------------
-- O gatilho: cria as parcelas da venda e as acompanha no estorno.
create or replace function private.recebiveis_do_cartao_acompanham()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tenant   uuid;
  v_vezes    int;
  v_base     timestamp;
  v_parcela  numeric;
  v_taxa     numeric;
  v_alvo     numeric;
  v_vivo     numeric;
  v_sobra    numeric;
  v_corte    numeric;
  v_r        record;
  k          int;
begin
  if not exists (select 1 from public.recebiveis_do_cartao r where r.transaction_id = new.id) then
    -- Criar: a venda paga no crédito em 2+ vezes (nunca o estorno, que herda
    -- a forma e as vezes da original).
    if new.type = 'INCOME' and new.is_paid and new.payment_method = 'CREDIT_CARD'
       and coalesce(new.cartao_vezes, 1) >= 2 and new.amount > 0
       and coalesce(new.category, '') <> 'Estorno' and coalesce(new.notes, '') <> 'Estornada'
       and (tg_op = 'INSERT' or not old.is_paid) then
      select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
      v_vezes   := least(12, new.cartao_vezes);
      v_base    := coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo';
      v_parcela := trunc(new.amount * 100 / v_vezes) / 100;
      v_taxa    := private.comissao_taxa_pct(v_tenant, 'CREDIT_CARD', v_vezes);
      for k in 1..v_vezes loop
        insert into public.recebiveis_do_cartao (
          tenant_id, branch_id, transaction_id, parcela_numero, parcela_total,
          valor, valor_original, taxa_pct, vencimento
        ) values (
          v_tenant, new.branch_id, new.id, k, v_vezes,
          case when k = v_vezes then new.amount - v_parcela * (v_vezes - 1) else v_parcela end,
          case when k = v_vezes then new.amount - v_parcela * (v_vezes - 1) else v_parcela end,
          coalesce(v_taxa, 0),
          (v_base + make_interval(months => k)) at time zone 'America/Sao_Paulo'
        );
      end loop;
    end if;
    return new;
  end if;

  -- Acompanhar: o que a operadora ainda deve não passa do que a venda vale.
  v_alvo := case when coalesce(new.notes, '') = 'Estornada' or not new.is_paid then 0 else greatest(new.amount, 0) end;
  select coalesce(sum(r.valor), 0) into v_vivo
    from public.recebiveis_do_cartao r
   where r.transaction_id = new.id and r.cancelada_em is null and r.estornada_em is null;
  v_sobra := round(v_vivo - v_alvo, 2);
  if v_sobra <= 0 then
    return new;
  end if;

  -- Cai primeiro o que ainda não foi recebido, do mais novo para o mais antigo;
  -- depois, o já recebido é estornado (a operadora toma de volta).
  for v_r in
    select r.id, r.valor, (r.recebida_em is not null or r.vencimento <= now()) as recebida
      from public.recebiveis_do_cartao r
     where r.transaction_id = new.id and r.cancelada_em is null and r.estornada_em is null and r.valor > 0
     order by (r.recebida_em is not null or r.vencimento <= now()), r.parcela_numero desc
     for update
  loop
    exit when v_sobra <= 0;
    v_corte := least(v_sobra, v_r.valor);
    if v_r.recebida then
      update public.recebiveis_do_cartao
         set valor = valor - v_corte, estornado = estornado + v_corte,
             estornada_em = case when valor - v_corte = 0 then now() end
       where id = v_r.id;
    else
      update public.recebiveis_do_cartao
         set valor = valor - v_corte,
             cancelada_em = case when valor - v_corte = 0 then now() end
       where id = v_r.id;
    end if;
    v_sobra := round(v_sobra - v_corte, 2);
  end loop;
  return new;
end $$;

create trigger trg_recebiveis_do_cartao
  after insert or update of is_paid, amount, notes on public.financial_transactions
  for each row execute function private.recebiveis_do_cartao_acompanham();

-- 3 ---------------------------------------------------------------------------
-- A situação de cada parcela, derivada (a baixa é na LEITURA: venceu, recebeu).
create or replace function public.recebiveis_do_cartao_lista(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
) returns table (
  id uuid, branch_id uuid, transaction_id uuid, descricao text, cliente_nome text,
  parcela_numero smallint, parcela_total smallint, valor numeric, valor_original numeric,
  estornado numeric, taxa_pct numeric, taxa numeric, liquido numeric,
  vencimento timestamptz, vencimento_dia date, situacao text, recebida_na timestamptz
)
language sql
stable
set search_path to ''
as $$
  select r.id, r.branch_id, r.transaction_id, t.description, c.name,
         r.parcela_numero, r.parcela_total, r.valor, r.valor_original,
         r.estornado, r.taxa_pct, r.taxa, r.liquido,
         r.vencimento, (r.vencimento at time zone 'America/Sao_Paulo')::date,
         case when r.cancelada_em is not null then 'CANCELADA'
              when r.estornada_em is not null then 'ESTORNADA'
              when r.recebida_em is not null and r.recebida_em < r.vencimento then 'ANTECIPADA'
              when r.recebida_em is not null or r.vencimento <= now() then 'RECEBIDA'
              else 'A_RECEBER' end,
         case when r.cancelada_em is not null then null
              when r.recebida_em is not null then r.recebida_em
              when r.vencimento <= now() then r.vencimento end
    from public.recebiveis_do_cartao r
    join public.financial_transactions t on t.id = r.transaction_id
    left join public.clients c on c.id = t.client_id
   where r.tenant_id = p_tenant
     and (p_branch_ids is null or r.branch_id = any (p_branch_ids))
     and (p_from is null or r.vencimento >= p_from)
     and (p_to   is null or r.vencimento <= p_to)
   order by r.vencimento, r.transaction_id, r.parcela_numero
$$;

-- O "A receber da operadora" do período (pelo VENCIMENTO, como o a receber da
-- cliente), o recebido no período, todo o em aberto e o próximo vencimento
-- depois do período — por unidade e no total (branch_id nulo).
create or replace function public.metrics_a_receber_da_operadora(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
) returns table (
  branch_id uuid, a_receber numeric, recebido numeric, em_aberto numeric,
  proximo_dia date, proximo_valor numeric
)
language sql
stable
set search_path to ''
as $$
  with p as (
    select r.branch_id, r.valor, r.estornado, r.vencimento,
           (r.vencimento at time zone 'America/Sao_Paulo')::date dia,
           r.cancelada_em is null and r.estornada_em is null vivo,
           (r.recebida_em is not null or r.vencimento <= now()) recebida,
           coalesce(r.recebida_em, r.vencimento) recebida_na
      from public.recebiveis_do_cartao r
     where r.tenant_id = p_tenant
       and (p_branch_ids is null or r.branch_id = any (p_branch_ids))
  ),
  aberto as (select * from p where vivo and not recebida),
  grupos as (
    select x.branch_id from (select distinct p.branch_id from p) x
    union all select null::uuid
  ),
  proximo as (
    select g.branch_id, min(a.dia) dia
      from grupos g join aberto a on (g.branch_id is null or a.branch_id = g.branch_id) and a.vencimento > p_to
     group by g.branch_id
  )
  select g.branch_id,
         coalesce((select round(sum(a.valor), 2) from aberto a
                    where (g.branch_id is null or a.branch_id = g.branch_id) and a.vencimento between p_from and p_to), 0),
         -- Recebido no período: o que entrou (o vivo e o que depois foi estornado).
         coalesce((select round(sum(x.valor + x.estornado), 2) from p x
                    where x.recebida and (x.vivo or x.estornado > 0)
                      and (g.branch_id is null or x.branch_id = g.branch_id) and x.recebida_na between p_from and p_to), 0),
         coalesce((select round(sum(a.valor), 2) from aberto a where g.branch_id is null or a.branch_id = g.branch_id), 0),
         pr.dia,
         (select round(sum(a.valor), 2) from aberto a
           where (g.branch_id is null or a.branch_id = g.branch_id) and a.dia = pr.dia and a.vencimento > p_to)
    from grupos g
    left join proximo pr on pr.branch_id is not distinct from g.branch_id
$$;

-- Marcar a parcela como recebida antes da data (a operadora antecipou). O
-- servidor confere permissão e alcance antes; aqui, a rede e a situação.
create or replace function public.recebivel_do_cartao_receber(p_tenant uuid, p_recebivel uuid, p_ator text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_r public.recebiveis_do_cartao%rowtype;
begin
  select * into v_r from public.recebiveis_do_cartao r where r.id = p_recebivel for update;
  if not found or v_r.tenant_id is distinct from p_tenant then
    raise exception 'Parcela não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_r.cancelada_em is not null or v_r.estornada_em is not null then
    raise exception 'Esta parcela foi cancelada no estorno da venda.' using errcode = 'P0001';
  end if;
  if v_r.recebida_em is not null or v_r.vencimento <= now() then
    raise exception 'Esta parcela já está recebida.' using errcode = 'P0001';
  end if;
  update public.recebiveis_do_cartao
     set recebida_em = now(), recebida_por = p_ator
   where id = p_recebivel;
  return v_r.branch_id;
end $$;

revoke execute on function public.recebivel_do_cartao_receber(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.recebivel_do_cartao_receber(uuid, uuid, text) to service_role;
revoke execute on function public.recebiveis_do_cartao_lista(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.recebiveis_do_cartao_lista(uuid, uuid[], timestamptz, timestamptz) to service_role;
revoke execute on function public.metrics_a_receber_da_operadora(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_a_receber_da_operadora(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
