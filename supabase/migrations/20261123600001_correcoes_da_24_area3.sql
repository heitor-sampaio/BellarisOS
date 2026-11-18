-- Correções da 24ª simulação — financeiro, estoque, relatórios e auditoria.
--
-- 1. "Novos clientes" só na REDE (o Heitor, 18/11: "o cliente é da rede" e,
--    sobre o número numa unidade, "Só na rede"). A regra antiga — a nova
--    cliente da unidade é a ATENDIDA nela, e a de duas conta nas duas (T1 do
--    Bloco Tags, H16) — foi uma leitura do Claude e sai: nada atribui a cliente
--    a uma unidade. No recorte que não é a rede, `new_clients` vem NULO (a tela
--    não mostra o número) e a série vem vazia. A rede de uma unidade só: a
--    unidade É a rede (`recorte_e_a_clinica`), e o número continua.
-- 2. Reativar: a unidade da linha é a da ÚLTIMA VISITA (na rede), nunca a do
--    cadastro; o fuso é o da rede.
-- 3. A10: o custo do lote se corrige enquanto nada saiu dele
--    (`estoque_corrigir_custo_do_lote`, a Auditoria guarda o antes e o
--    depois); depois, o ajuste com o motivo "correção de cadastro"
--    (`stock_movements.correcao_de_cadastro`) não é perda nem giro.
-- 4. A33: a Auditoria do lançamento guarda o antes e o depois dos campos que
--    a pessoa edita (data de referência, pago, descrição, parcela…).

-- ---------------------------------------------------------------------------
-- 1. Novos clientes só na rede
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.metrics_core(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, appointments_charged bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with scope as (
    select b.id
    from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  tx as (
    select t.*
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = t.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = t.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = t.procedure_sale_id and psv.sold_by = p_professional_id))
  ),
  despesas as (
    select m.amount
    from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) m
    where m.type = 'EXPENSE'
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = m.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = m.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = m.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = m.procedure_sale_id and psv.sold_by = p_professional_id))
  ),
  appt as (
    select a.*
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.aconteceu_em >= p_from
      and a.aconteceu_em <= p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  comm as (
    select c.status, c.amount
    from public.commissions c
    join scope s on s.id = c.branch_id
    where c.released_at >= p_from
      and c.released_at <= p_to
      and (p_professional_id is null or c.professional_id = p_professional_id)
  ),
  clinica as (select public.recorte_e_a_clinica(p_tenant, p_branch_ids) as toda)
  select
    coalesce((select sum(r.amount) from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) r), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and not t.is_paid
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(d.amount) from despesas d), 0),
    coalesce((select sum(a.price) from appt a where a.status = 'COMPLETED'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED'),
    (select count(*) from appt),
    (select count(*) from appt a where a.status = 'CANCELLED'),
    (select count(*) from appt a where a.status = 'NO_SHOW'),
    coalesce((select sum(a.duration_min) from appt a
               where a.status not in ('CANCELLED', 'NO_SHOW')), 0),
    -- A cliente é da REDE (o Heitor, 18/11): o número só existe no recorte da
    -- rede inteira. Numa unidade (da rede de duas ou mais), NULO.
    (select case when k.toda then (
       select count(*) from public.clients c
        where c.tenant_id = p_tenant
          and c.is_active
          and coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)), c.created_at) between p_from and p_to
          and (p_professional_id is null or exists (
                select 1 from public.appointments a
                join scope s on s.id = a.branch_id
                where a.client_id = c.id and a.professional_id = p_professional_id
                  and a.status <> 'CANCELLED')))
     end from clinica k),
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED' and coalesce(a.price, 0) > 0);
$function$;

CREATE OR REPLACE FUNCTION public.metrics_new_clients_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text DEFAULT 'day'::text, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(bucket timestamp with time zone, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  -- Só na rede (o Heitor, 18/11): numa unidade da rede de duas ou mais, a série vem vazia.
  with desde as (
    select c.id, coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)), c.created_at) as em
    from public.clients c
    where c.tenant_id = p_tenant
      and c.is_active
      and public.recorte_e_a_clinica(p_tenant, p_branch_ids)
  )
  select
    date_trunc(
      case when p_granularity in ('hour', 'day', 'month') then p_granularity else 'day' end,
      d.em at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids))
    ) at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)) as bucket,
    count(*)
  from desde d
  where d.em between p_from and p_to
    and (p_professional_id is null or exists (
          select 1 from public.appointments a
          join public.branches b on b.id = a.branch_id
          where a.client_id = d.id and a.professional_id = p_professional_id
            and a.status <> 'CANCELLED'
            and b.tenant_id = p_tenant
            and (p_branch_ids is null or b.id = any (p_branch_ids))))
  group by 1
  order by 1;
