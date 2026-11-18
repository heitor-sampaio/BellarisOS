-- A17 da 25ª simulação (princípio 3): o extrato de comissão chamava de
-- "desconto" a base reduzida pelos pontos e pelo voucher.
--
-- Com a rede em "Sobre o valor pago", os pontos e o voucher usados saem da
-- base (item 10 da auditoria, 20261124000201), e a conta os punha em
-- `base_desconto` junto do desconto comercial — a tela escrevia "R$ 40,00 de
-- desconto". vendas-financeiro.md: os pontos e o voucher "não é desconto";
-- indicadores.md: "ponto é forma de pagamento, não desconto".
--
-- Agora as duas contas devolvem também `base_fidelidade`: a PARTE de
-- `base_desconto` que foi de pontos e voucher. `base_desconto` continua o
-- total que saiu do preço antes da taxa (nenhuma conta muda: a base, o
-- previsto e o alvo são os mesmos); a tela escreve as duas partes com o seu
-- nome. Decisão do Claude pelo princípio 3.
--
-- Recriadas do corpo de PRODUÇÃO (pg_get_functiondef, 18/11):
--   - private.comissao_conta_detalhe(uuid)  — OUT novo: drop + create
--   - private.comissao_base_do_pagamento(uuid, uuid) — OUT novo: drop + create
--   - public.comissoes_extrato_com_regra(...) — coluna nova no fim: drop + create
-- As outras que leem a conta (`private.comissao_conta`,
-- `public.comissoes_extrato_com_base`) usam as colunas pelo nome e não mudam
-- (corpo sql/plpgsql: o Postgres não guarda dependência, o drop passa).
-- Permissões como estavam: as privadas só do dono; o extrato, do service_role.
--
-- Não depende do código novo: a tela de antes não lê a coluna nova. O código
-- novo, sem a migration, lê `base_fidelidade` nula = 0 e escreve como antes.

drop function if exists private.comissao_conta_detalhe(uuid);

create function private.comissao_conta_detalhe(p_linha uuid, OUT alvo numeric, OUT previsto numeric, OUT quitado boolean, OUT base numeric, OUT base_desconto numeric, OUT base_taxa numeric, OUT base_insumos numeric, OUT base_fator numeric, OUT base_fidelidade numeric)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_l         public.commission_lines%rowtype;
  v_fracao    numeric := 1;
  v_desconto  numeric := 0;
  v_taxa      numeric := 0;
  v_base      numeric;
  v_valor     numeric;
  v_pago      boolean := false;
  v_estornado boolean := false;
  v_total     numeric;
  v_recebido  numeric;
  v_quitado   numeric;
  v_dvenda    numeric := 0;
  v_fica      numeric;
  v_cheio     numeric;
  v_fator     numeric := 1;
  v_vivos     int := 0;
  v_abertos   int := 0;
  v_fid_venda numeric := 0;
  v_cheio_venda numeric;
