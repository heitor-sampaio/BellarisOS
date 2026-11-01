-- H4, decisão do Heitor (2026-11-01): "comissão só paga com pagamento integral
-- do cliente; note que pagamento parcelado no cartão deve ser considerado como
-- pagamento integral da parte do cliente, o repasse do valor das parcelas é de
-- responsabilidade da operadora do cartão, o cliente já fez o pagamento
-- integral."
--
-- Até aqui a rede escolhia o modo: ATENDIMENTO (devida na conclusão) ou
-- PAGAMENTO (na proporção do recebido), e a venda de pacote, de pré-pago e de
-- produto era sempre proporcional. Na 5ª simulação o Dr. Paulo ganhou
-- R$ 192,50 pela sessão 1 de um pacote com 90% a receber.
--
-- O modo novo é um só, INTEGRAL: a linha só deve quando a cliente pagou TUDO o
-- que a gerou — o avulso pago; o pacote, o plano, o pré-pago e o produto com a
-- venda inteira paga (o recebido, com os pontos, fecha com o preço vendido). O
-- crédito em N vezes é UM lançamento pago (cartao_vezes): libera na hora. O
-- crediário da clínica (entrada + parcelas a receber) libera na última.
--
-- O passado não se reescreve: a linha guarda o modo (retrato), e as linhas
-- ATENDIMENTO e PAGAMENTO seguem a conta delas em comissao_conta. Toda linha
-- NOVA nasce INTEGRAL — por gatilho, para valer em todos os pontos que criam
-- linha (concluir_atendimento, pacote_vender, produto_vender,
-- atendimento_abater_do_pacote) sem reescrever cada um.

-- 1. O modo novo -------------------------------------------------------------
alter table public.commission_lines drop constraint commission_lines_modo_check;
alter table public.commission_lines add constraint commission_lines_modo_check
  check (modo = any (array['ATENDIMENTO', 'PAGAMENTO', 'INTEGRAL']));

-- A configuração deixa de ter escolha. Quem estava em "quando o cliente paga"
-- tinha a base sobre o PAGO (os pontos saíam da base): fica com isso escrito.
alter table public.commission_configs drop constraint commission_configs_modo_check;
update public.commission_configs set base_com_pontos = 'VALOR_PAGO' where modo = 'PAGAMENTO';
update public.commission_configs set modo = 'INTEGRAL' where modo <> 'INTEGRAL';
alter table public.commission_configs alter column modo set default 'INTEGRAL';
alter table public.commission_configs add constraint commission_configs_modo_check check (modo = 'INTEGRAL');

create or replace function private.comissao_linha_nasce_integral()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.modo := 'INTEGRAL';
  return new;
end $function$;
revoke execute on function private.comissao_linha_nasce_integral() from public;

drop trigger if exists trg_comissao_linha_integral on public.commission_lines;
create trigger trg_comissao_linha_integral
  before insert on public.commission_lines
  for each row execute function private.comissao_linha_nasce_integral();

