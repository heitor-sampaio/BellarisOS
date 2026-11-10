-- A26 da 10ª simulação (2026-11-10): "Cancelar pacote" com os pontos já
-- trocados não avisava que o saldo ia a −380 (a Camila tinha 220 pontos; o
-- pacote tinha dado 750, e ela já tinha trocado 1.500 por uma recompensa). A
-- regra fica (fidelidade.md: "o estorno tira exatamente o que aquele pagamento
-- deu… saldo pode ficar negativo"); a janela passa a dizer, antes, quantos
-- pontos os pagamentos do pacote (ou do plano) deram e o saldo de hoje.
--
-- fidelidade_pontos_do_conjunto: os pontos LÍQUIDOS que os lançamentos do
-- pacote ou do plano deram (o ganho menos o que um estorno já tirou) e o saldo
-- da cliente hoje (saldo_de_pontos). Só leitura; só o servidor chama.

create or replace function public.fidelidade_pontos_do_conjunto(p_tenant uuid, p_pacote uuid, p_plano uuid)
returns table(ganhos integer, saldo integer)
language sql
stable
security definer
set search_path to ''
as $function$
  with dono as (
    select cp.client_id from public.client_packages cp
      join public.clients c on c.id = cp.client_id and c.tenant_id = p_tenant
     where p_pacote is not null and cp.id = p_pacote
    union all
    select tp.client_id from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id and b.tenant_id = p_tenant
     where p_plano is not null and tp.id = p_plano
  ),
  lancamentos as (
    select t.id from public.financial_transactions t
      join public.branches b on b.id = t.branch_id and b.tenant_id = p_tenant
     where (p_pacote is not null and t.client_package_id = p_pacote)
        or (p_plano is not null and t.treatment_plan_id = p_plano)
  )
  select coalesce((select sum(lt.points)::int from public.loyalty_transactions lt
                    where lt.transaction_id in (select id from lancamentos)
                      and lt.kind in ('GANHO', 'ESTORNO_GANHO')), 0),
         coalesce((select public.saldo_de_pontos(d.client_id, null) from dono d limit 1), 0)
$function$;

revoke execute on function public.fidelidade_pontos_do_conjunto(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fidelidade_pontos_do_conjunto(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
