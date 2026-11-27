-- A13 da 37ª simulação (2026-11-27; SA-04 "o 'vence em' de cada linha", SA-05
-- "gastam-se primeiro os que vencem antes"; princípio 3): depois da troca de
-- pontos, as linhas de ganho do extrato (ficha e app) seguiam "vence em
-- 27/02/2027" inteiras, com o saldo menor — o extrato não dizia de qual
-- vencimento os pontos saíram nem quanto resta de cada ganho.
--
-- O que resta de cada ganho com validade, pela MESMA conta do vencimento
-- (fidelidade_a_expirar, a única cópia do FIFO — fidelidade.md, "O que nunca
-- fazer aqui"): o que resta de um vencimento D é o a vencer até D menos o a
-- vencer até o vencimento anterior. Dentro do mesmo vencimento, o mais antigo
-- sai primeiro (a sobra fica nos ganhos mais novos) — decisão do Claude, 27/11:
-- é só como o mesmo número do vencimento se reparte entre as linhas dele.
-- A tela não soma nada: escreve o "restante" de cada linha.
--
-- Leitura do servidor (o extrato se lê pelo cliente de serviço): só o
-- service_role executa.

create or replace function public.fidelidade_restante_dos_ganhos(p_conta uuid)
returns table(transaction_id uuid, restante integer)
language sql
stable
security definer
set search_path to ''
as $$
  with datas as (
    select distinct t.expires_at as d
      from public.loyalty_transactions t
     where t.loyalty_account_id = p_conta
       and t.expires_at is not null
       and (t.points > 0 or t.kind = 'ESTORNO_GANHO')
  ), ate as (
    select d, public.fidelidade_a_expirar(p_conta, d) as a_vencer from datas
  ), por_data as (
    select d, a_vencer - coalesce(lag(a_vencer) over (order by d), 0) as resta from ate
  ), ganhos as (
    select t.id, t.points, t.expires_at,
           coalesce(sum(t.points) over (partition by t.expires_at order by t.created_at desc, t.id desc
                    rows between unbounded preceding and 1 preceding), 0) as dos_mais_novos
      from public.loyalty_transactions t
     where t.loyalty_account_id = p_conta
       and t.points > 0
       and t.expires_at is not null
  )
  select g.id, greatest(0, least(g.points, pd.resta - g.dos_mais_novos))::int
    from ganhos g
    join por_data pd on pd.d = g.expires_at
$$;

revoke execute on function public.fidelidade_restante_dos_ganhos(uuid) from public, anon, authenticated;
grant execute on function public.fidelidade_restante_dos_ganhos(uuid) to service_role;

notify pgrst, 'reload schema';
