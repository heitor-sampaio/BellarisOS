-- "Quem tem 'só os meus' vê 'só os meus', em qualquer lugar" (decisão do
-- Heitor, 2026-10-28) — os Relatórios e o Copilot. A frente G
-- (20261028000601) fez os dashboards; o Copilot (ferramenta `indicadores`) e
-- a tela de Relatórios chamavam metrics_relatorio e metrics_vendas sem o
-- profissional, e quem tem a agenda "só os meus" recebia a rede.
--
-- Cada função ganha `p_professional_id uuid default null` (com o nulo, nada
-- muda), com os MESMOS predicados de metrics_core / 20261028000601:
--   - atendimento dela: appointments.professional_id = ela;
--   - dinheiro dela: a transação ligada a um atendimento dela
--     (t.appointment_id → appointments.professional_id = ela);
--   - cliente dela: quem tem agendamento NÃO CANCELADO com ela numa unidade
--     do recorte;
--   - consumo dela: o movimento de estoque ligado a um atendimento dela (o de
--     metrics_giro_estoque);
--   - venda dela (DECISÃO NOVA): a pessoa que a coluna "Profissional" da
--     venda mostra — quem atendeu o procedimento avulso, quem vendeu o pacote
--     e o pré-pago, a dona do plano.
-- O que não se atribui a ela (o saldo e o valor em estoque) fica como está:
-- a tela e o Copilot não o mostram com "só os meus".
--
-- Corpos da produção (pg_get_functiondef em 2026-10-29) com o recorte a
-- mais. Parâmetro novo muda a assinatura: a antiga sai (sem sobrecarga
-- ambígua). Só service_role, como antes.

-- ---------------------------------------------------------------------------
-- metrics_receitas_pagas: o conjunto canônico, recortável pelo dinheiro dela.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_receitas_pagas(uuid, uuid[], timestamptz, timestamptz);

create function public.metrics_receitas_pagas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns setof public.financial_transactions
 language sql
 stable
 set search_path to ''
as $function$
  select t.*
  from public.financial_transactions t
  join public.branches b on b.id = t.branch_id
  where b.tenant_id = p_tenant
    and (p_branch_ids is null or b.id = any (p_branch_ids))
    and t.type = 'INCOME' and t.is_paid
    and coalesce(t.notes, '')    <> 'Estornada'
    and coalesce(t.category, '') <> 'Estorno'
    and coalesce(t.paid_at, t.created_at) between p_from and p_to
    and (p_professional_id is null or exists (
          select 1 from public.appointments a
          where a.id = t.appointment_id and a.professional_id = p_professional_id));
$function$;

-- ---------------------------------------------------------------------------
-- metrics_gasto_por_cliente: o pago e os atendimentos DELA.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_gasto_por_cliente(uuid, uuid[], timestamptz, timestamptz, uuid);

create function public.metrics_gasto_por_cliente(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_cliente uuid default null::uuid, p_professional_id uuid default null)
 returns table(client_id uuid, pago numeric, receita_servico numeric, atendimentos bigint, atendimentos_cobrados bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with pagos as (
    select t.client_id, sum(t.amount) pago
      from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
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
       and (p_professional_id is null or a.professional_id = p_professional_id)
     group by a.client_id
  )
  select coalesce(p.client_id, x.client_id), p.pago, coalesce(x.receita, 0), coalesce(x.n, 0), coalesce(x.cobrados, 0)
    from pagos p
    full join atend x on x.client_id = p.client_id
$function$;

-- ---------------------------------------------------------------------------
-- metrics_receita_por_categoria_de_procedimento: os atendimentos DELA.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_receita_por_categoria_de_procedimento(uuid, uuid[], timestamptz, timestamptz);

create function public.metrics_receita_por_categoria_de_procedimento(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns table(categoria text, receita numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(pr.category, '—'), sum(coalesce(a.price, 0))
  from public.appointments a
  join public.procedures pr on pr.id = a.procedure_id
  join public.branches b on b.id = a.branch_id
  where b.tenant_id = p_tenant
    and (p_branch_ids is null or b.id = any (p_branch_ids))
    and a.status = 'COMPLETED'
    and a.aconteceu_em between p_from and p_to
    and (p_professional_id is null or a.professional_id = p_professional_id)
  group by 1;
$function$;

-- ---------------------------------------------------------------------------
-- metrics_vendas (+ página e resumo): as vendas DELA.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer);
drop function if exists public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz);
drop function if exists public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz);

create function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  )
  select a.id, 'PROCEDIMENTO', a.aconteceu_em, pr.name, 1,
         a.client_id, c.name, u.name, a.branch_id,
         a.price - coalesce(t.sale_discount, 0)
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
    left join lateral (
      select f.sale_discount from public.financial_transactions f
       where f.appointment_id = a.id
       order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
       limit 1
    ) t on true
   where a.status = 'COMPLETED'
     and a.aconteceu_em between p_from and p_to
     and a.price > 0
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)
     and (p_professional_id is null or a.professional_id = p_professional_id)

  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
     and (p_professional_id is null or v.sold_by = p_professional_id)

  union all
  select tp.id, 'PLANO', tp.aceito_em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         coalesce((select sum(x.price)
                     from public.treatment_plan_session_procedures x
                     join public.treatment_plan_sessions ss on ss.id = x.session_id
                    where ss.plan_id = tp.id), 0)
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = tp.professional_id
   where tp.status in ('ACCEPTED', 'COMPLETED')
     and tp.aceito_em between p_from and p_to
     and (p_professional_id is null or tp.professional_id = p_professional_id)
$function$;

