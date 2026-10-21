-- O estoque inicial do produto novo numa transação só (2026-10-21; a
-- simulação de um dia de clínica viu três gravações fora de transação em
-- createProduct — movimento, saldo e lote, mais a despesa —, contra a regra
-- do estoque: entrada só por estoque_entrada).
--
-- estoque_inicial = estoque_entrada (movimento, saldo travado, lote, custo)
-- + o estoque mínimo da unidade + a despesa da compra, QUANDO pedida (a tela
-- mostra a caixa "Lançar o custo como despesa paga hoje", marcada por
-- padrão). Falhou qualquer parte, nada fica.

create or replace function public.estoque_inicial(
  p_produto uuid, p_unidade uuid, p_quantidade numeric, p_custo numeric, p_observacao text,
  p_lote text, p_validade timestamptz, p_autor text, p_minimo numeric, p_despesa boolean, p_descricao text
)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_saldo numeric;
begin
  v_saldo := public.estoque_entrada(p_produto, p_unidade, p_quantidade, p_custo, p_observacao, p_lote, p_validade, p_autor);

  if p_minimo is not null then
    update public.branch_product_stock set min_stock = p_minimo, updated_at = now()
     where product_id = p_produto and branch_id = p_unidade;
  end if;

  if coalesce(p_despesa, false) and p_custo is not null and p_custo > 0 then
    insert into public.financial_transactions (branch_id, type, category, description, amount, is_paid, paid_at, notes, created_by)
    values (p_unidade, 'EXPENSE', 'Estoque', p_descricao, round(p_custo * p_quantidade, 2), true, now(),
            coalesce(p_observacao, 'Estoque inicial'), p_autor);
  end if;

  return v_saldo;
end;
$function$;

revoke execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamptz, text, numeric, boolean, text) from public, anon, authenticated;
grant execute on function public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamptz, text, numeric, boolean, text) to service_role;

notify pgrst, 'reload schema';
