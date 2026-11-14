-- O PDV, fase 3: a comanda do plano nasce no ACEITE (a revisão do Heitor,
-- 2026-11-13 — PDV4 e PT1a–PT1c do plano de adaptação, docs/revisao.md).
--
-- O Heitor: "a partir do momento que a cliente aceita o plano, ela precisa daí
-- pagar e agendar as sessões"; o aceite sem pergunta de dinheiro ("pode ser
-- intimidador e levar a desistencia"); e a ordem "primeiro colhe assinatura,
-- depois paga".
--
-- - plano_aceitar: o aceite é só "quero fazer" — o plano vira ACCEPTED, os
--   documentos ficam prontos e a comanda do plano nasce no PDV. Nenhum
--   dinheiro, nenhum agendamento.
-- - plano_checkout passa a ser o RECEBER do plano (no PDV): só do plano
--   aceito, uma vez, e só com o contrato de plano assinado ou dispensado.
--   Não muda mais o status (o aceite já mudou).
-- - O aceite não trava mais por documento (a trava foi para o receber): os
--   termos se assinam quando a cliente quiser.
-- - O plano cancelado leva a comanda que não foi paga.

-- 1. O aceite emite os documentos; não recusa mais.
create or replace function private.documentos_bloqueiam_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'ACCEPTED' or old.status = 'ACCEPTED' then return new; end if;
  perform public.documentos_emitir_do_plano(new.id);
  return new;
end $$;