create function public.metrics_vendas_pagina(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_tipo text default null::text, p_limite integer default 50, p_offset integer default 0, p_professional_id uuid default null)
 returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select v.*
    from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) v
   where p_tipo is null or v.tipo = p_tipo
   order by v.data desc, v.id
   limit greatest(1, least(p_limite, 1000)) offset greatest(0, p_offset)
$function$;

create function public.metrics_vendas_resumo(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns table(tipo text, quantidade bigint, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select v.tipo, count(*), coalesce(sum(v.valor), 0)
    from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) v
   group by grouping sets ((v.tipo), ())
$function$;

-- ---------------------------------------------------------------------------
-- metrics_relatorio: cada aba com o recorte DELA.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_relatorio(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, text, text);

create function public.metrics_relatorio(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_prev_from timestamp with time zone, p_prev_to timestamp with time zone, p_aba text, p_granularidade text default 'day'::text, p_professional_id uuid default null)
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
        left join (select branch_id, sum(amount) v from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) group by branch_id) a on a.branch_id = u.id
        left join (select branch_id, sum(amount) v from public.metrics_receitas_pagas(p_tenant, unidades, p_prev_from, p_prev_to, p_professional_id) group by branch_id) p on p.branch_id = u.id
      ), '[]'::jsonb),
      'receita_por_forma', coalesce((
        select jsonb_agg(jsonb_build_object('forma', forma, 'valor', v))
        from (select payment_method forma, sum(amount) v
              from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id)
              where payment_method is not null group by payment_method) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'financeiro' then
    r := r || jsonb_build_object(
      'receita_por_categoria', coalesce((
        select jsonb_agg(jsonb_build_object('categoria', categoria, 'valor', v))
        from (select category categoria, sum(amount) v
              from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id)
              where category is not null group by category) x
      ), '[]'::jsonb)
    );
  end if;

  -- Consumo de insumos — a MESMA conta de metrics_giro_estoque (custo do
  -- movimento; sem ele, o de consumo do cadastro). Indicador gerencial: o
  -- gráfico de evolução não o soma à despesa. Com profissional, o insumo dos
  -- atendimentos dela.
  if p_aba in ('overview', 'financeiro', 'estoque') then
    r := r || jsonb_build_object(
      'consumo_total', public.metrics_giro_estoque(unidades, p_from, p_to, p_professional_id),
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
            and (p_professional_id is null or exists (
                  select 1 from public.appointments ap
                  where ap.id = m.appointment_id and ap.professional_id = p_professional_id))
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
                and (p_professional_id is null or a.professional_id = p_professional_id)
              group by pr.name, pr.category) x
      ), '[]'::jsonb),
      'por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'receita', receita, 'atendimentos', n))
        from (select u.name nome, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.users u on u.id = a.professional_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.aconteceu_em between p_from and p_to
                and (p_professional_id is null or a.professional_id = p_professional_id)
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
                and (p_professional_id is null or a.professional_id = p_professional_id)
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
                and (p_professional_id is null or a.professional_id = p_professional_id)
              group by 1) x
      ), '[]'::jsonb),
      'por_origem', coalesce((
        select jsonb_agg(jsonb_build_object('origem', origem, 'n', n))
        from (select a.source::text origem, count(*) n from public.appointments a
              where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to
                and a.source is not null
                and (p_professional_id is null or a.professional_id = p_professional_id)
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
            and (p_professional_id is null or a.professional_id = p_professional_id)
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
          -- Cliente dela: agendamento NÃO cancelado com ela numa unidade do recorte.
          and (p_professional_id is null or exists (
                select 1 from public.appointments a
                where a.client_id = c.id and a.professional_id = p_professional_id
                  and a.branch_id = any (unidades) and a.status <> 'CANCELLED'))
      ),
      -- O gasto de cada cliente é UMA conta (metrics_gasto_por_cliente), a
      -- mesma da ficha da cliente (A26, 2026-10-27).
      gasto as (
        select g.client_id, g.pago total, g.atendimentos n
        from public.metrics_gasto_por_cliente(p_tenant, unidades, p_from, p_to, null, p_professional_id) g
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
          and (p_professional_id is null or a.professional_id = p_professional_id)
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
                and (p_professional_id is null or c.professional_id = p_professional_id)
              group by u.name) x
      ), '[]'::jsonb)
    );
  end if;

  if p_aba = 'estoque' then
    r := r || (
      -- O valor é o saldo em consumo × o custo de consumo (valor_do_saldo), a
      -- conta de metrics_valor_em_estoque. Crítico e zerado seguem em embalagens.
      -- O saldo não se atribui a ninguém (a tela o esconde com "só os meus");
      -- os mais consumidos, com profissional, são os dos atendimentos dela.
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
                                         from (select coalesce(nullif(btrim(category), ''), 'Sem categoria') as category, sum(valor) v from saldo group by 1) x), '[]'::jsonb),
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
                  and (p_professional_id is null or exists (
                        select 1 from public.appointments ap
                        where ap.id = m.appointment_id and ap.professional_id = p_professional_id))
                group by pr.name order by 2 desc limit 10) x
        ), '[]'::jsonb)
      )
    );
  end if;

  return r;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Só o servidor (service_role), como antes.
-- ---------------------------------------------------------------------------
revoke execute on function public.metrics_receitas_pagas(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_gasto_por_cliente(uuid, uuid[], timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_receita_por_categoria_de_procedimento(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_relatorio(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, text, text, uuid) from public, anon, authenticated;

grant execute on function public.metrics_receitas_pagas(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_gasto_por_cliente(uuid, uuid[], timestamptz, timestamptz, uuid, uuid) to service_role;
grant execute on function public.metrics_receita_por_categoria_de_procedimento(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer, uuid) to service_role;
grant execute on function public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_relatorio(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
