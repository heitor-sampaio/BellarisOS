-- F35 — "Trazer pacote de fora" (decisão 1 do Heitor sobre a 8ª simulação,
-- 2026-11-06: "concordo" com a recomendação (a) + (c)).
--
-- A Lúcia migrava a base de uma planilha: a Camila tinha 7 de 10 limpezas
-- usadas, e a Ana Beatriz 2 de 6 microagulhamentos. A tela só vendia pacote
-- cheio, e o improviso (o pacote "Saldo migrado" a R$ 0) entrou no catálogo,
-- nas Vendas, no ticket médio e no app da cliente ("Pix R$ 0,00 Pago").
--
-- O pacote trazido de fora é o saldo que a cliente JÁ TINHA: procedimento,
-- sessões totais, já usadas, validade e um valor de referência OPCIONAL.
--   - Sem lançamento no caixa, sem pontos, sem comissão de venda; fora do
--     catálogo de venda, do Relatório de Vendas, do ticket e do faturamento.
--   - As sessões restantes se agendam e se consomem como as de um pacote
--     vendido aqui (a sessão é a mesma `package_sessions`).
--   - A comissão de EXECUÇÃO sai pela regra do profissional sobre a parte da
--     sessão no rateio do valor de referência; sem valor, R$ 0 (princípio 4 —
--     o app não cria a linha). O preço da sessão é `package_sessions.preco`.
--   - O indicador de execução conta essa parte no dia da sessão; sem valor,
--     não conta nada (princípio 5). O caixa e o faturamento nunca contam (não
--     há lançamento).
--   - `client_packages.price` fica NULO: para a comissão, o pacote "sem preço
--     de venda" libera na conclusão (private.comissao_conta) — não há o que a
--     cliente deva à clínica.
--
-- O catálogo: o pacote trazido precisa de um `service_packages` (o
-- `client_packages.package_id` é NOT NULL e todas as leituras do nome passam
-- por ele). Nasce um por pacote trazido, `de_fora` e desativado — nunca é
-- oferecido para venda (pacote_vender recusa o desativado) nem listado no
-- catálogo (catalogoDePacotes tira o `de_fora`).

alter table public.service_packages
  add column if not exists de_fora boolean not null default false;
comment on column public.service_packages.de_fora is
  'F35: o registro do pacote trazido de fora (um por pacote trazido). Nunca à venda nem no catálogo.';

alter table public.client_packages
  add column if not exists de_fora boolean not null default false,
  add column if not exists valor_referencia numeric(12, 2),
  add column if not exists usadas_antes integer not null default 0;
alter table public.client_packages
  add constraint client_packages_valor_referencia_check check (valor_referencia is null or valor_referencia >= 0),
  add constraint client_packages_usadas_antes_check check (usadas_antes >= 0 and usadas_antes <= total_sessions);
comment on column public.client_packages.de_fora is
  'F35: pacote trazido de fora (a migração): sem venda, sem lançamento, sem pontos nem comissão de venda.';
comment on column public.client_packages.valor_referencia is
  'F35: o valor de referência do pacote trazido (opcional). O rateio dele é o preço de cada sessão: a base da comissão de execução e da receita dos atendimentos.';
comment on column public.client_packages.usadas_antes is
  'F35: as sessões usadas ANTES do sistema (o pacote trazido) — a ficha diz "usadas antes do sistema".';

