-- As listas que o PostgREST cortava em 1000 linhas (a varredura de 2026-10-22).
--
-- O PostgREST devolve no máximo 1000 linhas por consulta. O que era LISTA
-- passou a ser lido em páginas no app (`lerTodas`); o que era CONTA feita em
-- JavaScript sobre a lista (a última visita, o público de uma campanha, a
-- atividade dos contatos, o painel comercial, as execuções e as aplicações)
-- passa a ser feito aqui, agregado — e o filtro que o app aplicava DEPOIS de
-- ler um lote arbitrário (o aniversário, o "sem retorno") passa a valer antes.
--
-- Todas recebem a rede por parâmetro: só o servidor (service role) as chama.

-- ── Um filtro de lista vindo em jsonb: o array, ou nulo se vazio/ausente ────
create or replace function private.lista_do_filtro(j jsonb)
returns text[]
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'array' and jsonb_array_length(j) > 0
              then array(select jsonb_array_elements_text(j)) end
$$;

-- ── A última visita de cada cliente (a lista de clientes) ───────────────────
-- Era a lista dos 800 (unidade) ou 1000 (rede) atendimentos concluídos mais
-- recentes: quem não veio nesse intervalo aparecia "Sem visitas".
-- O eixo é `aconteceu_em`, o de todo indicador de atendimento (D13).
create or replace function public.ultimas_visitas(p_tenant uuid, p_branch uuid default null)
returns table(client_id uuid, ultima timestamptz)
language sql stable set search_path = '' as $$
  select a.client_id, max(a.aconteceu_em)
    from public.appointments a
    join public.branches b on b.id = a.branch_id
   where b.tenant_id = p_tenant
     and (p_branch is null or a.branch_id = p_branch)
     and a.status = 'COMPLETED'
     and a.client_id is not null
   group by a.client_id
$$;

-- ── O público de uma campanha ou de um fluxo de automação ───────────────────
-- Os filtros (todos opcionais): branch_ids, genders, tags (qualquer uma),
-- has_app_account, procedure_ids (já fez algum, concluído), aniversario
-- {mes, dia} (o dia e o mês da data como gravada, em UTC — como o app lia do
-- texto) e sem_retorno_desde (nenhum atendimento concluído marcado desde ali).
-- O app lia 1000 (ou 501) clientes SEM ordem e filtrava aniversário e retorno
-- em JavaScript: a aniversariante de fora do lote nunca recebia nada.
create or replace function public.clientes_do_publico(p_tenant uuid, p_filtros jsonb)
returns table(id uuid, name text, phone text, auth_id text)
language sql stable set search_path = '' as $$
  with f as (
    select private.lista_do_filtro(p_filtros->'branch_ids')    as unidades,
           private.lista_do_filtro(p_filtros->'genders')       as generos,
           private.lista_do_filtro(p_filtros->'tags')          as tags,
           private.lista_do_filtro(p_filtros->'procedure_ids') as procedimentos,
           coalesce((p_filtros->>'has_app_account')::boolean, false) as so_com_app,
           (p_filtros->'aniversario'->>'mes')::int as mes,
           (p_filtros->'aniversario'->>'dia')::int as dia,
           (p_filtros->>'sem_retorno_desde')::timestamptz as sem_retorno_desde
  )
  select c.id, c.name::text, c.phone::text, c.auth_id::text
    from public.clients c, f
   where c.tenant_id = p_tenant
     and c.is_active
     and (f.unidades is null or c.branch_id::text = any (f.unidades))
     and (f.generos is null or c.gender = any (f.generos))
     and (f.tags is null or c.tags && f.tags)
     and (not f.so_com_app or c.auth_id is not null)
     and (f.procedimentos is null or exists (
           select 1 from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED'
              and a.procedure_id::text = any (f.procedimentos)))
     and (f.mes is null or (
           c.birth_date is not null
           and extract(month from c.birth_date at time zone 'UTC') = f.mes
           and extract(day   from c.birth_date at time zone 'UTC') = f.dia))
     and (f.sem_retorno_desde is null or not exists (
           select 1 from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED'
              and a.scheduled_at >= f.sem_retorno_desde))
$$;

-- ── A atividade da PESSOA dona de cada card do quadro ───────────────────────
-- A interação mais recente e a espera mais antiga, de todas as conversas dela.
-- O app lia as conversas de até 1000 contatos (mais de 1000 linhas) por URL.
create or replace function public.atividade_dos_contatos(p_tenant uuid, p_contatos uuid[])
returns table(contato_id uuid, last_interaction_at timestamptz, awaiting_since timestamptz)
language sql stable set search_path = '' as $$
  select c.contato_id, max(c.last_message_at), min(c.awaiting_since)
    from public.conversations c
   where c.tenant_id = p_tenant
     and c.contato_id = any (p_contatos)
   group by c.contato_id
