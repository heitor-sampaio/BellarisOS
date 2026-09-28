-- Os relatórios agregados no Postgres (CLAUDE.md §13.1).
--
-- A tela de relatórios buscava as LINHAS do período — transações (até 5000),
-- atendimentos, agendamentos, comissões, movimentos de estoque, saldos e a base
-- inteira de clientes — e fazia umas 40 contas em JavaScript. Dois problemas:
--
--  1. Corte: o PostgREST devolve no máximo 1000 linhas (5000 com o limit que a
--     consulta de transações pedia). Passando disso, cada número subcontava em
--     silêncio.
--  2. Segunda cópia da regra: "faturamento por unidade", "forma de pagamento"
--     e "receita por categoria" somavam por `created_at` e COM estorno,
--     enquanto o KPI logo acima (metrics_core) usa `paid_at` e tira o estorno
--     dos dois lados. Na mesma tela, dois faturamentos — o defeito que já tinha
--     posto R$ 5.200 no cartão e R$ 5.450 no gráfico.
--
-- `metrics_receitas_pagas` é o conjunto canônico de receita (o mesmo predicado
-- de metrics_core.revenue_cash), e todo agrupamento de dinheiro daqui parte
-- dele. `metrics_relatorio` devolve só o que a aba aberta desenha.

