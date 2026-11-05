-- Decisão 4 do Heitor (7ª simulação, 2026-11-05: "concordo"): a comissão de
-- VENDA do plano de tratamento. "Quem vendeu" no checkout do plano (nasce
-- vazio, como nas outras vendas) e um percentual de "venda de plano" em
-- Configurações → Comissões, vazio por padrão (princípio 6). A comissão libera
-- com o plano pago inteiro (INTEGRAL), como no pacote.
--
-- O caminho é o do pacote, sem lógica nova: a linha é `origem = 'PLANO'` com o
-- `treatment_plan_id` e SEM atendimento — `private.comissao_conta` já quita a
-- linha de plano pelo recebido do plano (soma dos procedimentos, com o
-- desconto), e o gatilho do pagamento (`comissoes_do_pagamento`) já acerta
-- toda linha do plano. As linhas das sessões têm atendimento; a da venda, não.
-- O lucro (F21) desconta as comissões LANÇADAS (`metrics_custos_da_venda`, de
-- `commissions`): a nova entra igual, sem mudar nada lá.

alter table public.commission_configs
  add column if not exists plano_pct numeric
  check (plano_pct is null or (plano_pct >= 0 and plano_pct <= 100));

comment on column public.commission_configs.plano_pct is
  'Comissão da VENDA do plano de tratamento (% do vendido, para quem vendeu). Nulo = sem comissão (decisão 4 da 7ª simulação).';

-- Quem vendeu o plano (o checkout): separado de quem montou (professional_id).
alter table public.treatment_plans
  add column if not exists vendido_por uuid references public.users(id) on delete set null;

comment on column public.treatment_plans.vendido_por is
  'Quem VENDEU o plano, escolhido no checkout ("Quem vendeu"). Nulo = ninguém (sem comissão de venda).';

