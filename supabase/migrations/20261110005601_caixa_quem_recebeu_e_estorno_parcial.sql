-- F56 (os atritos do caixa da 11ª simulação, 2026-11-10).
--
-- A36: depois do estorno PARCIAL, o pagamento passa a valer o usado (r2-ven-05,
-- a regra fica) e a linha dizia só "110,00": quem lia não via que a cliente
-- tinha pago R$ 1.100. O pagamento PAGO de receita que diminui guarda o valor
-- de antes (`valor_antes_do_estorno`) — um gatilho, porque o estorno parcial
-- nasce em cinco funções (cancelamento do pacote e do plano, da unidade do
-- pré-pago, a devolução de produto e o estorno do crédito vendido).
--
-- A40: o Fechamento do dia por QUEM RECEBEU. `recebido_por` é quem registrou o
-- recebimento: no lançamento que já nasce pago, quem o lançou (`created_by`,
-- o id do membro); na baixa depois (a parcela do crediário, o atendimento
-- concluído, o plano no check-in), quem deu a baixa — o app e as duas funções
-- que dão baixa o gravam. O de antes desta migration não é reescrito: a conta
-- só o atribui quando ele nasceu pago (pago e criado no mesmo instante, quem
-- lançou é quem recebeu); o resto fica "não registrado" (princípio 4).

alter table public.financial_transactions add column if not exists valor_antes_do_estorno numeric(12,2);
alter table public.financial_transactions add column if not exists recebido_por uuid references public.users(id) on delete set null;

comment on column public.financial_transactions.valor_antes_do_estorno is
  'A36 da 11ª: o valor do pagamento antes de um estorno parcial (o pagamento passa a valer o usado — r2-ven-05).';
comment on column public.financial_transactions.recebido_por is
  'A40 da 11ª: quem registrou o recebimento (o Fechamento do dia por quem recebeu).';

create or replace function private.lancamento_guarda_o_pagamento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- A36: o pagamento pago de receita que diminui (o estorno parcial).
  if tg_op = 'UPDATE' and new.type = 'INCOME' and old.is_paid and new.is_paid
     and coalesce(new.notes, '') <> 'Estornada' and new.amount < old.amount then
    new.valor_antes_do_estorno := coalesce(old.valor_antes_do_estorno, old.amount);
  end if;
  -- A40: o lançamento que já nasce pago foi recebido por quem o lançou.
  if tg_op = 'INSERT' and new.type = 'INCOME' and new.is_paid and new.recebido_por is null
     and coalesce(new.created_by, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into new.recebido_por from public.users u where u.id = new.created_by::uuid;
  end if;
  return new;
end $$;

create or replace trigger trg_lancamento_guarda_o_pagamento
  before insert or update of amount, is_paid on public.financial_transactions
  for each row execute function private.lancamento_guarda_o_pagamento();

-- A baixa feita no banco grava quem deu a baixa: o recebimento do atendimento
-- e o do plano no check-in. Partindo do corpo ATUAL de cada uma, só a coluna nova.
do $$
declare
  v_def text;
  v_novo text;
begin
  v_def := pg_get_functiondef('public.confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)'::regprocedure);
  v_novo := replace(v_def,
    E'           is_paid          = true,\n           paid_at          = v_agora,',
    E'           is_paid          = true,\n           recebido_por     = (select u.id from public.users u where u.id = p_ator),\n           paid_at          = v_agora,');
  if v_novo = v_def then
    raise exception 'confirmar_pagamento_do_atendimento: o trecho da baixa mudou — revise a migration.';
  end if;
  execute v_novo;

  v_def := pg_get_functiondef('public.plano_receber(uuid,uuid,uuid[],numeric,text,text,integer,jsonb,text)'::regprocedure);
  v_novo := replace(v_def,
    E'       set is_paid        = true,\n           paid_at        = v_agora,',
    E'       set is_paid        = true,\n           recebido_por   = case when coalesce(p_ator, \'\') ~* \'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\'\n                                 then (select u.id from public.users u where u.id = p_ator::uuid) end,\n           paid_at        = v_agora,');
  if v_novo = v_def then
    raise exception 'plano_receber: o trecho da baixa mudou — revise a migration.';
  end if;
  execute v_novo;
end $$;

-- O Fechamento do dia por quem recebeu: as entradas (a regra única de receita,
-- o mesmo conjunto do resumo por forma) de cada pessoa, por forma e no total
-- dela. Sem quem, "não registrado" (pessoa nula).
create or replace function public.metrics_fechamento_por_quem_recebeu(p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz)
returns table(pessoa uuid, nome text, forma text, entradas numeric, lancamentos integer)
language sql
stable
security definer
set search_path to ''
as $$
  with t as (
    select coalesce(
             r.recebido_por,
             case when coalesce(r.created_by, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   and abs(extract(epoch from (coalesce(r.paid_at, r.created_at) - r.created_at))) < 5
                  then (select u.id from public.users u where u.id = r.created_by::uuid and u.tenant_id = p_tenant) end
           ) as pessoa,
           case
             when r.payment_method is null and coalesce(r.loyalty_discount, 0) > 0 then 'PONTOS'
             when r.payment_method is null then 'SEM_FORMA'
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           r.amount
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0
  )
  select t.pessoa, u.name, coalesce(t.forma, 'TOTAL'), round(sum(t.amount), 2), count(*)::integer
    from t
    left join public.users u on u.id = t.pessoa
   group by grouping sets ((t.pessoa, u.name, t.forma), (t.pessoa, u.name))
$$;

revoke execute on function public.metrics_fechamento_por_quem_recebeu(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_fechamento_por_quem_recebeu(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
