-- 22ª A20, a decisão do Heitor (2026-11-18), princípio 3 — "o que a tela
-- mostra é o que vale na conta": o desconto do plano COMBINADO no editor vale
-- em toda tela a partir do aceite (a comanda do PDV, o em aberto, a agenda, a
-- ficha, o app, o contrato e o checkout). Ele se aplica NO ACEITE — pela
-- cliente no app ou pela equipe, que passam ambos por `plano_aceitar` —, na
-- mesma transação, pelo `plano_aplicar_desconto` de sempre: os preços dos
-- procedimentos viram os vendidos (o de antes fica em `preco_tabela`) e o
-- `desconto` do plano é o combinado em reais.
--
-- O receber não aplica duas vezes: o checkout parte do preço de ANTES
-- (`preco_tabela`, `precosDoPlano`) e o `plano_aplicar_desconto` refaz o
-- rateio a partir dele — repetir o mesmo desconto dá os mesmos preços, e o
-- checkout ainda o ajusta (0 desfaz).
--
-- O rateio é o de `ratear` (lib/vendas/desconto.ts): em centavos, pelo maior
-- resto, na ordem das sessões e dos procedimentos; o percentual sobre o
-- subtotal, arredondado ao centavo, como `descontoEmReais`; o valor maior que
-- o subtotal fica no subtotal (não se recusa o valor da rede, princípio 2).
create or replace function public.plano_aceitar(p_tenant uuid, p_plano uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_plano      record;
  v_comanda    uuid;
  v_subtotal_c bigint;
  v_desconto_c bigint;
  v_precos     jsonb;
begin
  select tp.id, tp.status, tp.branch_id, tp.client_id,
         tp.desconto_combinado_tipo, tp.desconto_combinado_valor, tp.desconto_combinado_por
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

  -- 22ª A20: o combinado vira o desconto aplicado, aqui mesmo.
  if v_plano.desconto_combinado_tipo in ('VALOR', 'PERCENTUAL') and coalesce(v_plano.desconto_combinado_valor, 0) > 0 then
    select coalesce(sum(round(coalesce(p.preco_tabela, p.price) * 100)), 0)::bigint
      into v_subtotal_c
      from public.treatment_plan_session_procedures p
      join public.treatment_plan_sessions s on s.id = p.session_id
     where s.plan_id = p_plano;

    v_desconto_c := case when v_plano.desconto_combinado_tipo = 'PERCENTUAL'
                         then round(v_subtotal_c * least(v_plano.desconto_combinado_valor, 100) / 100)
                         else round(v_plano.desconto_combinado_valor * 100) end;
    v_desconto_c := least(greatest(v_desconto_c, 0), v_subtotal_c);

    if v_desconto_c > 0 then
      with itens as (
        select p.id,
               round(coalesce(p.preco_tabela, p.price) * 100)::bigint as c,
               row_number() over (order by coalesce(s.sort_order, 0), coalesce(p.sort_order, 0), p.id) as i
          from public.treatment_plan_session_procedures p
          join public.treatment_plan_sessions s on s.id = p.session_id
         where s.plan_id = p_plano
      ), exatos as (
        select id, i, c::numeric * (v_subtotal_c - v_desconto_c) / v_subtotal_c as exato
          from itens
      ), pisos as (
        select id, i, floor(exato)::bigint as piso, exato - floor(exato) as resto
          from exatos
      ), ordem as (
        select id, piso,
               row_number() over (order by resto desc, i) as pos,
               (v_subtotal_c - v_desconto_c) - sum(piso) over () as falta
          from pisos
      )
      select jsonb_agg(jsonb_build_object('id', id,
               'preco', (piso + case when pos <= falta then 1 else 0 end)::numeric / 100))
        into v_precos
        from ordem;

      perform public.plano_aplicar_desconto(p_plano, p_tenant, v_plano.desconto_combinado_por,
                                            v_desconto_c::numeric / 100, v_precos);
    end if;
  end if;

  insert into public.comandas (tenant_id, branch_id, client_id, numero, origem, treatment_plan_id)
  values (p_tenant, v_plano.branch_id, v_plano.client_id, 0, 'PLANO', p_plano)
  on conflict do nothing
  returning id into v_comanda;
  return v_comanda;
end $function$;

-- Endpoint do servidor (recebe a rede por parâmetro): só o service_role.
revoke execute on function public.plano_aceitar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plano_aceitar(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