-- A comissão de venda do plano: grava quem vendeu e, com o percentual da
-- clínica, a linha — e a acerta já (o dinheiro do checkout entrou ANTES dela:
-- à vista libera agora, o crediário fica aguardando a última parcela).
-- Repetir é seguro: a linha ativa do plano é atualizada, não duplicada.
create or replace function public.plano_comissao_de_venda(p_tenant uuid, p_plano uuid, p_vendedor uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plano   public.treatment_plans%rowtype;
  v_cfg     public.commission_configs%rowtype;
  v_vendido numeric;
  v_linha   uuid;
begin
  select tp.* into v_plano
    from public.treatment_plans tp
    join public.branches b on b.id = tp.branch_id
   where tp.id = p_plano and b.tenant_id = p_tenant
   for update of tp;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_vendedor is not null and not exists (
    select 1 from public.users u where u.id = p_vendedor and u.tenant_id = p_tenant and coalesce(u.is_active, true)
  ) then
    raise exception 'Quem vendeu não é da equipe desta clínica.' using errcode = 'P0001';
  end if;

  update public.treatment_plans set vendido_por = p_vendedor where id = p_plano;

  select l.id into v_linha
    from public.commission_lines l
   where l.treatment_plan_id = p_plano and l.appointment_id is null and l.origem = 'PLANO' and l.status = 'ATIVA'
   limit 1;

  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;

  if p_vendedor is null or coalesce(v_cfg.plano_pct, 0) <= 0 then
    -- Sem vendedora (ou sem o percentual): nenhuma comissão de venda.
    if v_linha is not null then
      update public.commission_lines set status = 'CANCELADA' where id = v_linha;
      perform private.comissao_acertar_linha(v_linha, 'Venda do plano sem vendedora', null);
    end if;
    return null;
  end if;

  select coalesce(sum(p.price), 0) into v_vendido
    from public.treatment_plan_sessions s
    join public.treatment_plan_session_procedures p on p.session_id = s.id
   where s.plan_id = p_plano;

  if v_linha is null then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos)
    values (p_tenant, v_plano.branch_id, null, 0, null, p_vendedor, 'PLANO', p_plano,
            'PERCENTAGE', v_cfg.plano_pct, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', round(v_vendido, 2), 0)
    returning id into v_linha;
  else
    update public.commission_lines
       set professional_id = p_vendedor, regra_valor = v_cfg.plano_pct, preco = round(v_vendido, 2),
           desconta_taxa = coalesce(v_cfg.desconta_taxa, false)
     where id = v_linha;
  end if;

  perform private.comissao_acertar_linha(v_linha, 'Venda do plano', null);
  return v_linha;
end $function$;

revoke execute on function public.plano_comissao_de_venda(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.plano_comissao_de_venda(uuid, uuid, uuid) to service_role;

-- O plano cancelado depois de vendido não é venda (Relatórios → Vendas já o
-- tira): a comissão de venda dele é cancelada, e o acerto devolve o que tinha
-- liberado. As linhas das sessões feitas ficam (a execução aconteceu).
create or replace function public.plano_cancelar_comissao_de_venda(p_tenant uuid, p_plano uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_linha uuid;
begin
  for v_linha in
    select l.id from public.commission_lines l
     where l.tenant_id = p_tenant and l.treatment_plan_id = p_plano
       and l.appointment_id is null and l.origem = 'PLANO' and l.status = 'ATIVA'
  loop
    update public.commission_lines set status = 'CANCELADA' where id = v_linha;
    perform private.comissao_acertar_linha(v_linha, 'Plano cancelado', null);
  end loop;
end $function$;

revoke execute on function public.plano_cancelar_comissao_de_venda(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plano_cancelar_comissao_de_venda(uuid, uuid) to service_role;

-- O extrato com o que faltava dizer: a venda do plano (origem PLANO_VENDA, a
-- cliente, o dia do aceite e o nome do plano) e, por linha, se os pontos saem
-- da base (A10 da 7ª: "base cheia" não dizia nada dos pontos, e a Tânia lia
-- R$ 480 de comissão sobre R$ 1.180 pagos). Uma função NOVA (o retorno muda;
-- `comissoes_extrato` fica para quem a chamava).
create or replace function public.comissoes_extrato_linhas(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean, previsto numeric, base_com_pontos text, plano text)
language sql
stable security definer
set search_path to ''
as $function$
  with itens as (
    select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo, c.amount,
           c.status::text as status, c.payout_id, c.appointment_id, c.line_id, null::numeric as previsto
      from public.commissions c
      join public.branches b on b.id = c.branch_id
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
       and (p_profissional is null or c.professional_id = p_profissional)
       and (c.released_at between p_inicio and p_fim
            or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
    union all
    select g.line_id, g.professional_id, g.branch_id, g.desde, 'AGUARDANDO', 'Aguardando o pagamento integral', 0::numeric,
           'AGUARDANDO', null::uuid, l.appointment_id, g.line_id, g.previsto
      from private.comissoes_aguardando(p_tenant, p_branch_ids, p_fim, p_profissional) g
      join public.commission_lines l on l.id = g.line_id
  )
  select x.id, x.professional_id, x.branch_id, x.released_at, x.kind, x.motivo,
         x.amount, x.status, x.payout_id, x.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at, tp.aceito_em),
         coalesce(cli.name, cps.name, ccp.name, ctp.name), coalesce(pr.name, ps.descricao, prod.name, sp.name, tp.name),
         case when l.pacote_responsavel then 'PACOTE_RESPONSAVEL'
              when tp.id is not null then 'PLANO_VENDA'
              else l.origem end,
         l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name, l.desconta_taxa, l.desconta_insumos, x.previsto, l.base_com_pontos, tp.name
    from itens x
    left join public.commission_lines l on l.id = x.line_id
    left join public.appointments a on a.id = x.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
    left join public.product_sales ps on ps.id = l.product_sale_id
    left join public.clients cps on cps.id = ps.client_id
    left join public.products prod on prod.id = ps.product_id
    left join public.client_packages cp on cp.id = l.client_package_id
    left join public.service_packages sp on sp.id = cp.package_id
    left join public.clients ccp on ccp.id = cp.client_id
    left join public.treatment_plans tp on tp.id = l.treatment_plan_id and l.appointment_id is null and l.origem = 'PLANO'
    left join public.clients ctp on ctp.id = tp.client_id
   order by x.released_at desc, x.id
$function$;

revoke execute on function public.comissoes_extrato_linhas(uuid, uuid[], timestamp with time zone, timestamp with time zone, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato_linhas(uuid, uuid[], timestamp with time zone, timestamp with time zone, uuid) to service_role;

-- O evento "comissão liberada" da venda do plano diz o plano (a entidade e o
-- nome), como o do pacote. O resto é o corpo de antes.
create or replace function private.comissao_acertar_linha(p_linha uuid, p_motivo text, p_transacao uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_l       public.commission_lines%rowtype;
  v_alvo    numeric;
  v_lancado numeric;
  v_delta   numeric;
  v_id      uuid;
begin
  perform pg_advisory_xact_lock(hashtext('comissao:' || p_linha::text));
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found then
    return 0;
  end if;
  v_alvo := private.comissao_alvo(p_linha);
  select coalesce(sum(c.amount), 0) into v_lancado from public.commissions c where c.line_id = p_linha;
  v_delta := round(v_alvo - v_lancado, 2);
  if v_delta <> 0 then
    insert into public.commissions
      (branch_id, professional_id, appointment_id, amount, type, rule_value, period_ref, status,
       line_id, kind, motivo, released_at, transaction_id)
    values (
      v_l.branch_id, v_l.professional_id, v_l.appointment_id, v_delta, v_l.regra_tipo, v_l.regra_valor,
      to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'), 'OPEN',
      p_linha,
      case when v_delta > 0 then 'LIBERACAO'
           when p_motivo ilike 'estorno%' then 'ESTORNO'
           else 'AJUSTE' end,
      p_motivo, now(), p_transacao
    )
    returning id into v_id;

    if v_delta > 0 and p_transacao is not null then
      insert into public.domain_events
        (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
      values (
        v_l.tenant_id, v_l.branch_id, 'comissao.liberada', 'comissao',
        coalesce(v_l.appointment_id, v_l.product_sale_id, v_l.client_package_id, v_l.treatment_plan_id),
        jsonb_build_object(
          'profissionalId',   v_l.professional_id,
          'profissionalNome', (select u.name from public.users u where u.id = v_l.professional_id),
          'agendamentoId',    v_l.appointment_id,
          'vendaDeProdutoId', v_l.product_sale_id,
          'pacoteId',         case when v_l.origem = 'PACOTE_VENDA' then v_l.client_package_id end,
          'planoId',          case when v_l.origem = 'PLANO' and v_l.appointment_id is null then v_l.treatment_plan_id end,
          'procedimentoNome', coalesce(
            (select p.name from public.procedures p where p.id = v_l.procedure_id),
            (select pr.name from public.product_sales ps join public.products pr on pr.id = ps.product_id where ps.id = v_l.product_sale_id),
            (select 'Venda do pacote ' || sp.name from public.client_packages cp join public.service_packages sp on sp.id = cp.package_id
              where cp.id = v_l.client_package_id and v_l.origem = 'PACOTE_VENDA'),
            (select 'Venda do plano ' || tp.name from public.treatment_plans tp
              where tp.id = v_l.treatment_plan_id and v_l.origem = 'PLANO' and v_l.appointment_id is null)),
          'valor',            v_delta,
          'motivo',           p_motivo
        ),
        'sistema', 'banco', 'comissao.liberada:' || v_id, now()
      )
      on conflict (tenant_id, chave) where chave is not null do nothing;
    end if;
  end if;
  return v_delta;
end $function$;

notify pgrst, 'reload schema';
