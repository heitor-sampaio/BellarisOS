-- D7 da 8ª simulação (2026-11-06): o ticket médio contava como "cliente que
-- pagou" quem tem lançamento pago de R$ 0. A conferência da Lúcia: R$ 4.368
-- ÷ 8 que pagaram = R$ 546, e o sistema dizia "R$ 437 · 10 clientes que
-- pagaram" — os dois a mais eram os pacotes migrados a R$ 0 (uma venda com
-- 100% de desconto faz o mesmo).
--
-- A cliente conta quando o que ELA pagou no recorte passa de zero: na
-- unidade, o pago nela; no total, o pago na clínica (a que pagou em duas
-- unidades conta uma vez, como antes). O pago (o numerador) não muda.
-- Partindo do corpo ATUAL da produção (20261029001102).

create or replace function public.metrics_ticket_medio(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(branch_id uuid, pago numeric, clientes bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with r as (
    select t.branch_id, t.client_id, sum(t.amount) as pago
      from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
     where t.client_id is not null
     group by t.branch_id, t.client_id
  )
  (select r.branch_id, coalesce(sum(r.pago), 0), count(*) filter (where r.pago > 0)
     from r
    group by r.branch_id)
  union all
  (select null::uuid, coalesce(sum(c.pago), 0), count(*) filter (where c.pago > 0)
     from (select r.client_id, sum(r.pago) as pago from r group by r.client_id) c)
$function$;

notify pgrst, 'reload schema';
