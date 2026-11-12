-- C75 da F67 — a maquininha é de quem RECEBE no cartão.
--
-- A despesa paga no cartão (o fornecedor no cartão da clínica) não passa em
-- maquininha nenhuma: a 6708 punha nela a primeira ativa, e o Fechamento do
-- dia a contava na maquininha. Aqui: a despesa fica sem maquininha, e o
-- Fechamento separa só a receita por maquininha (a saída do cartão fica como
-- "não informada").

create or replace function private.maquininha_do_lancamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  if new.payment_method is null or new.payment_method::text not in ('DEBIT_CARD', 'CREDIT_CARD')
     or new.type::text = 'EXPENSE' then
    new.maquininha_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.maquininha_id is not null and new.maquininha_id is not distinct from old.maquininha_id then
    return new;
  end if;
  select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
  if new.maquininha_id is not null then
    if not exists (select 1 from public.maquininhas m where m.id = new.maquininha_id and m.tenant_id = v_tenant) then
      raise exception 'Esta maquininha não é desta clínica.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- O estorno herda a maquininha do pagamento estornado.
  if new.estorno_de is not null then
    select f.maquininha_id into new.maquininha_id from public.financial_transactions f where f.id = new.estorno_de;
  end if;
  -- Sem escolha (a rede com uma só, o caminho que não pergunta): a primeira ativa.
  if new.maquininha_id is null then
    select m.id into new.maquininha_id from public.maquininhas m
     where m.tenant_id = v_tenant and m.arquivada_em is null
     order by m.ordem, m.created_at, m.id limit 1;
  end if;
  return new;
end
$$;

revoke execute on function private.maquininha_do_lancamento() from public, anon, authenticated;

-- A troca do tipo também passa pelo gatilho (a receita que vira despesa perde a maquininha).
drop trigger if exists trg_maquininha_do_lancamento on public.financial_transactions;
create trigger trg_maquininha_do_lancamento
  before insert or update of payment_method, maquininha_id, type on public.financial_transactions
  for each row execute function private.maquininha_do_lancamento();

-- As despesas no cartão gravadas desde a 6708 (a coluna é de hoje).
update public.financial_transactions set maquininha_id = null
 where type = 'EXPENSE' and maquininha_id is not null;

create or replace function public.metrics_fechamento_por_maquininha(p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz)
returns table(forma text, maquininha_id uuid, maquininha text, bandeira text, entradas numeric, saidas numeric, lancamentos integer)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select case
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           private.maquininha_da_venda(p_tenant, r.maquininha_id) as maq,
           r.cartao_bandeira as bandeira,
           case when r.estorno_de is null then r.amount else 0::numeric end as entrada,
           case when r.estorno_de is null then 0::numeric else -r.amount end as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0 and r.payment_method in ('CREDIT_CARD', 'DEBIT_CARD')
    union all
    select case
             when f.payment_method = 'CREDIT_CARD' and coalesce(f.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || f.cartao_vezes
             else f.payment_method::text
           end,
           null::uuid,
           f.cartao_bandeira,
           case when f.estorno_de is null then 0::numeric else -f.amount end,
           case when f.estorno_de is null then f.amount else 0::numeric end
      from public.metrics_movimentos_pagos(p_tenant, array[p_branch], p_from, p_to) f
     where f.type = 'EXPENSE' and f.amount <> 0 and f.payment_method in ('CREDIT_CARD', 'DEBIT_CARD')
  )
  select t.forma, t.maq, m.nome, t.bandeira, round(sum(t.entrada), 2), round(sum(t.saida), 2), count(*)::integer
    from t
    left join public.maquininhas m on m.id = t.maq
   group by t.forma, t.maq, m.nome, t.bandeira
   order by t.forma, m.nome nulls last, t.bandeira nulls last
$$;

revoke execute on function public.metrics_fechamento_por_maquininha(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_fechamento_por_maquininha(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
