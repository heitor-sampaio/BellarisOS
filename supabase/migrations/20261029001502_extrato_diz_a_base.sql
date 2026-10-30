-- J-46 (simulação de 2026-10-30): a dona achou que as comissões descontavam a
-- taxa da maquininha e o insumo — o padrão é a base CHEIA. O extrato passa a
-- dizer, linha a linha, o que saiu da base (o retrato da linha:
-- commission_lines.desconta_taxa / desconta_insumos), e a tela escreve "base
-- cheia (sem taxa nem insumo descontados)" quando nada saiu.

drop function if exists public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid);
create function public.comissoes_extrato(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo,
         c.amount, c.status::text, c.payout_id, c.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at),
         coalesce(cli.name, cps.name, ccp.name), coalesce(pr.name, prod.name, sp.name), l.origem, l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name, l.desconta_taxa, l.desconta_insumos
    from public.commissions c
    join public.branches b on b.id = c.branch_id
    left join public.commission_lines l on l.id = c.line_id
    left join public.appointments a on a.id = c.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
    left join public.product_sales ps on ps.id = l.product_sale_id
    left join public.clients cps on cps.id = ps.client_id
    left join public.products prod on prod.id = ps.product_id
    left join public.client_packages cp on cp.id = l.client_package_id
    left join public.service_packages sp on sp.id = cp.package_id
    left join public.clients ccp on ccp.id = cp.client_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
     and (p_profissional is null or c.professional_id = p_profissional)
     and (c.released_at between p_inicio and p_fim
          or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
   order by c.released_at desc, c.id
$function$;
revoke execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
