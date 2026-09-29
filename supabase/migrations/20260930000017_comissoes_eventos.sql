-- Comissões: os fatos na corrente de eventos (§9.9), para as automações.
--
-- - `comissao.liberada`: um pagamento liberou comissão (o recebimento do
--   plano, o pagamento do avulso no modo "quando o cliente paga"). Sai de
--   `comissao_acertar_linha` quando a diferença é positiva E veio de uma
--   transação — a conclusão já emite `comissao.gerada` (no app).
-- - `comissao.paga`: o fechamento pagou o profissional. Sai de `comissao_fechar`.
--
-- Os dois do BANCO, como `pagamento.*` (origem 'banco', sem ator): a liberação
-- nasce no gatilho do pagamento, em qualquer um dos lugares onde receita paga
-- nasce.

create or replace function private.comissao_acertar_linha(p_linha uuid, p_motivo text, p_transacao uuid)
returns numeric
language plpgsql security definer set search_path = ''
as $$
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
        v_l.tenant_id, v_l.branch_id, 'comissao.liberada', 'comissao', v_l.appointment_id,
        jsonb_build_object(
          'profissionalId',   v_l.professional_id,
          'profissionalNome', (select u.name from public.users u where u.id = v_l.professional_id),
          'agendamentoId',    v_l.appointment_id,
          'procedimentoNome', (select p.name from public.procedures p where p.id = v_l.procedure_id),
          'valor',            v_delta,
          'motivo',           p_motivo
        ),
        'sistema', 'banco', 'comissao.liberada:' || v_id, now()
      )
      on conflict (tenant_id, chave) where chave is not null do nothing;
    end if;
  end if;
  return v_delta;
end $$;

create or replace function public.comissao_fechar(
  p_tenant uuid, p_profissional uuid, p_unidade uuid, p_fim timestamptz, p_ator uuid, p_metodo text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome    text;
  v_unidade text;
  v_total   numeric;
  v_inicio  timestamptz;
  v_tx      uuid;
  v_id      uuid;
begin
  select b.name into v_unidade from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select u.name into v_nome from public.users u where u.id = p_profissional and u.tenant_id = p_tenant;
  if not found then
    raise exception 'Profissional não encontrado.' using errcode = 'no_data_found';
  end if;

  perform pg_advisory_xact_lock(hashtext('comissao_fechar:' || p_profissional::text || ':' || p_unidade::text));

  select coalesce(sum(c.amount), 0), min(c.released_at) into v_total, v_inicio
    from public.commissions c
   where c.professional_id = p_profissional and c.branch_id = p_unidade
     and c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim;

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
   where c.professional_id = p_profissional and c.branch_id = p_unidade
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
end $$;

revoke execute on function private.comissao_acertar_linha(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.comissao_fechar(uuid, uuid, uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.comissao_fechar(uuid, uuid, uuid, timestamptz, uuid, text) to service_role;

notify pgrst, 'reload schema';