begin
  alvo := 0; previsto := 0; quitado := false;
  base := null; base_desconto := 0; base_taxa := 0; base_insumos := 0; base_fator := 1; base_fidelidade := 0;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return;
  end if;
  quitado := true;

  if v_l.origem = 'AVULSO' then
    select round(coalesce(a.price, 0), 2) into v_total from public.appointments a where a.id = v_l.appointment_id;
    select count(*),
           count(*) filter (where not f.is_paid and f.amount > 0),
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)) filter (where f.is_paid), 0),
           coalesce(sum(f.loyalty_discount) filter (where f.is_paid), 0),
           coalesce(sum(f.sale_discount) filter (where f.is_paid), 0),
           case when coalesce(sum(f.amount) filter (where f.is_paid and f.amount > 0), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, 1), f.cartao_bandeira, f.maquininha_id)) filter (where f.is_paid and f.amount > 0)
             / sum(f.amount) filter (where f.is_paid and f.amount > 0)
           else 0 end
      into v_vivos, v_abertos, v_quitado, v_desconto, v_dvenda, v_taxa
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.estorno_de is null
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno';
    v_pago := v_vivos > 0 and v_abertos = 0 and round(v_quitado, 2) >= coalesce(v_total, 0);
    v_estornado := v_vivos = 0 and exists (
      select 1 from public.financial_transactions f
       where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.notes = 'Estornada');
    v_dvenda := coalesce(v_dvenda, 0);
    quitado  := v_pago;
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then
        case when coalesce(v_total, 0) <= 0 then case when v_pago then 1 else 0 end
             else least(1, v_quitado / v_total) end
      when v_l.modo = 'INTEGRAL' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null)
        or (v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
      v_cheio_venda := v_total;
      v_total := v_total - coalesce((select tp.valor_cancelado from public.treatment_plans tp where tp.id = v_l.treatment_plan_id), 0);
    elsif v_l.origem in ('PACOTE', 'PACOTE_VENDA') then
      select cp.price - coalesce(cp.valor_cancelado, 0), cp.price into v_total, v_cheio_venda
        from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      select ps.price - coalesce(ps.valor_devolvido, 0), ps.price into v_total, v_cheio_venda
        from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0),
             ps.price
        into v_total, v_cheio_venda
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0)), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1), f.cartao_bandeira, f.maquininha_id))
             / sum(f.amount)
           else 0 end,
           coalesce(sum(f.loyalty_discount), 0)
      into v_recebido, v_quitado, v_taxa, v_fid_venda
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    quitado := v_total is null or v_total <= 0 or round(v_quitado, 2) >= round(v_total, 2);
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    elsif v_l.modo = 'INTEGRAL' then
      v_fracao := case when quitado then 1 else 0 end;
    end if;
    -- Item 10: a escolha da rede vale aqui também — "Sobre o valor pago" tira
    -- da base a parte desta linha nos pontos e no voucher usados na venda.
    if v_l.base_com_pontos = 'VALOR_PAGO' and coalesce(v_cheio_venda, 0) > 0 and v_fid_venda > 0 then
      v_desconto := round(v_fid_venda * least(1, v_l.preco / v_cheio_venda), 2);
    end if;

  else
    v_fracao := 1;
  end if;

  -- A17 da 25ª: v_desconto é só pontos e voucher; v_dvenda, o desconto
  -- comercial. base_desconto segue o total; base_fidelidade diz a parte
  -- dos pontos e do voucher nele.
  base_fidelidade := least(v_desconto, v_l.preco);

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
    base_desconto := least(v_desconto, v_l.preco);
    v_base := v_l.preco - base_desconto;
  else
    base_desconto := least(v_desconto + v_dvenda, v_l.preco);
    v_base := v_l.preco - base_desconto;
    if v_l.desconta_taxa then
      base_taxa := round(v_base * v_taxa / 100, 2);
      v_base := v_base - base_taxa;
    end if;
    if v_l.desconta_insumos then
      base_insumos := v_l.custo_insumos;
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_base := greatest(v_base, 0);
    v_valor := round(v_base * v_l.regra_valor / 100, 2);
  end if;

  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when coalesce(cp.price, 0) > 0
                then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fica
      from public.client_packages cp where cp.id = v_l.client_package_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  if v_l.origem = 'PLANO' and v_l.appointment_id is null then
    select coalesce(sum(p.price), 0) into v_cheio
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = v_l.treatment_plan_id;
    select case when v_cheio > 0
                then greatest(v_cheio - coalesce(tp.valor_cancelado, 0), 0) / v_cheio
                else 1 end
      into v_fica
      from public.treatment_plans tp where tp.id = v_l.treatment_plan_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  if v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null then
    if coalesce(v_l.item, 0) = 0 then
      select case when coalesce(ps.price, 0) > 0
                  then greatest(ps.price - coalesce(ps.valor_devolvido, 0), 0) / ps.price
                  else 1 end
        into v_fica
        from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select case when coalesce(v_l.preco, 0) > 0
                  then greatest(v_l.preco - coalesce(i.valor_devolvido, 0), 0) / v_l.preco
                  else 1 end
        into v_fica
        from public.product_sale_items i where i.sale_id = v_l.product_sale_id and i.sort_order = v_l.item;
    end if;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  if v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null and v_l.appointment_id is null then
    select case when coalesce(ps.price, 0) > 0
                then greatest(ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                                    where u.sale_id = ps.id and u.status = 'CANCELADA'), 0), 0) / ps.price
                else 1 end
      into v_fica
      from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  previsto   := v_valor;
  alvo       := round(v_valor * v_fracao, 2);
  base_fator := v_fator;
  base       := round(v_base * v_fator, 2);
end $function$;

revoke execute on function private.comissao_conta_detalhe(uuid) from public, anon, authenticated;

drop function if exists private.comissao_base_do_pagamento(uuid, uuid);

create function private.comissao_base_do_pagamento(p_linha uuid, p_transacao uuid, OUT base numeric, OUT base_desconto numeric, OUT base_taxa numeric, OUT base_insumos numeric, OUT base_fidelidade numeric)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_l        public.commission_lines%rowtype;
  v_f        public.financial_transactions%rowtype;
  v_desconto numeric := 0;
  v_dvenda   numeric := 0;
  v_taxa     numeric := 0;
  v_fid      numeric := 0;
  v_base     numeric;
