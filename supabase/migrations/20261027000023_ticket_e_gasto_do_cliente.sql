-- O ticket médio é dos atendimentos COBRADOS, o gasto da cliente é UMA conta,
-- e o "a receber" por unidade vale pelo vencimento (simulação de 2026-10-27,
-- decisões do Heitor).
--
-- Ticket médio (o engano e o atrito da simulação): era a receita de serviço ÷
-- TODOS os concluídos, e a avaliação de R$ 0 puxava a média para baixo — R$ 90
-- numa clínica que só tinha limpezas de R$ 180. Agora o denominador são os
-- concluídos COBRADOS (preço > 0): `appointments_charged` em metrics_core e
-- metrics_by_branch. A divisão mora em lib/metrics (`ticketMedio`).
--
-- A26: a ficha da Mariana mostrava "ticket médio R$ 0,00" ao lado de "LTV
-- R$ 600", e Relatórios → Clientes, "Gasto médio R$ 390", cada um de uma
-- conta. Agora o gasto de cada cliente sai de UMA função
-- (metrics_gasto_por_cliente): o pago (a regra de receita de sempre), a
-- receita de serviço, os concluídos e os cobrados. A ficha a chama com a
-- cliente e a janela inteira (LTV e ticket); os relatórios, com o período (o
-- gasto médio e o top clientes). metrics_do_cliente era a cópia da ficha e passa a ler dela.
--
-- A34: o "A receber" de cada unidade (metrics_by_branch) contava pela CRIAÇÃO
-- do lançamento; o da rede (metrics_core) já contava pelo vencimento
-- (data_de_referencia). Os dois agora pelo vencimento, como a tela diz.

create or replace function public.metrics_gasto_por_cliente(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz, p_cliente uuid default null
)
returns table (client_id uuid, pago numeric, receita_servico numeric, atendimentos bigint, atendimentos_cobrados bigint)
language sql
stable
set search_path = ''
as $fn$
  with pagos as (
    select t.client_id, sum(t.amount) pago
      from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to) t
     where t.client_id is not null and (p_cliente is null or t.client_id = p_cliente)
     group by t.client_id
  ),
  atend as (
    select a.client_id, sum(coalesce(a.price, 0)) receita, count(*) n,
           count(*) filter (where coalesce(a.price, 0) > 0) cobrados
      from public.appointments a
      join public.branches b on b.id = a.branch_id
     where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
       and a.status = 'COMPLETED' and a.aconteceu_em between p_from and p_to
       and a.client_id is not null and (p_cliente is null or a.client_id = p_cliente)
     group by a.client_id
  )
  -- `pago` nulo = a cliente não pagou nada na janela (zero pago com pontos é 0).
  select coalesce(p.client_id, x.client_id), p.pago, coalesce(x.receita, 0), coalesce(x.n, 0), coalesce(x.cobrados, 0)
    from pagos p
    full join atend x on x.client_id = p.client_id
$fn$;

revoke all on function public.metrics_gasto_por_cliente(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_gasto_por_cliente(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

-- metrics_do_cliente vira a mesma conta (o app deixa de chamá-la; fica para
-- quem ainda a lê, como o cenário dos indicadores, até sair numa limpeza).
create or replace function public.metrics_do_cliente(p_tenant uuid, p_client uuid)
returns jsonb
language sql
stable
set search_path = ''
as $fn$
  select jsonb_build_object(
    'ltv', coalesce(g.pago, 0), 'atendimentos', coalesce(g.atendimentos, 0),
    'receita_servico', coalesce(g.receita_servico, 0), 'atendimentos_cobrados', coalesce(g.atendimentos_cobrados, 0))
  from (select 1) um
  left join public.metrics_gasto_por_cliente(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz, p_client) g on true
$fn$;

drop function if exists public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid);
create function public.metrics_core(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
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
            where a.id = t.appointment_id and a.professional_id = p_professional_id))
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
  )
  select
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and t.is_paid
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and not t.is_paid
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'EXPENSE' and t.is_paid
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(a.price) from appt a where a.status = 'COMPLETED'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED'),
    (select count(*) from appt),
    (select count(*) from appt a where a.status = 'CANCELLED'),
    (select count(*) from appt a where a.status = 'NO_SHOW'),
    coalesce((select sum(a.duration_min) from appt a
               where a.status not in ('CANCELLED', 'NO_SHOW')), 0),
    case when p_professional_id is null
         then (select count(*) from public.clients c
                 where c.tenant_id = p_tenant
                   and c.created_at between p_from and p_to
                   and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids)))
         else 0 end,
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0),
    -- Os concluídos COBRADOS (preço > 0): o denominador do ticket médio.
    (select count(*) from appt a where a.status = 'COMPLETED' and coalesce(a.price, 0) > 0);