create or replace function public.pacote_trazer(
  p_tenant uuid, p_cliente uuid, p_unidade uuid, p_procedimento uuid,
  p_total integer, p_usadas integer, p_validade timestamptz, p_valor numeric, p_ator uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_nome  text;
  v_sp    uuid;
  v_cp    uuid;
  v_valor numeric := case when p_valor is null then null else round(p_valor, 2) end;
  v_parte numeric;
begin
  if p_total is null or p_total < 1 or p_total > 100 then
    raise exception 'O pacote de antes tem de 1 a 100 sessões.' using errcode = 'P0001';
  end if;
  if p_usadas is null or p_usadas < 0 or p_usadas >= p_total then
    raise exception 'As sessões já usadas vão de 0 a %: o pacote precisa ter sessão restante.', p_total - 1 using errcode = 'P0001';
  end if;
  if v_valor is not null and v_valor < 0 then
    raise exception 'O valor de referência não pode ser negativo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant) then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  select pr.name into v_nome from public.procedures pr where pr.id = p_procedimento and pr.tenant_id = p_tenant;
  if not found then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_ator is not null and not exists (select 1 from public.users u where u.id = p_ator and u.tenant_id = p_tenant) then
    raise exception 'Quem registrou não é da equipe desta clínica.' using errcode = 'P0001';
  end if;

  -- O registro de catálogo do pacote trazido: desativado e de_fora (nunca à venda).
  insert into public.service_packages
    (tenant_id, branch_id, procedure_id, name, total_sessions, price, validity_days, is_active, de_fora, comissao_execucao)
  values (p_tenant, null, p_procedimento, v_nome || ' (pacote de antes)', p_total, coalesce(v_valor, 0), null, false, true, 'REGRA')
  returning id into v_sp;
  insert into public.service_package_items (tenant_id, package_id, procedure_id, quantity, sort_order)
  values (p_tenant, v_sp, p_procedimento, p_total, 0);

  -- Sem preço de venda (price nulo): não há venda nem o que a cliente deva.
  insert into public.client_packages
    (client_id, package_id, branch_id, purchased_at, expires_at, total_sessions, used_sessions,
     price, preco_tabela, desconto, sold_by, comissao_execucao, registrado_por,
     de_fora, valor_referencia, usadas_antes)
  values (p_cliente, v_sp, p_unidade, now(), p_validade, p_total, p_usadas,
          null, null, 0, null, 'REGRA', p_ator,
          true, v_valor, p_usadas)
  returning id into v_cp;

  -- As sessões: as já usadas antes do sistema (USED, sem atendimento) e as
  -- restantes (AVAILABLE). O preço de cada uma é o rateio do valor de
  -- referência, em centavos, com a sobra na última; sem valor, nulo.
  v_parte := case when v_valor is null then null else round(v_valor / p_total, 2) end;
  insert into public.package_sessions (client_package_id, status, session_number, procedure_id, preco)
  select v_cp,
         (case when g <= p_usadas then 'USED' else 'AVAILABLE' end)::public."PackageSessionStatus",
         g, p_procedimento,
         case when v_valor is null then null
              when g = p_total then greatest(v_valor - v_parte * (p_total - 1), 0)
              else v_parte end
    from generate_series(1, p_total) g;

  return v_cp;
end
$function$;

revoke execute on function public.pacote_trazer(uuid, uuid, uuid, uuid, integer, integer, timestamptz, numeric, uuid) from public, anon, authenticated;
grant execute on function public.pacote_trazer(uuid, uuid, uuid, uuid, integer, integer, timestamptz, numeric, uuid) to service_role;

-- As Vendas: o pacote trazido NÃO é venda (decisão 1). Corpo atual da
-- produção (20261106003404, D14), com o `de_fora` fora do ramo do pacote.
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

  -- O pacote cancelado vale o que foi usado (F2b, 2026-11-01); cancelado
  -- sem nenhuma sessão feita, sai. O pacote trazido de fora (F35) não é venda.
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

  -- O pré-pago vale sem as unidades canceladas (procedimento_cancelar_unidade:
  -- "a venda passa a valer menos"); todas canceladas, sai.
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

  -- O plano é de quem VENDEU (D14 da 8ª); sem "Quem vendeu", da dona do plano.
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
    left join public.users u on u.id = coalesce(tp.vendido_por, tp.professional_id)
   where tp.status in ('ACCEPTED', 'COMPLETED')
     and tp.aceito_em between p_from and p_to
     and (p_professional_id is null or coalesce(tp.vendido_por, tp.professional_id) = p_professional_id)

  -- A venda de produto (D4, 2026-10-30): na data da venda, pelo vendido, e
  -- "quem vendeu" na coluna Profissional (o recorte do "só os meus"). A
  -- ESTORNADA não é venda (H2, 2026-11-01). O kit (ven-04) diz os produtos.
  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity,
         ps.client_id, c.name, u.name, ps.branch_id, ps.price
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