$$;

-- ── O painel comercial (relatório, aba Comercial) ───────────────────────────
-- Leads da REDE criados no período; atendimentos COMERCIAIS das unidades,
-- marcados no período. Contava em JavaScript sobre a lista (até 1000).
create or replace function public.metrics_comercial(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns jsonb
language sql stable set search_path = '' as $$
  with l as (
    select ld.client_id, ld.owner_id
      from public.leads ld
     where ld.tenant_id = p_tenant and ld.created_at between p_from and p_to
  ), a as (
    select ap.status::text as status, ap.created_by_id
      from public.appointments ap
     where ap.branch_id = any (p_branch_ids)
       and ap.source::text = 'COMMERCIAL'
       and ap.scheduled_at between p_from and p_to
  ), por_dono as (
    select dono, sum(leads)::int as leads, sum(convertidos)::int as convertidos, sum(agendamentos)::int as agendamentos
      from (select owner_id as dono, 1 as leads, (client_id is not null)::int as convertidos, 0 as agendamentos from l
            union all
            select created_by_id, 0, 0, 1 from a) x
     group by dono
  )
  select jsonb_build_object(
    'total_leads',  (select count(*) from l),
    'convertidos',  (select count(*) from l where client_id is not null),
    'agendados',    (select count(*) from a),
    'considerados', (select count(*) from a where status <> 'CANCELLED'),
    'realizados',   (select count(*) from a where status = 'COMPLETED'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object(
                  'dono', dono, 'leads', leads, 'convertidos', convertidos, 'agendamentos', agendamentos))
                from por_dono), '[]'::jsonb)
  )
$$;

-- ── As execuções da semana de cada automação (a lista de automações) ───────
create or replace function public.automacoes_execucoes(p_tenant uuid, p_ids uuid[], p_desde timestamptz)
returns table(automation_id uuid, total int, falhas int)
language sql stable set search_path = '' as $$
  select r.automation_id, count(*)::int, (count(*) filter (where r.status = 'falhou'))::int
    from public.automation_runs r
   where r.tenant_id = p_tenant
     and r.automation_id = any (p_ids)
     and not r.simulacao
     and r.created_at >= p_desde
   group by r.automation_id
$$;

-- ── A última aplicação e o total de cada cliente (a lista de injetáveis) ────
create or replace function public.aplicacoes_por_cliente(p_tenant uuid, p_clientes uuid[])
returns table(client_id uuid, ultima timestamptz, total int)
language sql stable set search_path = '' as $$
  select ia.client_id, max(ia.applied_at), count(*)::int
    from public.injectable_applications ia
    join public.clients c on c.id = ia.client_id
   where c.tenant_id = p_tenant
     and ia.client_id = any (p_clientes)
   group by ia.client_id
$$;

-- ── O extrato das comissões, sem o teto de 2000 ────────────────────────────
-- (O PostgREST cortava em 1000 de qualquer jeito.) O app lê em páginas, e a
-- ordem ganha o id de desempate: sem ele, as páginas se sobrepõem.
create or replace function public.comissoes_extrato(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo,
         c.amount, c.status::text, c.payout_id, c.appointment_id, a.scheduled_at,
         cli.name, pr.name, l.origem, l.preco, l.regra_tipo::text, l.regra_valor
    from public.commissions c
    join public.branches b on b.id = c.branch_id
    left join public.commission_lines l on l.id = c.line_id
    left join public.appointments a on a.id = c.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
     and (p_profissional is null or c.professional_id = p_profissional)
     and (c.released_at between p_inicio and p_fim
          or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
   order by c.released_at desc, c.id
$function$;

-- Só o servidor.
revoke execute on function public.ultimas_visitas(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.clientes_do_publico(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.atividade_dos_contatos(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.metrics_comercial(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.automacoes_execucoes(uuid, uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function public.aplicacoes_por_cliente(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.ultimas_visitas(uuid, uuid) to service_role;
grant execute on function public.clientes_do_publico(uuid, jsonb) to service_role;
grant execute on function public.atividade_dos_contatos(uuid, uuid[]) to service_role;
grant execute on function public.metrics_comercial(uuid, uuid[], timestamptz, timestamptz) to service_role;
grant execute on function public.automacoes_execucoes(uuid, uuid[], timestamptz) to service_role;
grant execute on function public.aplicacoes_por_cliente(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