-- 2. O aceite.
create or replace function public.plano_aceitar(p_tenant uuid, p_plano uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano   record;
  v_comanda uuid;
begin
  select tp.id, tp.status, tp.branch_id, tp.client_id
    into v_plano
    from public.treatment_plans tp
    join public.branches b on b.id = tp.branch_id
   where tp.id = p_plano and b.tenant_id = p_tenant
     for update of tp;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'P0001';
  end if;
  if v_plano.status not in ('DRAFT', 'PROPOSED') then
    raise exception 'Este plano já foi aceito. Recarregue a tela.' using errcode = 'P0001';
  end if;
  if v_plano.client_id is null then
    raise exception 'Ligue o plano a uma cliente antes de aceitar.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.treatment_plan_sessions s where s.plan_id = p_plano) then
    raise exception 'Adicione ao menos uma sessão ao plano antes de aceitar.' using errcode = 'P0001';
  end if;

  update public.treatment_plans set status = 'ACCEPTED', updated_at = now() where id = p_plano;

  insert into public.comandas (tenant_id, branch_id, client_id, numero, origem, treatment_plan_id)
  values (p_tenant, v_plano.branch_id, v_plano.client_id, 0, 'PLANO', p_plano)
  on conflict do nothing
  returning id into v_comanda;
  return v_comanda;
end $$;
revoke execute on function public.plano_aceitar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plano_aceitar(uuid, uuid) to service_role;

-- 3. O receber do plano (no PDV).
create or replace function public.plano_checkout(p_tenant uuid, p_plano uuid, p_ator uuid, p_desconto numeric, p_precos jsonb, p_lancamentos jsonb, p_agendamentos jsonb, p_com_comissao boolean, p_vendedor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plano      record;
  v_total      numeric;
  v_lancado    numeric;
  v_j          jsonb;
  v_id         uuid;
  v_primeiro   uuid;
  v_appt       uuid;
  v_primeira_c uuid;
  v_sessao     record;
  v_faltam     text;
begin
  select tp.id, tp.status, tp.branch_id, tp.client_id
    into v_plano
    from public.treatment_plans tp
    join public.branches b on b.id = tp.branch_id
   where tp.id = p_plano and b.tenant_id = p_tenant
     for update of tp;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'P0001';
  end if;
  if v_plano.status in ('DRAFT', 'PROPOSED') then
    raise exception 'Aceite o plano antes de receber.' using errcode = 'P0001';
  end if;
  if v_plano.status <> 'ACCEPTED' then
    raise exception 'Este plano não está aberto para receber.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.financial_transactions f
              where f.treatment_plan_id = p_plano and f.type::text = 'INCOME' and f.estorno_de is null
                and coalesce(f.notes, '') <> 'Estornada') then
    raise exception 'Este plano já foi recebido. Recarregue a tela.' using errcode = 'P0001';
  end if;

  -- O contrato de plano antes do dinheiro (o Heitor: "primeiro colhe
  -- assinatura, depois paga"): assinado ou dispensado.
  select string_agg(p.title, ', ' order by p.title) into v_faltam
    from public.documentos_pendentes_do_plano(p_plano) p
   where p.kind = 'CONTRATO_PLANO';
  if v_faltam is not null then
    raise exception 'Falta assinar: %. Colha a assinatura antes de receber o plano.', v_faltam
      using errcode = 'P0001';
  end if;

  perform public.plano_aplicar_desconto(p_plano, p_tenant, p_ator, p_desconto, p_precos);

  select coalesce(sum(p.price), 0) into v_total
    from public.treatment_plan_session_procedures p
    join public.treatment_plan_sessions s on s.id = p.session_id
   where s.plan_id = p_plano;

  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) into v_lancado
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if jsonb_array_length(coalesce(p_lancamentos, '[]'::jsonb)) = 0 or round(v_lancado, 2) <> round(v_total, 2) then
    raise exception 'O pagamento não fecha com o valor do plano. Recarregue a tela.' using errcode = 'P0001';
  end if;

  for v_j in select x from jsonb_array_elements(p_lancamentos) x
  loop
    insert into public.financial_transactions
      (branch_id, client_id, treatment_plan_id, type, category, description, created_by,
       desconto_motivo, amount, payment_method, is_paid, paid_at, cartao_vezes, cartao_bandeira, maquininha_id,
       due_date, notes, parcela_numero, parcela_total, parcela_grupo)
    values (
      v_plano.branch_id, v_plano.client_id, p_plano, 'INCOME', 'Serviços',
      v_j ->> 'description',
      p_ator::text,
      nullif(v_j ->> 'desconto_motivo', ''),
      round((v_j ->> 'amount')::numeric, 2),
      nullif(v_j ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_j ->> 'is_paid')::boolean, false),
      case when coalesce((v_j ->> 'is_paid')::boolean, false) then now() end,
      nullif(v_j ->> 'cartao_vezes', '')::smallint,
      private.bandeira_do_cartao(v_j ->> 'payment_method', v_j ->> 'cartao_bandeira'),
      nullif(v_j ->> 'maquininha_id', '')::uuid,
      nullif(v_j ->> 'due_date', '')::timestamptz,
      nullif(v_j ->> 'notes', ''),
      nullif(v_j ->> 'parcela_numero', '')::int,
      nullif(v_j ->> 'parcela_total', '')::int,
      nullif(v_j ->> 'parcela_grupo', '')::uuid
    )
    returning id into v_id;
    v_primeiro := coalesce(v_primeiro, v_id);
  end loop;

  -- Os horários que vierem junto (o receber do PDV não manda nenhum: as
  -- sessões se agendam pelo plano). A sessão já agendada fica como está.
  for v_sessao in select s.id from public.treatment_plan_sessions s
                   where s.plan_id = p_plano and s.appointment_id is null
                   order by s.sort_order, s.id
  loop
    v_appt := null;
    select x into v_j from jsonb_array_elements(coalesce(p_agendamentos, '[]'::jsonb)) x
     where (x ->> 'sessao')::uuid = v_sessao.id
     limit 1;
    if v_j is not null then
      insert into public.appointments
        (branch_id, client_id, procedure_id, professional_id, scheduled_at, duration_min, price,
         status, source, treatment_plan_id, room_id)
      values (
        (v_j ->> 'branch_id')::uuid, v_plano.client_id, (v_j ->> 'procedure_id')::uuid,
        (v_j ->> 'professional_id')::uuid, (v_j ->> 'scheduled_at')::timestamptz,
        (v_j ->> 'duration_min')::int,
        (select coalesce(sum(p.price), 0) from public.treatment_plan_session_procedures p where p.session_id = v_sessao.id),
        'SCHEDULED', 'INTERNAL', p_plano, nullif(v_j ->> 'room_id', '')::uuid
      )
      returning id into v_appt;
      v_primeira_c := coalesce(v_primeira_c, v_appt);
      update public.treatment_plan_sessions set appointment_id = v_appt where id = v_sessao.id;
    end if;
    v_j := null;
  end loop;

  if p_com_comissao then
    perform public.plano_comissao_de_venda(p_tenant, p_plano, p_vendedor);
  end if;

  return jsonb_build_object('transacao', v_primeiro, 'agendamento', v_primeira_c, 'total', round(v_total, 2));
end
$function$;