-- 2. A conta: quanto a linha deve AGORA, quanto deveria paga, e se está paga --
-- Partiu do corpo de produção de private.comissao_alvo (2026-11-01).
create or replace function private.comissao_conta(p_linha uuid, out alvo numeric, out previsto numeric, out quitado boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_l         public.commission_lines%rowtype;
  v_fracao    numeric := 1;
  v_desconto  numeric := 0;
  v_taxa      numeric := 0;
  v_base      numeric;
  v_valor     numeric;
  v_pago      boolean := false;
  v_estornado boolean := false;
  v_metodo    text;
  v_vezes     int;
  v_total     numeric;
  v_recebido  numeric;
  v_quitado   numeric;
  v_dvenda    numeric := 0;
begin
  alvo := 0; previsto := 0; quitado := false;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return;
  end if;
  quitado := true;

  if v_l.origem = 'AVULSO' then
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text,
           coalesce(f.sale_discount, 0),
           f.cartao_vezes
      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME'
     order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
     limit 1;
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1));
    else
      v_desconto := 0;
      v_dvenda   := 0;
    end if;
    v_dvenda := coalesce(v_dvenda, 0);
    quitado  := v_pago;
    v_fracao := case
      when v_l.modo in ('PAGAMENTO', 'INTEGRAL') then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    -- PAGAMENTO era sempre "sobre o pago"; INTEGRAL e ATENDIMENTO seguem a
    -- base com pontos da configuração (retratada na linha).
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
    elsif v_l.origem in ('PACOTE', 'PACOTE_VENDA') then
      select cp.price into v_total from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      select ps.price into v_total from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           -- Pontos são forma de pagamento: quitam como o dinheiro.
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0)), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_quitado, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    -- Sem preço de venda (o pacote de antes da venda no sistema): libera na conclusão, como sempre.
    quitado := v_total is null or v_total <= 0 or round(v_quitado, 2) >= round(v_total, 2);
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    elsif v_l.modo = 'INTEGRAL' then
      v_fracao := case when quitado then 1 else 0 end;
    end if;

  else
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
  else
    v_base := v_l.preco - least(v_desconto + v_dvenda, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  previsto := v_valor;
  alvo     := round(v_valor * v_fracao, 2);
end $function$;
revoke execute on function private.comissao_conta(uuid) from public;

create or replace function private.comissao_alvo(p_linha uuid)
returns numeric
language sql
stable security definer
set search_path to ''
as $function$
  select c.alvo from private.comissao_conta(p_linha) c
$function$;
revoke execute on function private.comissao_alvo(uuid) from public;

-- 3. O que espera o pagamento integral ---------------------------------------
-- A linha INTEGRAL viva, nascida até p_fim, sem nada lançado e com a venda (ou
-- o atendimento) ainda não paga por inteiro: o que ela vai dever quando for.
create or replace function private.comissoes_aguardando(p_tenant uuid, p_branch_ids uuid[], p_fim timestamptz, p_profissional uuid)
returns table(line_id uuid, professional_id uuid, branch_id uuid, desde timestamptz, previsto numeric)
language sql
stable security definer
set search_path to ''
as $function$
  select l.id, l.professional_id, l.branch_id, l.created_at, c.previsto
    from public.commission_lines l
    cross join lateral private.comissao_conta(l.id) c
   where l.tenant_id = p_tenant
     and l.status = 'ATIVA' and l.modo = 'INTEGRAL'
     and (p_branch_ids is null or l.branch_id = any (p_branch_ids))
     and (p_profissional is null or l.professional_id = p_profissional)
     and l.created_at <= p_fim
     and coalesce((select sum(x.amount) from public.commissions x where x.line_id = l.id), 0) = 0
     and not c.quitado and c.previsto > 0
$function$;
revoke execute on function private.comissoes_aguardando(uuid, uuid[], timestamptz, uuid) from public;

-- 4. O resumo ganha "aguardando" (fora do a pagar) ---------------------------
drop function if exists public.comissoes_resumo(uuid, uuid[], timestamptz, timestamptz, uuid);
create function public.comissoes_resumo(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamptz, p_fim timestamptz, p_profissional uuid)
returns table(professional_id uuid, professional_name text, branch_id uuid, branch_name text,
              liberado numeric, a_pagar numeric, pago numeric, aguardando numeric)
language sql
stable security definer
set search_path to ''
as $function$
  with escopo as (
    select b.id, b.name from public.branches b
     where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  lanc as (
    select c.professional_id, c.branch_id,
           sum(c.amount) filter (where c.released_at between p_inicio and p_fim) liberado,
           sum(c.amount) filter (where c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim) a_pagar
      from public.commissions c
      join escopo e on e.id = c.branch_id
     where (p_profissional is null or c.professional_id = p_profissional)
     group by 1, 2
  ),
  pag as (
    select p.professional_id, p.branch_id, sum(p.total) pago
      from public.commission_payouts p
      join escopo e on e.id = p.branch_id
     where p.paid_at between p_inicio and p_fim
       and p.estornado_at is null
       and (p_profissional is null or p.professional_id = p_profissional)
     group by 1, 2
  ),
  agu as (
    select g.professional_id, g.branch_id, sum(g.previsto) aguardando
      from private.comissoes_aguardando(p_tenant, p_branch_ids, p_fim, p_profissional) g
      join escopo e on e.id = g.branch_id
     group by 1, 2
  )
  select k.professional_id, u.name, k.branch_id, e.name,
         coalesce(l.liberado, 0), coalesce(l.a_pagar, 0), coalesce(g.pago, 0), coalesce(a.aguardando, 0)
    from (select l.professional_id, l.branch_id from lanc l
          union select g.professional_id, g.branch_id from pag g
          union select a.professional_id, a.branch_id from agu a) k
    join public.users u on u.id = k.professional_id
    join escopo e on e.id = k.branch_id
    left join lanc l on l.professional_id = k.professional_id and l.branch_id = k.branch_id
    left join pag  g on g.professional_id = k.professional_id and g.branch_id = k.branch_id
    left join agu  a on a.professional_id = k.professional_id and a.branch_id = k.branch_id
   where coalesce(l.liberado, 0) <> 0 or coalesce(l.a_pagar, 0) <> 0 or coalesce(g.pago, 0) <> 0 or coalesce(a.aguardando, 0) <> 0
   order by u.name, e.name
$function$;
revoke execute on function public.comissoes_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

-- 5. O extrato mostra a linha que aguarda (A53) -------------------------------
-- kind/status 'AGUARDANDO', valor 0 (não é lançamento) e o previsto.
drop function if exists public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid);
create function public.comissoes_extrato(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamptz, p_fim timestamptz, p_profissional uuid)
returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamptz, kind text, motivo text, amount numeric,
              status text, payout_id uuid, appointment_id uuid, scheduled_at timestamptz, cliente text, procedimento text,
              origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text,
              desconta_taxa boolean, desconta_insumos boolean, previsto numeric)
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
         x.amount, x.status, x.payout_id, x.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at),
         coalesce(cli.name, cps.name, ccp.name), coalesce(pr.name, prod.name, sp.name), l.origem, l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name, l.desconta_taxa, l.desconta_insumos, x.previsto
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
   order by x.released_at desc, x.id
$function$;
revoke execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