$function$;

CREATE OR REPLACE FUNCTION public.metrics_by_branch(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(branch_id uuid, branch_name text, branch_slug text, is_active boolean, revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, transactions_count bigint, appointments_charged bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with mov as (
    select m.branch_id, m.type, m.payment_method, m.amount
      from public.metrics_movimentos_pagos(p_tenant, null, p_from, p_to) m
  )
  select
    b.id, b.name, b.slug, b.is_active,
    coalesce((select sum(m.amount) from mov m
               where m.branch_id = b.id and m.type = 'INCOME'
                 and m.payment_method is distinct from 'INTERNAL_CREDIT'), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and not t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(m.amount) from mov m
               where m.branch_id = b.id and m.type = 'EXPENSE'), 0),
    coalesce((select sum(a.price) from public.appointments a
               where a.branch_id = b.id and a.status = 'COMPLETED'
                 and a.aconteceu_em between p_from and p_to), 0),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED'
         and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'CANCELLED'
         and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'NO_SHOW'
         and a.aconteceu_em between p_from and p_to),
    coalesce((select sum(a.duration_min) from public.appointments a
               where a.branch_id = b.id and a.status not in ('CANCELLED', 'NO_SHOW')
                 and a.aconteceu_em between p_from and p_to), 0),
    -- A cliente é da REDE (o Heitor, 18/11): "Novos clientes" por unidade não
    -- existe — NULO, salvo na rede de uma unidade só (a unidade é a rede).
    case when public.recorte_e_a_clinica(p_tenant, array[b.id]) then
      (select count(*) from public.clients c
         where c.tenant_id = p_tenant and c.is_active
           and coalesce(c.cliente_desde::timestamp at time zone b.fuso, c.created_at) between p_from and p_to)
    end,
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'OPEN'
                 and c.released_at between p_from and p_to), 0),
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'PAID'
                 and c.released_at between p_from and p_to), 0),
    (select count(*) from public.financial_transactions t
       where t.branch_id = b.id
         and coalesce(t.paid_at, t.created_at) between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED' and coalesce(a.price, 0) > 0
         and a.aconteceu_em between p_from and p_to)
  from public.branches b
  where b.tenant_id = p_tenant
  order by b.name;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Reativar: nada da unidade do cadastro
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.metrics_clientes_para_reativar_rede(p_tenant uuid, p_desde timestamp with time zone, p_limite integer DEFAULT 3, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with unidades as (
    select b.id, b.name, b.slug, b.fuso from public.branches b where b.tenant_id = p_tenant
  ),
  fuso as (select public.fuso_do_recorte(p_tenant, null) as f),
  do_recorte as (
    select c.id, c.name, c.phone,
           -- F35: de quando ela é cliente, e a última visita no sistema de antes.
           -- 24ª: o dia vale da meia-noite da REDE (a cliente é da rede, não da unidade do cadastro).
           coalesce(c.cliente_desde::timestamp at time zone (select f from fuso), c.created_at) as created_at,
           c.ultima_visita_antes::timestamp at time zone (select f from fuso) as visita_antes
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join unidades u on u.id = a.branch_id
            where a.client_id = c.id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_rede as (
    select r.id, r.name, r.phone, r.visita_antes from do_recorte r where r.created_at < p_desde
  ),
  inativos as (
    select d.*
    from da_rede d
    where (d.visita_antes is null or d.visita_antes < p_desde)
      and not exists (
      select 1 from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = d.id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone,
           greatest(ult.aconteceu_em, i.visita_antes) as ultima_visita,
           (i.visita_antes is not null and (ult.aconteceu_em is null or i.visita_antes > ult.aconteceu_em)) as antes_do_sistema,
           -- A unidade da ÚLTIMA VISITA, e só ela: sem visita no sistema, nenhuma (era a do cadastro).
           ult.branch_id as unidade_id
    from inativos i
    left join lateral (
      select a.aconteceu_em, a.branch_id
      from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = i.id and a.status = 'COMPLETED'
      order by a.aconteceu_em desc
      limit 1
    ) ult on true
  ),
  visitas as (
    select r.id, r.created_at,
      r.visita_antes is not null
        or exists (select 1 from public.appointments a join unidades u on u.id = a.branch_id
                    where a.client_id = r.id and a.status = 'COMPLETED') as veio
    from do_recorte r
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'com_visita', (select count(*) from visitas v where v.veio),
    'recentes_sem_visita', (select count(*) from visitas v where not v.veio and v.created_at >= p_desde),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita,
               'antes_do_sistema', x.antes_do_sistema,
               'unidade', u.name, 'unidade_slug', u.slug)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
      left join unidades u on u.id = x.unidade_id
    ), '[]'::jsonb)
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3. A10: o custo do lote errado
-- ---------------------------------------------------------------------------

-- O ajuste com o motivo "correção de cadastro": corrige o que foi CADASTRADO
-- errado (o custo, a quantidade); não houve perda. Não conta nas Perdas, no
-- "Consumo com perdas" nem no giro (o giro já só conta o uso no atendimento).
alter table public.stock_movements
  add column if not exists correcao_de_cadastro boolean not null default false;

comment on column public.stock_movements.correcao_de_cadastro is
  'A10 da 24ª: o ajuste que corrige o cadastro (custo, quantidade digitados errado). Não é perda.';

-- A marca nasce no INSERT do próprio ajuste: o wrapper liga a configuração
-- local da transação, e o gatilho a copia para o movimento de ajuste.
create or replace function private.marca_correcao_de_cadastro()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.type = 'MANUAL_ADJUSTMENT'
     and coalesce(current_setting('bellaris.correcao_de_cadastro', true), '') = 'on' then
    new.correcao_de_cadastro := true;
  end if;
  return new;
end $fn$;

drop trigger if exists marca_correcao_de_cadastro on public.stock_movements;
create trigger marca_correcao_de_cadastro
  before insert on public.stock_movements
  for each row execute function private.marca_correcao_de_cadastro();

create or replace function public.estoque_ajuste_de_correcao(
  p_produto uuid, p_unidade uuid, p_contagem numeric, p_em_consumo boolean, p_motivo text, p_autor text,
  p_lote uuid default null, p_lote_numero text default null, p_lote_validade timestamptz default null
) returns numeric
language plpgsql security definer set search_path = '' as $fn$
declare
  v_saldo numeric;
begin
  perform set_config('bellaris.correcao_de_cadastro', 'on', true);
  v_saldo := public.estoque_ajuste_com_lote(p_produto, p_unidade, p_contagem, p_em_consumo, p_motivo, p_autor,
                                            p_lote, p_lote_numero, p_lote_validade);
  perform set_config('bellaris.correcao_de_cadastro', '', true);
  return v_saldo;
end $fn$;

revoke execute on function public.estoque_ajuste_de_correcao(uuid, uuid, numeric, boolean, text, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.estoque_ajuste_de_correcao(uuid, uuid, numeric, boolean, text, text, uuid, text, timestamptz) to service_role;

CREATE OR REPLACE FUNCTION public.metrics_perdas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(motivo text, product_id uuid, produto text, unidade text, embalagem text, quantidade numeric, embalagens numeric, custo numeric, movimentos bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with perdas as (
    select m.motivo_da_perda as motivo, m.product_id,
           abs(m.quantity) as qtd,
           abs(m.quantity) / public.fator_de_consumo(p) as emb,
           public.custo_do_movimento(m, p) as custo
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'LOSS' and m.quantity < 0 and m.desfeita_em is null
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- D5 da 10ª: o ajuste de inventário que achou MENOS é perda ("Inventário").
    -- D5 da 11ª: o desfeito não é, nem o movimento que desfaz um ajuste.
    -- A40 da 12ª: a entrega do brinde (voucher) não é inventário — vai abaixo.
    -- A10 da 24ª: a correção de cadastro não é perda.
    select 'INVENTARIO', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p)
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
       and coalesce(m.reference, '') not like 'voucher:%'
       and not m.correcao_de_cadastro
       and m.desfeita_em is null
       and not exists (select 1 from public.stock_movements o where o.desfeita_pelo = m.id)
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- A40 da 12ª: o brinde da fidelidade entregue, pelo custo do lote.
    select 'BRINDE', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p)
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
       and m.reference like 'voucher:%'
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- A venda estornada que não voltou: o que ainda estava com a cliente
    -- (sem o que a devolução em parte já levou).
    select 'VENDA_ESTORNADA', coalesce(i.product_id, v.product_id),
           (coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0)) * public.fator_de_consumo(p),
           (coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0))::numeric,
           coalesce(i.custo - coalesce(i.custo_devolvido, 0), v.custo)
      from public.product_sales v
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      left join public.product_sale_items i on i.sale_id = v.id
      left join public.products p on p.id = coalesce(i.product_id, v.product_id)
     where v.tenant_id = p_tenant
       and v.estornada_em is not null and v.produto_voltou = false
       and coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0) > 0
       and (p_branch_ids is null or v.branch_id = any (p_branch_ids))
       and v.estornada_em between p_from and p_to
    union all
    -- A devolução em parte que não voltou ao estoque (A34 da 8ª).
    select 'VENDA_ESTORNADA', i.product_id,
           r.quantidade * public.fator_de_consumo(p),
           r.quantidade::numeric,
           r.custo
      from public.product_sale_returns r
      join public.product_sales v on v.id = r.sale_id
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      join public.product_sale_items i on i.id = r.item_id
      left join public.products p on p.id = i.product_id
     where r.tenant_id = p_tenant and not r.voltou
       and (p_branch_ids is null or v.branch_id = any (p_branch_ids))
       and r.created_at between p_from and p_to
  )
  select x.motivo,
         x.product_id,
         case when grouping(x.product_id) = 0 then max(p.name) end,
         case when grouping(x.product_id) = 0 then max(case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end) end,
         case when grouping(x.product_id) = 0 then max(p.unit) end,
         case when grouping(x.product_id) = 0 then sum(x.qtd) end,
         case when grouping(x.product_id) = 0 then round(sum(x.emb), 4) end,
         round(coalesce(sum(x.custo), 0), 2),
         count(*)
    from perdas x
    left join public.products p on p.id = x.product_id
   group by grouping sets ((x.motivo, x.product_id), (x.motivo), ())