-- 4. O plano cancelado (ou recusado) leva a comanda que não foi paga.
create or replace function private.comanda_do_plano_cancelado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text in ('CANCELLED', 'REJECTED') and old.status::text is distinct from new.status::text then
    update public.comandas c
       set cancelada_em = now(), cancelada_motivo = 'Plano cancelado'
     where c.treatment_plan_id = new.id and c.cancelada_em is null
       and not exists (select 1 from public.financial_transactions f
                        where f.treatment_plan_id = new.id and f.type::text = 'INCOME' and f.estorno_de is null
                          and coalesce(f.notes, '') <> 'Estornada');
  end if;
  return null;
end $$;
drop trigger if exists trg_comanda_do_plano_cancelado on public.treatment_plans;
create trigger trg_comanda_do_plano_cancelado after update of status on public.treatment_plans
  for each row execute function private.comanda_do_plano_cancelado();

-- 5. A lista do PDV, agora com os planos: o valor é o do plano (a soma das
-- sessões); "paga" quando o receber do plano lançou o dinheiro (à vista ou no
-- crediário — como a venda), na hora do primeiro lançamento.
drop function if exists public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz);
create function public.pdv_comandas(
  p_tenant uuid, p_branch uuid, p_situacao text, p_de timestamptz, p_ate timestamptz
) returns table (
  id uuid, numero integer, origem text, aberta_em timestamptz, cancelada_em timestamptz, cancelada_motivo text,
  client_id uuid, cliente text, appointment_id uuid, procedimento text, profissional text,
  agendado_para timestamptz, atendimento_status text, valor numeric,
  paga boolean, paga_em timestamptz, recebido numeric, forma text, lancamento_id uuid, estornada boolean,
  treatment_plan_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select c.*, a.price, a.scheduled_at, a.status::text as a_status, a.procedure_id, a.professional_id,
           f.id as f_id, f.paid_at, f.amount, f.payment_method::text as f_forma,
           v.valor as v_valor, v.recebido as v_recebido, v.forma as v_forma, v.estornada as v_estornada,
           v.primeiro as v_primeiro,
           case
             when c.client_package_id is not null then (select sp.name from public.client_packages cp
                 join public.service_packages sp on sp.id = cp.package_id where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select s.quantity || '× ' || pr.name from public.procedure_sales s
                 join public.procedures pr on pr.id = s.procedure_id where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select coalesce(nullif(s.descricao, ''), p.name) from public.product_sales s
                 left join public.products p on p.id = s.product_id where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then 'Crédito na rede'
             when c.treatment_plan_id is not null then (select coalesce(nullif(trim(tp.name), ''), 'Plano de tratamento')
                 from public.treatment_plans tp where tp.id = c.treatment_plan_id)
           end as v_item,
           case
             when c.client_package_id is not null then (select u.name from public.client_packages cp
                 join public.users u on u.id = cp.sold_by where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select u.name from public.procedure_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select u.name from public.product_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then (select s.registrado_por_nome from public.creditos_vendidos s
                 where s.id = c.credito_vendido_id)
             when c.treatment_plan_id is not null then (select u.name from public.treatment_plans tp
                 join public.users u on u.id = tp.professional_id where tp.id = c.treatment_plan_id)
           end as v_quem,
           case when c.treatment_plan_id is not null then (select coalesce(sum(p.price), 0)
                 from public.treatment_plan_session_procedures p
                 join public.treatment_plan_sessions s on s.id = p.session_id
                where s.plan_id = c.treatment_plan_id) end as pl_valor
      from public.comandas c
      left join public.appointments a on a.id = c.appointment_id
      left join lateral (
        select f.id, f.paid_at, f.amount, f.payment_method
          from public.financial_transactions f
         where c.appointment_id is not null and f.appointment_id = c.appointment_id and f.is_paid
           and coalesce(f.notes, '') <> 'Estornada'
         order by f.paid_at desc nulls last
         limit 1
      ) f on true
      left join lateral (
        select sum(coalesce(t.valor_antes_do_estorno, t.amount)) as valor,
               coalesce(sum(t.amount) filter (where t.is_paid and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               (array_agg(t.payment_method::text order by t.parcela_numero nulls first, t.created_at))[1] as forma,
               bool_and(coalesce(t.notes, '') = 'Estornada') as estornada,
               min(t.created_at) filter (where coalesce(t.notes, '') <> 'Estornada') as primeiro
          from public.financial_transactions t
         where c.origem in ('VENDA', 'PLANO') and t.type::text = 'INCOME' and t.estorno_de is null
           and (t.client_package_id = c.client_package_id or t.procedure_sale_id = c.procedure_sale_id
                or t.product_sale_id = c.product_sale_id or t.credito_vendido_id = c.credito_vendido_id
                or t.treatment_plan_id = c.treatment_plan_id)
      ) v on true
     where c.tenant_id = p_tenant and c.branch_id = p_branch
  ), s as (
    select c.*,
           case c.origem
             when 'VENDA' then true
             when 'PLANO' then c.v_primeiro is not null
             else c.f_id is not null
           end as e_paga,
           case c.origem
             when 'VENDA' then c.aberta_em
             when 'PLANO' then c.v_primeiro
             else c.paid_at
           end as e_paga_em
      from c
  )
  select s.id, s.numero, s.origem, s.aberta_em, s.cancelada_em, s.cancelada_motivo,
         s.client_id, cl.name, s.appointment_id,
         case when s.origem in ('VENDA', 'PLANO') then s.v_item else pr.name end,
         case when s.origem in ('VENDA', 'PLANO') then s.v_quem else u.name end,
         s.scheduled_at, s.a_status,
         round(case s.origem
                 when 'VENDA' then coalesce(s.v_valor, 0)
                 when 'PLANO' then coalesce(s.pl_valor, 0)
                 else coalesce(s.price, 0) end, 2),
         s.e_paga,
         s.e_paga_em,
         round(case when s.origem in ('VENDA', 'PLANO') then s.v_recebido else s.amount end, 2),
         case when s.origem in ('VENDA', 'PLANO') then s.v_forma else s.f_forma end,
         s.f_id,
         s.origem in ('VENDA', 'PLANO') and s.v_valor is not null and coalesce(s.v_estornada, false),
         s.treatment_plan_id
    from s
    left join public.clients cl on cl.id = s.client_id
    left join public.procedures pr on pr.id = s.procedure_id
    left join public.users u on u.id = s.professional_id
   where case p_situacao
           when 'ABERTAS' then s.cancelada_em is null and not s.e_paga
           when 'PAGAS'   then s.e_paga and s.e_paga_em between p_de and p_ate
           else (s.cancelada_em is null and not s.e_paga)
             or (s.e_paga and s.e_paga_em between p_de and p_ate)
             or (s.cancelada_em between p_de and p_ate)
         end
$$;
revoke execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) to service_role;

-- 6. O relatório de vendas: o plano é venda quando é RECEBIDO no PDV (a
-- comanda paga), não no aceite — o aceite é só "quero fazer", e o plano
-- aceito que nunca se recebeu não vendeu nada. A data é a do receber.
create or replace function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
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
         cp.client_id, c.name, u.name, cp.branch_id, cp.price - coalesce(cp.valor_cancelado, 0)
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to
     and not cp.de_fora
     and (cp.cancelado_em is null or coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0) > 0)
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price - coalesce(x.cancelado, 0)
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
    left join lateral (
      select sum(un.preco) cancelado from public.procedure_sale_units un
       where un.sale_id = v.id and un.status = 'CANCELADA'
    ) x on true
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
     and (coalesce(x.cancelado, 0) = 0 or v.price - x.cancelado > 0)
     and (p_professional_id is null or v.sold_by = p_professional_id)

  union all
  select tp.id, 'PLANO', rec.em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         soma.valor - coalesce(tp.valor_cancelado, 0)
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = coalesce(tp.vendido_por, tp.professional_id)
    cross join lateral (
      select coalesce(sum(x.price), 0) valor
        from public.treatment_plan_session_procedures x
        join public.treatment_plan_sessions ss on ss.id = x.session_id
       where ss.plan_id = tp.id
    ) soma
    cross join lateral (
      select min(f.created_at) em
        from public.financial_transactions f
       where f.treatment_plan_id = tp.id and f.type::text = 'INCOME' and f.estorno_de is null
    ) rec
   where (tp.status in ('ACCEPTED', 'COMPLETED')
          or (tp.cancelado_em is not null and soma.valor - coalesce(tp.valor_cancelado, 0) > 0))
     and rec.em between p_from and p_to
     and (p_professional_id is null or coalesce(tp.vendido_por, tp.professional_id) = p_professional_id)

  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity - coalesce(ps.unidades_devolvidas, 0),
         ps.client_id, c.name, u.name, ps.branch_id, ps.price - coalesce(ps.valor_devolvido, 0)
    from public.product_sales ps
    join scope s on s.id = ps.branch_id
    join public.products p on p.id = ps.product_id
    left join public.clients c on c.id = ps.client_id
    left join public.users u on u.id = ps.sold_by
   where ps.tenant_id = p_tenant
     and ps.estornada_em is null
     and ps.sold_at between p_from and p_to
     and (p_professional_id is null or ps.sold_by = p_professional_id)
$function$;

notify pgrst, 'reload schema';
