-- D1 da 42ª simulação. GA-02 (recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"): "o ganho é
-- sobre o valor pago, depois do voucher e dos pontos usados".
--
-- No atendimento AVULSO, no modo "por procedimento", a base dos pontos era
-- sum(amount + loyalty_discount + sale_discount) sobre o preço de tabela do atendimento: o voucher e os pontos
-- usados contavam como dinheiro pago. A Massagem de R$ 140 (55 pontos) paga R$ 125 com um voucher de R$ 15
-- dava 55 pontos, e não 49 (55 × 125 ÷ 140); a Limpeza paga com 100 pontos + Pix + dinheiro dava os 60 inteiros.
--
-- A conta passa a ser a dos ramos irmãos (o pacote e o plano, na mesma função): os pontos do procedimento × o
-- dinheiro que entrou ÷ o preço VENDIDO. O preço vendido do avulso é o de tabela menos o desconto comercial
-- (sale_discount, que mora fora de amount — vendas-financeiro.md, "Avulso"); no pacote e no plano o preço
-- gravado já é o com desconto. Assim o desconto comercial não tira pontos (como no pacote e no plano), e o
-- voucher e os pontos usados tiram (decisão B-1 da 42ª, do Claude, 28/11, pela GA-02, GA-07 e PD-05).
-- O crédito interno segue fora do pago (GA-07: já pontuou na venda dele).
--
-- O desconto comercial é lido de todos os lançamentos vivos do atendimento, pagos ou não: ele mora no
-- PRIMEIRO lançamento (confirmar_pagamento_do_atendimento), que no crediário pode ainda estar a receber, e o
-- preço vendido não depende de qual parcela já foi paga. O do lançamento estornado não conta.
--
-- Cumulativo como antes (o alvo menos o que já foi dado): só o alvo muda.

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
end $f$;

select pg_temp.trocar_no_corpo(
  'public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure,
  array[
$t$           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)), 0)
      into v_pago, v_cob$t$,
$t$      v_alvo := case when coalesce(v_total, 0) > 0
                     then floor(coalesce(v_plano_pts, 0) * least(v_cob, v_total) / v_total)::bigint
                     else 0 end;$t$
  ],
  array[
$t$           -- v_cob: o desconto comercial do atendimento (o preço vendido é v_total - v_cob).
           coalesce((select sum(coalesce(d.sale_discount, 0))
                       from public.financial_transactions d
                      where d.appointment_id = p_tx.appointment_id
                        and d.type = 'INCOME' and d.estorno_de is null
                        and d.category <> 'Estorno' and coalesce(d.notes, '') <> 'Estornada'), 0)
      into v_pago, v_cob$t$,
$t$      v_alvo := case when v_total - v_cob > 0
                     then floor(coalesce(v_plano_pts, 0) * least(v_pago, v_total - v_cob) / (v_total - v_cob))::bigint
                     else 0 end;$t$
  ],
  array[1, 1]
);

notify pgrst, 'reload schema';
