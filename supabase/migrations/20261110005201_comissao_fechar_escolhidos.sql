-- O pagamento parcial da comissão (A21 da 10ª simulação; decisão do Heitor,
-- 2026-11-10: "concordo com marcar e desmarcar"). O "Fechar e pagar" lista os
-- lançamentos da pessoa, todos marcados; o desmarcado continua "a pagar" e
-- volta no próximo fechamento. Não há valor digitado: um lançamento é pago
-- inteiro ou fica.
--
-- `comissao_fechar_escolhidos` é o fechamento de sempre (a despesa paga, o
-- `commission_payouts`, os lançamentos PAID com o `payout_id` e o evento
-- `comissao.paga`, numa transação e com a mesma trava por profissional e
-- unidade), sobre os lançamentos ESCOLHIDOS. Cada um tem de ser desta pessoa,
-- desta unidade, aberto, sem fechamento e lançado até o fim; o que não for
-- (já pago por outra aba, de outra pessoa) recusa o fechamento inteiro — a tela
-- recarrega e mostra o que mudou. `comissao_fechar` (tudo o que está a pagar)
-- passa a chamar este com todos os abertos: a conta do fechamento mora num
-- lugar só.

create or replace function public.comissao_fechar_escolhidos(
  p_tenant uuid, p_profissional uuid, p_unidade uuid, p_fim timestamptz, p_ator uuid, p_metodo text,
  p_lancamentos uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_nome     text;
  v_unidade  text;
  v_total    numeric;
  v_inicio   timestamptz;
  v_quantos  int;
  v_pedidos  int;
  v_tx       uuid;
  v_id       uuid;
begin
  select b.name into v_unidade from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select u.name into v_nome from public.users u where u.id = p_profissional and u.tenant_id = p_tenant;
  if not found then
    raise exception 'Profissional não encontrado.' using errcode = 'no_data_found';
  end if;

  v_pedidos := coalesce(cardinality(array(select distinct x from unnest(p_lancamentos) x where x is not null)), 0);
  if v_pedidos = 0 then
    raise exception 'Escolha ao menos um lançamento para pagar.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('comissao_fechar:' || p_profissional::text || ':' || p_unidade::text));

  select count(*), coalesce(sum(c.amount), 0), min(c.released_at) into v_quantos, v_total, v_inicio
    from public.commissions c
   where c.id = any (p_lancamentos)
     and c.professional_id = p_profissional and c.branch_id = p_unidade
     and c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim;

  if v_quantos <> v_pedidos then
    raise exception 'Um dos lançamentos escolhidos já foi pago ou mudou. Recarregue a tela e confira a lista.' using errcode = 'P0001';
  end if;
  if v_total = 0 then
    raise exception 'Nada a pagar a este profissional até o fim do período.' using errcode = 'P0001';
  end if;
  if v_total < 0 then
    raise exception 'O saldo do profissional está negativo (estornos maiores que o liberado): ele é descontado no próximo fechamento.'
      using errcode = 'P0001';
  end if;

  insert into public.financial_transactions
    (branch_id, type, category, description, amount, payment_method, is_paid, paid_at, created_by)
  values (
    p_unidade, 'EXPENSE', 'Comissões',
    'Comissões — ' || v_nome || ' — até ' || to_char(p_fim at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
    v_total, nullif(p_metodo, '')::public."PaymentMethod", true, now(), coalesce(p_ator::text, 'sistema')
  ) returning id into v_tx;

  insert into public.commission_payouts
    (tenant_id, branch_id, professional_id, inicio, fim, total, transaction_id, paid_by)
  values (p_tenant, p_unidade, p_profissional, v_inicio, p_fim, v_total, v_tx, p_ator)
  returning id into v_id;

  update public.commissions c
     set status = 'PAID', paid_at = now(), paid_by = coalesce(p_ator::text, 'sistema'), payout_id = v_id
   where c.id = any (p_lancamentos)
     and c.professional_id = p_profissional and c.branch_id = p_unidade
     and c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    p_tenant, p_unidade, 'comissao.paga', 'comissao', v_id,
    jsonb_build_object(
      'profissionalId',   p_profissional,
      'profissionalNome', v_nome,
      'valor',            v_total,
      'fechamentoId',     v_id,
      'unidadeNome',      v_unidade
    ),
    'sistema', 'banco', 'comissao.paga:' || v_id, now()
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  return v_id;
end $function$;

-- Tudo o que está a pagar: os abertos até o fim, pelo fechamento dos escolhidos.
create or replace function public.comissao_fechar(p_tenant uuid, p_profissional uuid, p_unidade uuid, p_fim timestamp with time zone, p_ator uuid, p_metodo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
begin
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.users u where u.id = p_profissional and u.tenant_id = p_tenant) then
    raise exception 'Profissional não encontrado.' using errcode = 'no_data_found';
  end if;

  -- A mesma trava do fechamento (é reentrante na transação): a lista lida aqui
  -- é a que se fecha.
  perform pg_advisory_xact_lock(hashtext('comissao_fechar:' || p_profissional::text || ':' || p_unidade::text));

  select array_agg(c.id) into v_ids
    from public.commissions c
   where c.professional_id = p_profissional and c.branch_id = p_unidade
     and c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim;

  if v_ids is null then
    raise exception 'Nada a pagar a este profissional até o fim do período.' using errcode = 'P0001';
  end if;

  return public.comissao_fechar_escolhidos(p_tenant, p_profissional, p_unidade, p_fim, p_ator, p_metodo, v_ids);
end $function$;

revoke execute on function public.comissao_fechar_escolhidos(uuid, uuid, uuid, timestamptz, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.comissao_fechar_escolhidos(uuid, uuid, uuid, timestamptz, uuid, text, uuid[]) to service_role;

notify pgrst, 'reload schema';
