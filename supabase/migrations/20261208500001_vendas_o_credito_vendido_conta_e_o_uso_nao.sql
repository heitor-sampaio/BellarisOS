-- O Heitor, 25/11, sobre o crédito interno em Relatórios → Vendas: "se o
-- crédito foi vendido, é venda, tem que contar, não conta é quando só usa".
--
-- Era o contrário (RL1, 14/11, decisão do Claude): o crédito vendido aparecia
-- na lista e ficava FORA do "Total vendido", e o que se pagava com ele (o
-- atendimento, o pacote…) contava. Agora:
--
-- 1. O crédito vendido entra no "Total vendido": a linha geral de
--    `metrics_vendas_resumo` soma todos os tipos.
-- 2. O pagamento com crédito interno não faz a venda entrar: a régua do
--    primeiro recebimento pago (D6, 18/11) passa a pular o lançamento pago com
--    `INTERNAL_CREDIT`. A venda paga só com crédito não é venda (é o uso do
--    que já foi vendido), e a paga em parte entra no dia do primeiro dinheiro.
-- 3. A parte paga com crédito interno sai do valor da linha (o vendido, menos
--    o cancelado, o devolvido e o desconto, menos o pago com crédito), para o
--    mesmo dinheiro não contar duas vezes.
--
-- Troca de texto sobre o corpo VIVO de `metrics_vendas` (o de 20261124250001
-- com as trocas de 20261125100001, conferido na produção em 25/11); cada
-- trecho tem de aparecer o número de vezes esperado, ou a migration para.

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

select pg_temp.trocar_no_corpo(
  'public.metrics_vendas(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  array[
    $t$coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0$t$,
    $t$a.price - coalesce(t.sale_discount, 0), k.numero$t$,
    $t$cp.price - coalesce(cp.valor_cancelado, 0), k.numero$t$,
    $t$v.price - coalesce(x.cancelado, 0), k.numero$t$,
    $t$soma.valor - coalesce(tp.valor_cancelado, 0), k.numero$t$,
    $t$ps.price - coalesce(ps.valor_devolvido, 0),$t$
  ],
  array[
    $t$coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0 and f.payment_method::text is distinct from 'INTERNAL_CREDIT'$t$,
    $t$a.price - coalesce(t.sale_discount, 0) - (select coalesce(sum(f.amount), 0) from public.financial_transactions f where f.appointment_id = a.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and f.payment_method::text = 'INTERNAL_CREDIT'), k.numero$t$,
    $t$cp.price - coalesce(cp.valor_cancelado, 0) - (select coalesce(sum(f.amount), 0) from public.financial_transactions f where f.client_package_id = cp.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and f.payment_method::text = 'INTERNAL_CREDIT'), k.numero$t$,
    $t$v.price - coalesce(x.cancelado, 0) - (select coalesce(sum(f.amount), 0) from public.financial_transactions f where f.procedure_sale_id = v.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and f.payment_method::text = 'INTERNAL_CREDIT'), k.numero$t$,
    $t$soma.valor - coalesce(tp.valor_cancelado, 0) - (select coalesce(sum(f.amount), 0) from public.financial_transactions f where f.treatment_plan_id = tp.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and f.payment_method::text = 'INTERNAL_CREDIT'), k.numero$t$,
    $t$ps.price - coalesce(ps.valor_devolvido, 0) - (select coalesce(sum(f.amount), 0) from public.financial_transactions f where f.product_sale_id = ps.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and f.payment_method::text = 'INTERNAL_CREDIT'),$t$
  ],
  array[6, 1, 1, 1, 1, 1]);

-- O "Total vendido" (a linha de tipo nulo) soma todos os tipos, o crédito
-- vendido também. O resto da função não muda.
create or replace function public.metrics_vendas_resumo(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid, p_tags text[] DEFAULT NULL::text[])
 RETURNS TABLE(tipo text, quantidade bigint, total numeric, linhas bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with v as materialized (
    select x.tipo, x.valor
      from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) x where public.metrics_cliente_tem_as_tags(x.cliente_id, p_tags)
  )
  select v.tipo, count(*), coalesce(sum(v.valor), 0), count(*)
    from v
   group by v.tipo
  union all
  select null, count(*), coalesce(sum(v.valor), 0), count(*)
    from v
$function$;

notify pgrst, 'reload schema';
