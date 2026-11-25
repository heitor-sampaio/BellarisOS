-- O limite do registro do estoque vale dentro da transação.
--
-- O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
-- feito." O impossível do estoque é o registro: a quantidade e o saldo depois
-- do movimento (`stock_movements.quantity` e `balance_after`) e a quantidade
-- do lote (`product_batches.quantity`) são numeric(10,4), até 999.999,9999 — na
-- unidade do movimento (a de consumo, quando o produto tem uma). O app confere
-- antes de chamar (`lib/estoque/limites-do-registro.ts`, decisão do Claude,
-- 25/11), mas lê o saldo FORA da transação: com duas entradas ao mesmo tempo, a
-- segunda passava da conferência e o banco recusava em inglês ("numeric field
-- overflow").
--
-- As duas funções já travam o saldo (`for update`): a mesma conferência vai
-- para dentro delas, logo depois do saldo novo calculado. Decisão do Claude,
-- 25/11. A recusa é em português e diz o limite.
--
-- Troca de trecho nos corpos VIVOS, com a conferência da contagem (o padrão de
-- 20261206800001). O create or replace mantém os grants (só o servidor).

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
end $f$;

-- A entrada: a quantidade do movimento e o saldo depois dele.
select pg_temp.trocar_no_corpo(
  'public.estoque_entrada(uuid,uuid,numeric,numeric,text,text,timestamptz,text,text,text,text)'::regprocedure,
  array[$t$  v_novo_rend  := case when v_upp is not null and v_rendimento is not null then v_rendimento + p_quantidade * v_upp end;$t$],
  array[$t$  v_novo_rend  := case when v_upp is not null and v_rendimento is not null then v_rendimento + p_quantidade * v_upp end;
  if p_quantidade > 999999.9999 or p_quantidade * v_fator > 999999.9999 or coalesce(v_novo_rend, v_novo_saldo) > 999999.9999 then
    raise exception 'O estoque passaria de 999.999,9999 (o limite do registro).' using errcode = 'P0001';
  end if;$t$],
  array[1]
);

-- A transferência: a quantidade do movimento e o saldo do destino depois dele.
select pg_temp.trocar_no_corpo(
  'public.estoque_transferir(uuid,uuid,uuid,numeric,text,text)'::regprocedure,
  array[$t$  v_ref := 'TRANSFER-' || gen_random_uuid();$t$],
  array[$t$  if p_quantidade * coalesce(v_upp, 1) > 999999.9999 or coalesce(v_para_rend, v_para_novo) > 999999.9999 then
    raise exception 'O estoque de destino passaria de 999.999,9999 (o limite do registro).' using errcode = 'P0001';
  end if;
  v_ref := 'TRANSFER-' || gen_random_uuid();$t$],
  array[1]
);

drop function pg_temp.trocar_no_corpo(regprocedure, text[], text[], int[]);

notify pgrst, 'reload schema';