$function$;

revoke all on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

drop function if exists public.metrics_by_branch(uuid, timestamptz, timestamptz);
create function public.metrics_by_branch(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(branch_id uuid, branch_name text, branch_slug text, is_active boolean, revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, transactions_count bigint, appointments_charged bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    b.id, b.name, b.slug, b.is_active,
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    -- Pelo VENCIMENTO (data_de_referencia), como metrics_core (A34).
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and not t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'EXPENSE' and t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
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
    (select count(*) from public.clients c
       where c.branch_id = b.id and c.created_at between p_from and p_to),
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

revoke all on function public.metrics_by_branch(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_by_branch(uuid, timestamptz, timestamptz) to service_role;

-- metrics_relatorio: o de 20261027000011, com o gasto dos clientes vindo de
-- metrics_gasto_por_cliente (o resto igual).
create or replace function public.metrics_relatorio(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_prev_from timestamp with time zone, p_prev_to timestamp with time zone, p_aba text, p_granularidade text default 'day'::text)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  unidades uuid[];
  r jsonb := '{}'::jsonb;
begin
  select array_agg(b.id) into unidades
  from public.branches b
  where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids));
  unidades := coalesce(unidades, '{}');

  -- Dinheiro por unidade — visão geral e financeiro (atual e anterior).
  if p_aba in ('overview', 'financeiro') then
    r := r || jsonb_build_object(
      'receita_por_unidade', coalesce((
        select jsonb_agg(jsonb_build_object('branch_id', u.id, 'atual', coalesce(a.v, 0), 'anterior', coalesce(p.v, 0)))
        from unnest(unidades) as u(id)
        left join (select branch_id, sum(amount) v from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to) group by branch_id) a on a.branch_id = u.id
        left join (select branch_id, sum(amount) v from public.metrics_receitas_pagas(p_tenant, unidades, p_prev_from, p_prev_to) group by branch_id) p on p.branch_id = u.id
      ), '[]'::jsonb),
      'receita_por_forma', coalesce((
        select jsonb_agg(jsonb_build_object('forma', forma, 'valor', v))
        from (select payment_method forma, sum(amount) v
              from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to)
              where payment_method is not null group by payment_method) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'financeiro' then
    r := r || jsonb_build_object(
      'receita_por_categoria', coalesce((
        select jsonb_agg(jsonb_build_object('categoria', categoria, 'valor', v))
        from (select category categoria, sum(amount) v
              from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to)
              where category is not null group by category) x
      ), '[]'::jsonb)
    );
  end if;

  -- Consumo de insumos — a MESMA conta de metrics_giro_estoque (custo do
  -- movimento; sem ele, o de consumo do cadastro). Indicador gerencial: o
  -- gráfico de evolução não o soma à despesa (a compra já é despesa).
  if p_aba in ('overview', 'financeiro', 'estoque') then
    r := r || jsonb_build_object(
      'consumo_total', public.metrics_giro_estoque(unidades, p_from, p_to),
      'consumo_por_fatia', coalesce((
        select jsonb_agg(jsonb_build_object('chave', chave, 'valor', v))
        from (
          select case when p_granularidade = 'hour'
                   then extract(hour from m.created_at at time zone 'America/Sao_Paulo')::int::text
                   else to_char(m.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') end as chave,
                 sum(public.custo_do_movimento(m, pr)) v
          from public.stock_movements m
          left join public.products pr on pr.id = m.product_id
          where m.branch_id = any (unidades) and m.type = 'PROCEDURE_USAGE'
            and m.created_at between p_from and p_to
          group by 1
        ) x
      ), '[]'::jsonb)
    );
  end if;

  -- Atendimentos concluídos por procedimento e por profissional (receita =
  -- preço do atendimento, a serviceRevenue de metrics_core).
  if p_aba in ('overview', 'procedimentos', 'profissionais') then
    r := r || jsonb_build_object(
      'por_procedimento', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'categoria', categoria, 'receita', receita, 'execucoes', n))
        from (select pr.name nome, coalesce(pr.category, '—') categoria, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.procedures pr on pr.id = a.procedure_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.aconteceu_em between p_from and p_to
              group by pr.name, pr.category) x
      ), '[]'::jsonb),
      'por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'receita', receita, 'atendimentos', n))
        from (select u.name nome, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.users u on u.id = a.professional_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.aconteceu_em between p_from and p_to
              group by u.name) x
      ), '[]'::jsonb)
    );
  end if;

  -- Agendamentos de qualquer status.
  if p_aba in ('overview', 'agenda') then
    r := r || jsonb_build_object(
      'agendamentos_por_status', coalesce((
        select jsonb_agg(jsonb_build_object('status', status, 'n', n))
        from (select a.status::text status, count(*) n from public.appointments a
              where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
              group by a.status) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'agenda' then
    r := r || jsonb_build_object(
      -- 0 = domingo, no fuso da clínica (weekdayTZ).
      'por_dia_da_semana', coalesce((
        select jsonb_agg(jsonb_build_object('dia', dia, 'n', n))
        from (select extract(dow from a.aconteceu_em at time zone 'America/Sao_Paulo')::int dia, count(*) n
              from public.appointments a
              where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
              group by 1) x
      ), '[]'::jsonb),
      'por_origem', coalesce((
        select jsonb_agg(jsonb_build_object('origem', origem, 'n', n))
        from (select a.source::text origem, count(*) n from public.appointments a
              where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
                and a.source is not null
              group by a.source) x
      ), '[]'::jsonb),
      'agenda_por_unidade', coalesce((
        select jsonb_agg(jsonb_build_object('branch_id', u.id, 'total', coalesce(x.total, 0),
                 'concluidos', coalesce(x.concluidos, 0), 'cancelados', coalesce(x.cancelados, 0),
                 'faltas', coalesce(x.faltas, 0)))
        from unnest(unidades) as u(id)
        left join (
          select a.branch_id, count(*) total,
                 count(*) filter (where a.status = 'COMPLETED') concluidos,
                 count(*) filter (where a.status = 'CANCELLED') cancelados,
                 count(*) filter (where a.status = 'NO_SHOW') faltas
          from public.appointments a
          where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
          group by a.branch_id
        ) x on x.branch_id = u.id
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'clientes' then
    r := r || (
      with ativos as (
        select c.id, c.name, c.gender, c.city, c.birth_date
        from public.clients c where c.tenant_id = p_tenant and c.is_active
      ),
      -- O gasto de cada cliente é UMA conta (metrics_gasto_por_cliente), a
      -- mesma da ficha da cliente (A26, 2026-10-27).
      gasto as (
        select g.client_id, g.pago total, g.atendimentos n
        from public.metrics_gasto_por_cliente(p_tenant, unidades, p_from, p_to) g
        where g.pago is not null
      )
      select jsonb_build_object(
        'total_ativos', (select count(*) from ativos),
        'por_faixa', coalesce((select jsonb_agg(jsonb_build_object('faixa', f, 'n', n))
                               from (select public.metrics_faixa_etaria(birth_date) f, count(*) n
                                     from ativos where birth_date is not null group by 1) x), '[]'::jsonb),
        'por_genero', coalesce((select jsonb_agg(jsonb_build_object('genero', gender, 'n', n))
                                from (select gender, count(*) n from ativos where gender is not null group by gender) x), '[]'::jsonb),
        'cidades', coalesce((select jsonb_agg(jsonb_build_object('cidade', city, 'n', n) order by n desc, city)
                             from (select city, count(*) n from ativos where city is not null and city <> ''
                                   group by city order by n desc, city limit 10) x), '[]'::jsonb),
        'gasto_medio', coalesce((select avg(total) from gasto), 0),
        'top_clientes', coalesce((
          select jsonb_agg(jsonb_build_object('nome', coalesce(c.name, left(g.client_id::text, 8)),
                   'total', g.total, 'atendimentos', coalesce(g.n, 0)) order by g.total desc)
          from (select * from gasto order by total desc limit 10) g
          left join public.clients c on c.id = g.client_id
        ), '[]'::jsonb)
      )
    );
  end if;

  if p_aba = 'procedimentos' then
    r := r || (
      -- Custo = insumos (ao custo de CONSUMO) + mão de obra + outros — a MESMA
      -- conta da margem do dashboard (metrics_custo_dos_procedimentos). Só
      -- existe para procedimento com insumo cadastrado (como a tela sempre
      -- considerou), e margem só com custo > 0.
      with custo as (
        select c.procedure_id, c.custo
          from public.metrics_custo_dos_procedimentos(p_tenant) c
         where c.com_insumos
      ),
      feitos as (
        select pr.name nome, public.metrics_faixa_etaria(c.birth_date) faixa,
               coalesce(a.price, 0) preco, cu.custo
        from public.appointments a
        join public.procedures pr on pr.id = a.procedure_id
        left join public.clients c on c.id = a.client_id
        left join custo cu on cu.procedure_id = a.procedure_id
        where a.branch_id = any (unidades) and a.status = 'COMPLETED'
          and a.aconteceu_em between p_from and p_to
      ),
      volume as (
        select coalesce(faixa, 'Não informado') faixa, nome, count(*) n,
               row_number() over (partition by coalesce(faixa, 'Não informado') order by count(*) desc, nome) pos
        from feitos group by 1, 2
      ),
      margem as (
        select coalesce(faixa, 'Não informado') faixa, nome,
               avg(case when preco > 0 then (preco - custo) / preco * 100 else 0 end) m,
               row_number() over (partition by coalesce(faixa, 'Não informado')
                                  order by avg(case when preco > 0 then (preco - custo) / preco * 100 else 0 end) desc, nome) pos
        from feitos where custo > 0 group by 1, 2
      )
      select jsonb_build_object(
        'tem_custos', exists (select 1 from custo),
        'volume_por_faixa', coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'nome', nome, 'n', n) order by faixa, pos)
                                      from volume where pos <= 3), '[]'::jsonb),
        'margem_por_faixa', coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'nome', nome, 'margem', m) order by faixa, pos)
                                      from margem where pos <= 3), '[]'::jsonb)
      )
    );
  end if;

  if p_aba = 'profissionais' then
    r := r || jsonb_build_object(
      -- O período da comissão é o do LANÇAMENTO (released_at) — o mesmo
      -- recorte de metrics_core e do fechamento.
      'comissoes_por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'aberta', aberta, 'paga', paga))
        from (select u.name nome,
                     coalesce(sum(c.amount) filter (where c.status = 'OPEN'), 0) aberta,
                     coalesce(sum(c.amount) filter (where c.status = 'PAID'), 0) paga
              from public.commissions c
              join public.users u on u.id = c.professional_id
              where c.branch_id = any (unidades) and c.released_at between p_from and p_to
              group by u.name) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'estoque' then
    r := r || (
      -- O valor é o saldo em consumo × o custo de consumo (valor_do_saldo), a
      -- conta de metrics_valor_em_estoque. Crítico e zerado seguem em embalagens.
      with saldo as (
        select s.branch_id, s.current_stock, s.min_stock,
               public.valor_do_saldo(s, pr) valor, pr.category, pr.is_active
        from public.branch_product_stock s
        join public.products pr on pr.id = s.product_id
        where s.branch_id = any (unidades)
      )
      select jsonb_build_object(
        'valor_em_estoque', coalesce((select sum(valor) from saldo), 0),
        'criticos', (select count(*) from saldo where current_stock > 0 and min_stock > 0 and current_stock <= min_stock),
        'zerados',  (select count(*) from saldo where current_stock = 0 and is_active is distinct from false),
        'valor_por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', category, 'valor', v))
                                         from (select category, sum(valor) v from saldo
                                               where category is not null group by category) x), '[]'::jsonb),
        'estoque_por_unidade', coalesce((
          select jsonb_agg(jsonb_build_object('branch_id', u.id, 'itens', coalesce(x.itens, 0),
                   'zerados', coalesce(x.zerados, 0), 'criticos', coalesce(x.criticos, 0), 'valor', coalesce(x.valor, 0)))
          from unnest(unidades) as u(id)
          left join (
            select branch_id, count(*) itens,
                   count(*) filter (where current_stock = 0 and is_active is distinct from false) zerados,
                   count(*) filter (where current_stock > 0 and min_stock > 0 and current_stock <= min_stock) criticos,
                   sum(valor) valor
            from saldo group by branch_id
          ) x on x.branch_id = u.id
        ), '[]'::jsonb),
        'mais_consumidos', coalesce((
          select jsonb_agg(jsonb_build_object('nome', nome, 'valor', v) order by v desc)
          from (select pr.name nome, sum(public.custo_do_movimento(m, pr)) v
                from public.stock_movements m join public.products pr on pr.id = m.product_id
                where m.branch_id = any (unidades) and m.type = 'PROCEDURE_USAGE'
                  and m.created_at between p_from and p_to
                group by pr.name order by 2 desc limit 10) x
        ), '[]'::jsonb)
      )
    );
  end if;

  return r;
end;
$function$;

notify pgrst, 'reload schema';