create or replace function public.metrics_receitas_pagas(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns setof public.financial_transactions
language sql
stable
set search_path = ''
as $fn$
  select t.*
  from public.financial_transactions t
  join public.branches b on b.id = t.branch_id
  where b.tenant_id = p_tenant
    and (p_branch_ids is null or b.id = any (p_branch_ids))
    and t.type = 'INCOME' and t.is_paid
    and coalesce(t.notes, '')    <> 'Estornada'
    and coalesce(t.category, '') <> 'Estorno'
    and coalesce(t.paid_at, t.created_at) between p_from and p_to;
$fn$;

-- Faixa etária dos relatórios. A data de nascimento é gravada como meia-noite
-- em UTC, e em UTC continua no dia certo; o "hoje" é o da clínica.
create or replace function public.metrics_faixa_etaria(p_nascimento timestamptz)
returns text
language sql
stable
set search_path = ''
as $fn$
  select case
    when p_nascimento is null then null
    else (
      with a as (
        select extract(year from age(
          (now() at time zone 'America/Sao_Paulo')::date,
          (p_nascimento at time zone 'UTC')::date))::int as anos
      )
      select case
        when anos < 18 then '< 18'
        when anos < 25 then '18–24'
        when anos < 35 then '25–34'
        when anos < 45 then '35–44'
        when anos < 55 then '45–54'
        when anos < 65 then '55–64'
        else '65+'
      end from a
    )
  end;
$fn$;

create or replace function public.metrics_relatorio(
  p_tenant       uuid,
  p_branch_ids   uuid[],
  p_from         timestamptz,
  p_to           timestamptz,
  p_prev_from    timestamptz,
  p_prev_to      timestamptz,
  p_aba          text,
  p_granularidade text default 'day'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $fn$
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
  -- movimento, custo atual só quando o movimento não guardou o seu).
  if p_aba in ('overview', 'financeiro', 'estoque') then
    r := r || jsonb_build_object(
      'consumo_total', public.metrics_giro_estoque(unidades, p_from, p_to),
      'consumo_por_fatia', coalesce((
        select jsonb_agg(jsonb_build_object('chave', chave, 'valor', v))
        from (
          select case when p_granularidade = 'hour'
                   then extract(hour from m.created_at at time zone 'America/Sao_Paulo')::int::text
                   else to_char(m.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') end as chave,
                 sum(abs(m.quantity) * coalesce(m.unit_cost, pr.cost_price, 0)) v
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
                and a.scheduled_at between p_from and p_to
              group by pr.name, pr.category) x
      ), '[]'::jsonb),
      'por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'receita', receita, 'atendimentos', n))
        from (select u.name nome, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.users u on u.id = a.professional_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.scheduled_at between p_from and p_to
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
              where a.branch_id = any (unidades) and a.scheduled_at between p_from and p_to
              group by a.status) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'agenda' then
    r := r || jsonb_build_object(
      -- 0 = domingo, no fuso da clínica (weekdayTZ).
      'por_dia_da_semana', coalesce((
        select jsonb_agg(jsonb_build_object('dia', dia, 'n', n))
        from (select extract(dow from a.scheduled_at at time zone 'America/Sao_Paulo')::int dia, count(*) n
              from public.appointments a
              where a.branch_id = any (unidades) and a.scheduled_at between p_from and p_to
              group by 1) x
      ), '[]'::jsonb),
      'por_origem', coalesce((
        select jsonb_agg(jsonb_build_object('origem', origem, 'n', n))
        from (select a.source::text origem, count(*) n from public.appointments a
              where a.branch_id = any (unidades) and a.scheduled_at between p_from and p_to
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
          where a.branch_id = any (unidades) and a.scheduled_at between p_from and p_to
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
      gasto as (
        select client_id, sum(amount) total
        from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to)
        where client_id is not null group by client_id
      ),
      atend as (
        select a.client_id, count(*) n from public.appointments a
        where a.branch_id = any (unidades) and a.status = 'COMPLETED'
          and a.scheduled_at between p_from and p_to and a.client_id is not null
        group by a.client_id
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
                   'total', g.total, 'atendimentos', coalesce(at.n, 0)) order by g.total desc)
          from (select * from gasto order by total desc limit 10) g
          left join public.clients c on c.id = g.client_id
          left join atend at on at.client_id = g.client_id
        ), '[]'::jsonb)
      )
    );
  end if;

  if p_aba = 'procedimentos' then
    r := r || (
      -- Custo = insumos + mão de obra + outros, e só existe para procedimento
      -- com insumo cadastrado (como a tela sempre considerou). Margem só com
      -- custo > 0.
      with custo as (
        select pp.procedure_id,
               sum(coalesce(pp.quantity, 0) * coalesce(pr.cost_price, 0))
                 + max(coalesce(p.labor_cost, 0) + coalesce(p.other_costs, 0)) custo
        from public.procedure_products pp
        join public.procedures p on p.id = pp.procedure_id
        left join public.products pr on pr.id = pp.product_id
        where p.tenant_id = p_tenant
        group by pp.procedure_id
      ),
      feitos as (
        select pr.name nome, public.metrics_faixa_etaria(c.birth_date) faixa,
               coalesce(a.price, 0) preco, cu.custo
        from public.appointments a
        join public.procedures pr on pr.id = a.procedure_id
        left join public.clients c on c.id = a.client_id
        left join custo cu on cu.procedure_id = a.procedure_id
        where a.branch_id = any (unidades) and a.status = 'COMPLETED'
          and a.scheduled_at between p_from and p_to
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
      -- O período da comissão é o do atendimento que a gerou (commissions não
      -- tem created_at) — o mesmo recorte de metrics_core.
      'comissoes_por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'aberta', aberta, 'paga', paga))
        from (select u.name nome,
                     coalesce(sum(c.amount) filter (where c.status = 'OPEN'), 0) aberta,
                     coalesce(sum(c.amount) filter (where c.status = 'PAID'), 0) paga
              from public.commissions c
              join public.appointments a on a.id = c.appointment_id
              join public.users u on u.id = c.professional_id
              where c.branch_id = any (unidades) and a.scheduled_at between p_from and p_to
              group by u.name) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'estoque' then
    r := r || (
      with saldo as (
        select s.branch_id, s.current_stock, s.min_stock,
               coalesce(pr.cost_price, 0) custo, pr.category, pr.is_active
        from public.branch_product_stock s
        join public.products pr on pr.id = s.product_id
        where s.branch_id = any (unidades)
      )
      select jsonb_build_object(
        'valor_em_estoque', coalesce((select sum(current_stock * custo) from saldo), 0),
        'criticos', (select count(*) from saldo where current_stock > 0 and min_stock > 0 and current_stock <= min_stock),
        'zerados',  (select count(*) from saldo where current_stock = 0 and is_active is distinct from false),
        'valor_por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', category, 'valor', v))
                                         from (select category, sum(current_stock * custo) v from saldo
                                               where category is not null group by category) x), '[]'::jsonb),
        'estoque_por_unidade', coalesce((
          select jsonb_agg(jsonb_build_object('branch_id', u.id, 'itens', coalesce(x.itens, 0),
                   'zerados', coalesce(x.zerados, 0), 'criticos', coalesce(x.criticos, 0), 'valor', coalesce(x.valor, 0)))
          from unnest(unidades) as u(id)
          left join (
            select branch_id, count(*) itens,
                   count(*) filter (where current_stock = 0 and is_active is distinct from false) zerados,
                   count(*) filter (where current_stock > 0 and min_stock > 0 and current_stock <= min_stock) criticos,
                   sum(current_stock * custo) valor
            from saldo group by branch_id
          ) x on x.branch_id = u.id
        ), '[]'::jsonb),
        'mais_consumidos', coalesce((
          select jsonb_agg(jsonb_build_object('nome', nome, 'valor', v) order by v desc)
          from (select pr.name nome, sum(abs(m.quantity) * coalesce(m.unit_cost, pr.cost_price, 0)) v
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
$fn$;

revoke all on function public.metrics_receitas_pagas(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_receitas_pagas(uuid, uuid[], timestamptz, timestamptz) to service_role;
revoke all on function public.metrics_faixa_etaria(timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_faixa_etaria(timestamptz) to service_role;
revoke all on function public.metrics_relatorio(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.metrics_relatorio(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, text, text) to service_role;