$function$;

-- O custo do lote se CORRIGE enquanto nada saiu dele (decisão do Heitor,
-- 18/11, "As duas"). É o custo da entrada que o criou (a de `custo_do_lote`);
-- o lote que veio por transferência herda o custo do de origem e se corrige
-- lá. A Auditoria guarda o antes e o depois (o gatilho de stock_movements
-- passa a guardar o `unit_cost`). O cadastro do produto acompanha quando esta
-- é a entrada mais recente com custo (é o que a Entrada faz).
create or replace function public.estoque_lote_entrada_editavel(p_lote uuid)
returns uuid language sql stable set search_path = '' as $fn$
  select m.id
    from public.stock_movement_batches smb
    join public.stock_movements m on m.id = smb.movement_id
   where smb.batch_id = p_lote and m.quantity > 0 and m.unit_cost is not null
     and m.type in ('PURCHASE', 'MANUAL_ADJUSTMENT')
     and m.desfeita_em is null
     and not exists (
       select 1 from public.stock_movement_batches s2
         join public.stock_movements m2 on m2.id = s2.movement_id
        where s2.batch_id = p_lote and m2.quantity < 0)
   order by m.created_at, m.id
   limit 1
$fn$;

revoke execute on function public.estoque_lote_entrada_editavel(uuid) from public, anon, authenticated;
grant execute on function public.estoque_lote_entrada_editavel(uuid) to service_role;

