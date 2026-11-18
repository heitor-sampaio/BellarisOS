-- A varredura de conformidade de 18/11 — vendas e financeiro (VF-01, VF2-03,
-- VF2-04). Remendos por texto sobre o corpo VIVO de cada função (o trecho tem
-- de aparecer o número de vezes esperado, ou a migration para), e o
-- `plano_receber` refeito com dois parâmetros a mais.
--
-- VF-01 (vendas-financeiro.md §9.6, C75: "Com mais de uma ativa, o cartão não
-- segue sem ela … Todos os caminhos"): o pagamento NOVO do usado — cancelar o
-- pacote ou o plano (`private.cancelamento_dinheiro`), a unidade pré-paga, a
-- devolução de parte da venda de produto e o estorno da venda de crédito —
-- gravava o lançamento sem `maquininha_id`, e o gatilho
-- `private.maquininha_do_lancamento` punha a PRIMEIRA. Agora a escolhida vem em
-- `p_novo ->> 'maquininha'` (só no cartão); a de outra rede o gatilho recusa.
-- Depende do código novo para PEDIR a maquininha (sem ela, segue a primeira,
-- como antes).
--
-- VF2-03 (vendas-financeiro.md: "Com produto pendente, o atendimento não se
-- abate de pacote (a comanda tem dinheiro a receber)"; CLAUDE.md §11, "A trava
-- da action é a única"): só a tela do PDV barrava. A função recusa.
--
-- VF2-04 (CLAUDE.md §14: duas gravações juntas, uma transação): o recebimento
-- do plano no atendimento gravava a bandeira e a maquininha num UPDATE depois
-- de `plano_receber`. Agora vão nele. A assinatura nova tem os dois com
-- padrão nulo: o código de antes (nove parâmetros nomeados) segue chamando.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

-- ---------------------------------------------------------------------------
-- VF-01: a maquininha do pagamento novo do usado.
-- ---------------------------------------------------------------------------
select pg_temp.trocar_no_corpo(fn,
  array[
    $t$payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by$t$,
    $t$private.bandeira_do_cartao(v_novo_metodo, p_novo ->> 'bandeira'),$t$
  ],
  array[
    $t$payment_method, cartao_vezes, cartao_bandeira, maquininha_id, is_paid, paid_at, created_by$t$,
    $t$private.bandeira_do_cartao(v_novo_metodo, p_novo ->> 'bandeira'),
          case when v_novo_metodo in ('CREDIT_CARD', 'DEBIT_CARD') then nullif(p_novo ->> 'maquininha', '')::uuid end,$t$
  ],
  array[1, 1])
from unnest(array[
  'public.procedimento_cancelar_unidade_devolvendo(uuid,uuid,uuid,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  'private.cancelamento_dinheiro(uuid,uuid,uuid,numeric,boolean,text,text,jsonb,text,text,text,text,uuid,uuid)'::regprocedure,
  'public.credito_estornar_venda(uuid,uuid,uuid,text,text,numeric,boolean,text,jsonb,text)'::regprocedure,
  'public.produto_devolver_itens(uuid,uuid,uuid,text,text,jsonb,boolean,text,numeric,boolean,text,jsonb)'::regprocedure
]) as fn;

-- ---------------------------------------------------------------------------
-- VF2-03: com produto pendente na comanda, o atendimento não se abate do pacote.
-- ---------------------------------------------------------------------------
select pg_temp.trocar_no_corpo(
  'public.atendimento_abater_do_pacote(uuid,uuid,uuid,uuid,text)'::regprocedure,
  array[$t$'Pagamento já registrado para este atendimento.' using errcode = 'P0001';$t$],
  array[$t$'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
  end if;
  -- VF2-03 (varredura de 18/11): o produto ainda na comanda tem dinheiro a
  -- receber — a comanda se recebe inteira (só a tela do PDV barrava).
  if exists (select 1 from public.comanda_itens i
               join public.comandas c on c.id = i.comanda_id
              where c.appointment_id = p_agendamento and c.cancelada_em is null
                and i.product_sale_id is null) then
    raise exception 'Com produto na comanda, o atendimento não se abate do pacote: receba a comanda inteira.' using errcode = 'P0001';$t$],
  array[1]);

drop function pg_temp.trocar_no_corpo(regprocedure, text[], text[], int[]);

-- ---------------------------------------------------------------------------
-- VF2-04: plano_receber grava a bandeira e a maquininha na mesma transação.
-- (O corpo é o vivo, de 20261104002005, com as duas colunas a mais.)
-- ---------------------------------------------------------------------------
drop function if exists public.plano_receber(uuid, uuid, uuid[], numeric, text, text, integer, jsonb, text);

create function public.plano_receber(
  p_tenant uuid, p_plano uuid, p_pendentes uuid[], p_esperado numeric, p_forma text, p_metodo text,
  p_vezes integer, p_lancamentos jsonb, p_ator text,
  p_bandeira text default null,
  p_maquininha uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano      record;
  v_qtd        integer;
  v_soma       numeric;
  v_novos      numeric;
  v_agora      timestamptz := now();
  v_j          jsonb;
  v_pago       boolean;
  v_cartao     boolean := p_metodo in ('CREDIT_CARD', 'DEBIT_CARD');
begin
  select tp.id, tp.branch_id, tp.client_id
    into v_plano
    from public.treatment_plans tp
    join public.branches b on b.id = tp.branch_id
   where tp.id = p_plano and b.tenant_id = p_tenant
     for update of tp;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'P0001';
  end if;
  if p_forma not in ('AVISTA', 'PARCELADO') then
    raise exception 'Forma de recebimento inválida.' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_pendentes), 0) = 0 then
    raise exception 'Não há valor em aberto neste plano.' using errcode = 'P0001';
  end if;

  -- O que o app leu ainda está lá, em aberto, com a mesma soma? Com a trava do
  -- plano, a segunda chegada só chega aqui depois de a primeira gravar.
  select count(*), coalesce(sum(f.amount), 0)
    into v_qtd, v_soma
    from public.financial_transactions f
   where f.id = any(p_pendentes)
     and f.treatment_plan_id = p_plano
     and f.type = 'INCOME'
     and not f.is_paid
     and f.amount > 0
     and coalesce(f.notes, '') <> 'Estornada';
  if v_qtd <> cardinality(p_pendentes) or round(v_soma, 2) <> round(p_esperado, 2) then
    raise exception 'Este saldo já foi recebido ou mudou. Recarregue a tela antes de receber de novo.' using errcode = 'P0001';
  end if;

  if p_forma = 'AVISTA' then
    update public.financial_transactions
       set is_paid        = true,
           recebido_por   = case when coalesce(p_ator, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                 then (select u.id from public.users u where u.id = p_ator::uuid) end,
           paid_at        = v_agora,
           payment_method = p_metodo::public."PaymentMethod",
           cartao_vezes   = case when coalesce(p_vezes, 1) > 1 then p_vezes::smallint end,
           -- r3-f13-01 e C75: a bandeira e a maquininha do que é pago agora (só
           -- no cartão; sem a escolhida, o gatilho põe a primeira ativa).
           cartao_bandeira = case when v_cartao then coalesce(private.bandeira_do_cartao(p_metodo, p_bandeira), cartao_bandeira) end,
           maquininha_id   = case when v_cartao then coalesce(p_maquininha, maquininha_id) end,
           updated_at     = v_agora
     where id = any(p_pendentes);
    return round(v_soma, 2);
  end if;

  -- Entrada + parcelas: o saldo de antes sai de cena (zerado, como histórico) e
  -- volta partido nos lançamentos que o app montou — eles fecham com o saldo.
  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0)
    into v_novos
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if jsonb_array_length(coalesce(p_lancamentos, '[]'::jsonb)) = 0 or v_novos <> round(v_soma, 2) then
    raise exception 'O recebimento não fecha com o saldo em aberto do plano.' using errcode = 'P0001';
  end if;

  update public.financial_transactions
     set amount     = 0,
         notes      = 'Substituído pelo recebimento no check-in',
         updated_at = v_agora
   where id = any(p_pendentes);

  for v_j in select x from jsonb_array_elements(p_lancamentos) x
  loop
    v_pago := coalesce((v_j ->> 'is_paid')::boolean, false);
    insert into public.financial_transactions
      (branch_id, client_id, treatment_plan_id, type, category, description, amount, payment_method,
       cartao_vezes, cartao_bandeira, maquininha_id, is_paid, paid_at, due_date, notes, created_by,
       parcela_numero, parcela_total, parcela_grupo)
    values (
      v_plano.branch_id, v_plano.client_id, p_plano, 'INCOME', 'Serviços',
      v_j ->> 'description',
      round((v_j ->> 'amount')::numeric, 2),
      -- D6: só o que é pago agora (a entrada) leva o meio; o crediário, não.
      case when v_pago then p_metodo::public."PaymentMethod" end,
      -- D5: as vezes da entrada no crédito.
      case when v_pago and p_metodo = 'CREDIT_CARD' and coalesce(p_vezes, 1) > 1 then p_vezes::smallint end,
      case when v_pago and v_cartao then private.bandeira_do_cartao(p_metodo, p_bandeira) end,
      case when v_pago and v_cartao then p_maquininha end,
      v_pago,
      case when v_pago then v_agora end,
      nullif(v_j ->> 'due_date', '')::timestamptz,
      nullif(v_j ->> 'notes', ''),
      p_ator,
      nullif(v_j ->> 'parcela_numero', '')::int,
      nullif(v_j ->> 'parcela_total', '')::int,
      nullif(v_j ->> 'parcela_grupo', '')::uuid
    );
  end loop;

  return round(v_soma, 2);
end $$;

revoke all on function public.plano_receber(uuid, uuid, uuid[], numeric, text, text, integer, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.plano_receber(uuid, uuid, uuid[], numeric, text, text, integer, jsonb, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
