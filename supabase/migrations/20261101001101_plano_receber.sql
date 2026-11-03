-- F11 da 5ª simulação: receber o plano no check-in numa transação, com o plano
-- TRAVADO (sobra da F9, 2026-11-02).
--
-- `receberDoPlano` lia o saldo em aberto no app e gravava em três passos soltos
-- (quitar ou zerar o saldo, a entrada, as parcelas). Duas chegadas ao mesmo
-- tempo (duas abas, o duplo clique) liam os MESMOS R$ 300 e cada uma gravava a
-- sua entrada e as suas parcelas: R$ 600 combinados de um plano de R$ 300.
--
-- Agora o app calcula (o que cobrar e os lançamentos novos) e esta função
-- grava tudo de uma vez: trava a linha do plano, confere que os lançamentos a
-- cobrar são os que o app leu — ainda em aberto e com a soma que ele mostrou —
-- e só então quita (à vista) ou troca o saldo por entrada + parcelas. A
-- segunda chegada espera a trava, encontra o saldo já recebido e é recusada.
-- Os gatilhos de sempre (comissão, pontos, crédito interno, recebíveis do
-- cartão) valem como antes: rodam dentro da mesma transação.

create or replace function public.plano_receber(
  p_tenant      uuid,
  p_plano       uuid,
  p_pendentes   uuid[],
  p_esperado    numeric,
  p_forma       text,
  p_metodo      text,
  p_vezes       integer,
  p_lancamentos jsonb,
  p_ator        text
) returns numeric
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
           paid_at        = v_agora,
           payment_method = p_metodo::public."PaymentMethod",
           cartao_vezes   = case when coalesce(p_vezes, 1) > 1 then p_vezes::smallint end,
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
    insert into public.financial_transactions
      (branch_id, client_id, treatment_plan_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo)
    values (
      v_plano.branch_id, v_plano.client_id, p_plano, 'INCOME', 'Serviços',
      v_j ->> 'description',
      round((v_j ->> 'amount')::numeric, 2),
      p_metodo::public."PaymentMethod",
      coalesce((v_j ->> 'is_paid')::boolean, false),
      case when coalesce((v_j ->> 'is_paid')::boolean, false) then v_agora end,
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

revoke execute on function public.plano_receber(uuid, uuid, uuid[], numeric, text, text, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.plano_receber(uuid, uuid, uuid[], numeric, text, text, integer, jsonb, text) to service_role;

notify pgrst, 'reload schema';