-- Quais lotes da lista têm o custo editável (a tela mostra "Corrigir custo").
create or replace function public.lotes_com_custo_editavel(p_lotes uuid[])
returns table(lote uuid) language sql stable set search_path = '' as $fn$
  select l from unnest(p_lotes) l where public.estoque_lote_entrada_editavel(l) is not null
$fn$;

revoke execute on function public.lotes_com_custo_editavel(uuid[]) from public, anon, authenticated;
grant execute on function public.lotes_com_custo_editavel(uuid[]) to service_role;

create or replace function public.estoque_corrigir_custo_do_lote(
  p_tenant uuid, p_lote uuid, p_custo_embalagem numeric
) returns numeric
language plpgsql security definer set search_path = '' as $fn$
declare
  v_entrada  uuid;
  v_fator    numeric;
  v_antes    numeric;
  v_mov      public.stock_movements%rowtype;
begin
  if p_custo_embalagem is null or p_custo_embalagem < 0 then
    raise exception 'Informe um custo de zero ou mais.' using errcode = 'P0001';
  end if;
  perform 1
    from public.product_batches l
    join public.branches b on b.id = l.branch_id
   where l.id = p_lote and b.tenant_id = p_tenant
   for update of l;
  if not found then
    raise exception 'Lote não encontrado.' using errcode = 'P0001';
  end if;

  v_entrada := public.estoque_lote_entrada_editavel(p_lote);
  if v_entrada is null then
    if exists (select 1 from public.stock_movement_batches s join public.stock_movements m on m.id = s.movement_id
                where s.batch_id = p_lote and m.quantity < 0) then
      raise exception 'Já saiu produto deste lote: o custo não se corrige mais aqui. Use o Ajuste com o motivo "Correção de cadastro".'
        using errcode = 'P0001';
    end if;
    raise exception 'Este lote veio de uma transferência: o custo é o do lote de origem. Corrija lá.' using errcode = 'P0001';
  end if;

  select m.* into v_mov from public.stock_movements m where m.id = v_entrada for update;
  select public.fator_de_consumo(p) into v_fator from public.products p where p.id = v_mov.product_id;
  v_fator := coalesce(nullif(v_fator, 0), 1);
  v_antes := round(v_mov.unit_cost * v_fator, 2);

  update public.stock_movements set unit_cost = p_custo_embalagem / v_fator where id = v_entrada;

  -- O cadastro acompanha a entrada mais recente com custo (como a Entrada).
  if not exists (
    select 1 from public.stock_movements o
     where o.product_id = v_mov.product_id and o.id <> v_mov.id and o.quantity > 0 and o.unit_cost is not null
       and o.type in ('PURCHASE', 'MANUAL_ADJUSTMENT') and o.desfeita_em is null
       and (o.created_at, o.id) > (v_mov.created_at, v_mov.id)) then
    update public.products set cost_price = p_custo_embalagem, updated_at = now() where id = v_mov.product_id;
  end if;

  return v_antes;
