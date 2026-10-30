-- J-49 (simulação de 2026-10-30): os avisos do Fechamento do dia. Dois deles
-- precisam de número que a tela não tem, e o número é do banco (§13.1):
--
-- * as TAXAS da maquininha do dia (só informativo — não saem do saldo): cada
--   recebimento da regra de receita (metrics_receitas_pagas) × a taxa da forma
--   dele (private.comissao_taxa_pct: a da forma; no crédito, a da maior faixa
--   cadastrada até as vezes do recebimento). Dinheiro e crédito interno não
--   têm taxa.
-- * o MOVIMENTO DEPOIS do fechamento: os lançamentos do dia (as entradas da
--   regra de receita e as saídas pagas, como em metrics_fechamento_do_dia)
--   pagos depois de p_desde (o último fechamento).
--
-- Os outros dois avisos (dinheiro a receber e "saiu mais dinheiro do que
-- entrou") usam números que a tela já recebe do banco.

create or replace function public.metrics_avisos_do_fechamento(
  p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_desde timestamp with time zone)
 returns table(taxas numeric, movimentos_depois integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with receitas as (
    select r.amount, r.payment_method::text as metodo, coalesce(r.cartao_vezes, r.parcela_total, 1) as vezes,
           coalesce(r.paid_at, r.created_at) as quando
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0
  ), saidas as (
    select coalesce(f.paid_at, f.created_at) as quando
      from public.financial_transactions f
      join public.branches b on b.id = f.branch_id
     where b.tenant_id = p_tenant and b.id = p_branch
       and f.type = 'EXPENSE' and f.is_paid and f.amount <> 0
       and coalesce(f.notes, '')    <> 'Estornada'
       and coalesce(f.category, '') <> 'Estorno'
       and coalesce(f.paid_at, f.created_at) between p_from and p_to
  )
  select
    coalesce((select round(sum(r.amount * private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes) / 100), 2)
                from receitas r where r.metodo in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')), 0),
    case when p_desde is null then 0 else
      ((select count(*) from receitas r where r.quando > p_desde)
       + (select count(*) from saidas s where s.quando > p_desde))::integer
    end
$function$;
revoke execute on function public.metrics_avisos_do_fechamento(uuid, uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_avisos_do_fechamento(uuid, uuid, timestamptz, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
