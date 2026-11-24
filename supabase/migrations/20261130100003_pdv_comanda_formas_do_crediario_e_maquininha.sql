-- A15 da 26ª simulação (princípio 3): a comanda do pacote vendido no
-- crediário dizia "Crediário · R$ 1.000,00 recebidos", sem a forma da entrada
-- (crédito 3x) nem a maquininha (Cielo).
--
-- `pdv_comandas` devolve, em `formas`, as formas do que já ENTROU da venda —
-- mas a venda no crediário ficava de fora (`not in ('CREDIARIO', 'A_RECEBER')`):
-- só o a receber (que não tem meio) fica de fora agora. E cada forma no
-- cartão leva a maquininha do lançamento (`maquininha`, o id; o nome vai ao
-- rótulo só quando a rede tem mais de uma — A18 da 14ª, `maquininhaDoRotulo`).
-- A tela escreve "Crediário (Crédito 3x · Cielo)" (`formasDaComandaEmTexto`).
--
-- Partes do corpo VIVO (o padrão `pg_temp.trocar_no_corpo`), com a contagem.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  de text;
  para text;
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    -- O arquivo pode ter vindo com CRLF; o corpo no banco, não.
    de := replace(p_de[i], chr(13), '');
    para := replace(p_para[i], chr(13), '');
    n := (length(d) - length(replace(d, de, ''))) / length(de);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, de, para);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.pdv_comandas(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure,
  array[
    $t$where s.origem = 'VENDA' and coalesce(s.v_forma, '') not in ('CREDIARIO', 'A_RECEBER')$t$,
    $t$jsonb_build_object('forma', x.forma, 'vezes', x.vezes, 'bandeira', x.bandeira, 'valor', x.valor)$t$,
    $t$t.cartao_bandeira::text as bandeira, round(sum(t.amount), 2) as valor$t$,
    $t$group by 1, 2, 3 having sum(t.amount) <> 0$t$],
  array[
    $t$where s.origem = 'VENDA' and coalesce(s.v_forma, '') <> 'A_RECEBER'$t$,
    $t$jsonb_build_object('forma', x.forma, 'vezes', x.vezes, 'bandeira', x.bandeira, 'maquininha', x.maquininha, 'valor', x.valor)$t$,
    $t$t.cartao_bandeira::text as bandeira,
                                  case when t.payment_method::text in ('CREDIT_CARD', 'DEBIT_CARD') then t.maquininha_id end as maquininha,
                                  round(sum(t.amount), 2) as valor$t$,
    $t$group by 1, 2, 3, 4 having sum(t.amount) <> 0$t$],
  array[1, 1, 1, 1]);

notify pgrst, 'reload schema';