end $fn$;

revoke execute on function public.estoque_corrigir_custo_do_lote(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.estoque_corrigir_custo_do_lote(uuid, uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- 4. A Auditoria guarda o antes e o depois
-- ---------------------------------------------------------------------------

-- A33: o lançamento editado ("valor, data de referência, pago e mais 3 campos"
-- não dizia de quanto para quanto). A descrição e o fornecedor não são dado
-- clínico; o `notes` (texto livre) continua de fora.
drop trigger if exists auditoria_ins on public.financial_transactions;
drop trigger if exists auditoria_upd on public.financial_transactions;
drop trigger if exists auditoria_del on public.financial_transactions;
create trigger auditoria_ins after insert on public.financial_transactions referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'type,status,amount,payment_method,due_date,paid_at,category,is_paid,data_de_referencia,description,parcela_numero,parcela_total,cartao_vezes,fornecedor,nota_fiscal', '', '');
create trigger auditoria_upd after update on public.financial_transactions referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'type,status,amount,payment_method,due_date,paid_at,category,is_paid,data_de_referencia,description,parcela_numero,parcela_total,cartao_vezes,fornecedor,nota_fiscal', '', '');
create trigger auditoria_del after delete on public.financial_transactions referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'type,status,amount,payment_method,due_date,paid_at,category,is_paid,data_de_referencia,description,parcela_numero,parcela_total,cartao_vezes,fornecedor,nota_fiscal', '', '');

-- A10: o custo corrigido do lote (o movimento) e o do cadastro (o produto).
drop trigger if exists auditoria_ins on public.stock_movements;
drop trigger if exists auditoria_upd on public.stock_movements;
drop trigger if exists auditoria_del on public.stock_movements;
create trigger auditoria_ins after insert on public.stock_movements referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'type,quantity,product_id,unit_cost,correcao_de_cadastro', '', '');
create trigger auditoria_upd after update on public.stock_movements referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'type,quantity,product_id,unit_cost,correcao_de_cadastro', '', '');
create trigger auditoria_del after delete on public.stock_movements referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'type,quantity,product_id,unit_cost,correcao_de_cadastro', '', '');

drop trigger if exists auditoria_ins on public.products;
drop trigger if exists auditoria_upd on public.products;
drop trigger if exists auditoria_del on public.products;
create trigger auditoria_ins after insert on public.products referencing new table as novas
  for each statement execute function private.auditar('normal', 'name', 'is_active,category,cost_price', '', '');
create trigger auditoria_upd after update on public.products referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', 'name', 'is_active,category,cost_price', '', '');
create trigger auditoria_del after delete on public.products referencing old table as velhas
  for each statement execute function private.auditar('normal', 'name', 'is_active,category,cost_price', '', '');

notify pgrst, 'reload schema';
