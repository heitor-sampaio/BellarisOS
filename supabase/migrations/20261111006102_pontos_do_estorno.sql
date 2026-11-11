-- A30 da 12ª simulação (2026-11-11; princípio 3): a Helena estornou o
-- pagamento da Carla (a indicada) sem saber que saíam os 180 pontos dela e os
-- 200 do prêmio da Ana. A janela do estorno passa a dizer ANTES — a conta é
-- daqui, das mesmas tabelas que o estorno mexe (`estornar_transacao` tira o
-- GANHO e devolve o RESGATE deste pagamento; `private.fidelidade_estorno_da_indicacao`
-- tira o prêmio ligado a ele, e o passa ao outro pagamento que vale dela):
--   ligada        o programa da rede ligado (desligado, a tela não fala de pontos)
--   cliente       o nome da cliente do pagamento
--   ganhos        os pontos que este pagamento deu (saem)
--   usados        os pontos usados neste pagamento (voltam)
--   saldo         o saldo dela hoje
--   indicadora    quem a indicou, quando o prêmio está ligado a este pagamento
--   premio_pontos os pontos do prêmio (0 quando é voucher)
--   premio_voucher / premio_voucher_status   o voucher do prêmio e a situação dele
--   premio_passa  ela tem outro pagamento que vale: o prêmio passa para ele
-- Só leitura; a regra não muda (`fidelidade.md`). Recebe a rede por parâmetro:
-- só o servidor executa.

create or replace function public.fidelidade_pontos_do_estorno(p_tenant uuid, p_transacao uuid)
returns table(
  ligada boolean, cliente text, ganhos integer, usados integer, saldo integer,
  indicadora text, premio_pontos integer, premio_voucher text, premio_voucher_status text, premio_passa boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  with t as (
    select f.* from public.financial_transactions f
      join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
     where f.id = p_transacao and f.type = 'INCOME' and f.client_id is not null
  ),
  pr as (
    select p.* from public.indicacao_premios p
      join t on p.transaction_id = t.id
     where p.estornado_em is null
     limit 1
  )
  select coalesce((select c.enabled from public.loyalty_configs c where c.tenant_id = p_tenant), false),
         (select c.name from public.clients c where c.id = t.client_id),
         coalesce((select sum(l.points)::int from public.loyalty_transactions l where l.transaction_id = t.id and l.kind = 'GANHO'), 0),
         coalesce((select sum(abs(l.points))::int from public.loyalty_transactions l where l.transaction_id = t.id and l.kind = 'RESGATE'), 0),
         coalesce(public.saldo_de_pontos(t.client_id, null), 0),
         (select c.name from public.clients c join pr on c.id = pr.indicadora_id),
         coalesce((select l.points from public.loyalty_transactions l join pr on l.id = pr.loyalty_transaction_id), 0),
         (select v.name from public.loyalty_vouchers v join pr on v.id = pr.voucher_id),
         (select v.status from public.loyalty_vouchers v join pr on v.id = pr.voucher_id),
         exists (
           select 1 from pr, public.financial_transactions f
            where f.client_id = t.client_id and f.id <> t.id
              and private.indicacao_pagamento_que_vale(f)
         )
    from t
$function$;

revoke execute on function public.fidelidade_pontos_do_estorno(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fidelidade_pontos_do_estorno(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