begin
  base := null; base_desconto := 0; base_taxa := 0; base_insumos := 0; base_fidelidade := 0;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.origem <> 'AVULSO' or v_l.appointment_id is null or p_transacao is null then
    return;
  end if;
  select * into v_f from public.financial_transactions f
   where f.id = p_transacao and f.appointment_id = v_l.appointment_id and f.type = 'INCOME';
  if not found then
    return;
  end if;

  select coalesce(sum(f.loyalty_discount), 0), coalesce(sum(f.sale_discount), 0),
         case when coalesce(sum(f.amount) filter (where f.amount > 0), 0) > 0 then
           sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                 coalesce(f.cartao_vezes, f.parcela_total, 1), f.cartao_bandeira, f.maquininha_id)) filter (where f.amount > 0)
           / sum(f.amount) filter (where f.amount > 0)
         else private.comissao_taxa_pct(v_l.tenant_id, v_f.payment_method::text,
                coalesce(v_f.cartao_vezes, v_f.parcela_total, 1), v_f.cartao_bandeira, v_f.maquininha_id) end
    into v_fid, v_dvenda, v_taxa
    from public.financial_transactions f
   where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.estorno_de is null
     and f.created_at = v_f.created_at;

  if v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO' then
    v_desconto := v_fid;
  end if;

  -- A17 da 25ª: a parte dos pontos e do voucher no que saiu da base.
  base_fidelidade := least(v_desconto, v_l.preco);

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    base_desconto := least(v_desconto, v_l.preco);
    v_base := v_l.preco - base_desconto;
  else
    base_desconto := least(v_desconto + v_dvenda, v_l.preco);
    v_base := v_l.preco - base_desconto;
    if v_l.desconta_taxa then
      base_taxa := round(v_base * v_taxa / 100, 2);
      v_base := v_base - base_taxa;
    end if;
    if v_l.desconta_insumos then
      base_insumos := v_l.custo_insumos;
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_base := greatest(v_base, 0);
  end if;
  base := round(v_base, 2);
end $function$;

revoke execute on function private.comissao_base_do_pagamento(uuid, uuid) from public, anon, authenticated;

drop function if exists public.comissoes_extrato_com_regra(uuid, uuid[], timestamptz, timestamptz, uuid);

create function public.comissoes_extrato_com_regra(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 RETURNS TABLE(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean, previsto numeric, base_com_pontos text, plano text, base numeric, base_desconto numeric, base_taxa numeric, base_insumos numeric, base_fator numeric, regra_de text, base_fidelidade numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with itens as (
    select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo, c.amount,
           c.status::text as status, c.payout_id, c.appointment_id, c.line_id, null::numeric as previsto,
           c.transaction_id
      from public.commissions c
      join public.branches b on b.id = c.branch_id
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
       and (p_profissional is null or c.professional_id = p_profissional)
       and (c.released_at between p_inicio and p_fim
            or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
    union all
    select g.line_id, g.professional_id, g.branch_id, g.desde, 'AGUARDANDO', 'Aguardando o pagamento integral', 0::numeric,
           'AGUARDANDO', null::uuid, l.appointment_id, g.line_id, g.previsto, null::uuid
      from private.comissoes_aguardando(p_tenant, p_branch_ids, p_fim, p_profissional) g
      join public.commission_lines l on l.id = g.line_id
  )
  select x.id, x.professional_id, x.branch_id, x.released_at, x.kind, x.motivo,
         x.amount, x.status, x.payout_id, x.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at, tp.aceito_em, psv.sold_at),
         coalesce(cli.name, cps.name, ccp.name, ctp.name, cpsv.name), coalesce(pr.name, ps.descricao, prod.name, sp.name, tp.name),
         case when l.pacote_responsavel then 'PACOTE_RESPONSAVEL'
              when tp.id is not null then 'PLANO_VENDA'
              when l.origem = 'PRE_PAGO' and l.appointment_id is null and l.procedure_sale_id is not null then 'PRE_PAGO_VENDA'
              else l.origem end,
         l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name, l.desconta_taxa, l.desconta_insumos, x.previsto, l.base_com_pontos, tp.name,
         -- D5 da 18ª: o lançamento de um pagamento diz a base daquele pagamento.
         case when pg.base is not null then pg.base
              when d.base is null then null
              when f.fator = d.base_fator then d.base
              else round(greatest(l.preco - d.base_desconto - d.base_taxa - d.base_insumos, 0) * f.fator, 2) end,
         case when pg.base is not null then pg.base_desconto else d.base_desconto end,
         case when pg.base is not null then pg.base_taxa else d.base_taxa end,
         case when pg.base is not null then pg.base_insumos else d.base_insumos end,
         case when pg.base is not null then 1::numeric when d.base is null then d.base_fator else f.fator end,
         l.regra_de,
         -- A17 da 25ª: a parte dos pontos e do voucher no que saiu da base.
         case when pg.base is not null then pg.base_fidelidade else d.base_fidelidade end
    from itens x
    left join public.commission_lines l on l.id = x.line_id
    left join lateral private.comissao_conta_detalhe(l.id) d on l.id is not null
    left join lateral private.comissao_base_do_pagamento(l.id, x.transaction_id) pg
      on l.id is not null and x.transaction_id is not null and x.kind <> 'AGUARDANDO' and l.origem = 'AVULSO'
    left join lateral (
      select case when l.id is null or x.kind = 'AGUARDANDO' or coalesce(d.base_fator, 1) = 1 then coalesce(d.base_fator, 1)
                  else private.comissao_fator_em(l.id, x.released_at) end as fator
    ) f on true
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
    left join public.procedure_sales psv on psv.id = l.procedure_sale_id and l.appointment_id is null
    left join public.clients cpsv on cpsv.id = psv.client_id
   order by x.released_at desc, x.id
$function$;

revoke execute on function public.comissoes_extrato_com_regra(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato_com_regra(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
