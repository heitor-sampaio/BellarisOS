-- Os pontos até o limite do registro. O Heitor, 25/11: "Se não for impossível,
-- ainda que improvável, pode ser feito." O ajuste manual e os pontos do
-- procedimento iam até 1.000.000 (o app recusava acima); agora acima disso a
-- tela avisa e o servidor grava (lib/fidelidade/pontos-acima-do-comum.ts).
--
-- O impossível (decisão do Claude, 25/11) é o `integer` dos pontos:
-- `loyalty_transactions.points` e `saldo_de_pontos` são integer (até
-- 2.147.483.647). O ajuste que faria o SALDO passar disso estourava com
-- "integer out of range" — o saldo é a soma do extrato, e toda leitura dele
-- quebraria depois. Passa a ser recusado, com a mensagem.
--
-- Troca de trecho no corpo VIVO, com a conferência da contagem (o padrão de
-- 20261130100007). O create or replace mantém os grants (só o servidor).

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

-- O ajuste: o crédito que passaria o saldo do integer.
select pg_temp.trocar_no_corpo(
  'public.ajustar_pontos(uuid, uuid, uuid, integer, text, text)'::regprocedure,
  array[$t$  perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));$t$],
  array[$t$  perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));

  -- O saldo é integer (o limite do registro, decisão do Claude, 25/11).
  if p_pontos > 0 and public.saldo_de_pontos(p_cliente)::bigint + p_pontos > 2147483647 then
    raise exception 'O saldo passaria de 2.147.483.647 pontos (o limite do registro): o cliente tem % pontos.',
      public.saldo_de_pontos(p_cliente) using errcode = 'P0001';
  end if;$t$],
  array[1]
);

-- Os pontos de UM pagamento e o saldo depois do ganho (o gatilho
-- `on_transaction_loyalty_earn`, no pagamento). Os do procedimento × as
-- unidades da venda (`loyalty_points * count(*)` já é bigint; o estouro era o
-- `::int` do alvo) ou o valor × os pontos por real passavam do integer com
-- "integer out of range", e o pagamento falhava com o erro do banco. A conta
-- passa a bigint, e o que não cabe no registro recusa com a mensagem — como o
-- ajuste. (O Heitor, 25/11, autorizou mudar só COMO `tests/fidelidade-config`
-- acha a migration da regra de 18/11: esta troca de trecho passava a ser "a
-- mais nova" da função.)

create or replace function private.pontos_no_registro(p_pontos numeric)
returns integer
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_pontos > 2147483647 then
    raise exception 'Os pontos deste pagamento passam de 2.147.483.647 (o limite do registro).' using errcode = 'P0001';
  end if;
  return p_pontos::int;
end;
$$;
revoke all on function private.pontos_no_registro(numeric) from public, anon, authenticated;

select pg_temp.trocar_no_corpo(
  'public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure,
  array[
    $t$  v_alvo      int;$t$,
    $t$/ v_total)::int$t$,
    $t$v_alvo := floor(v_pago * p_cfg.points_per_real)::int;$t$,
    $t$return greatest(v_alvo - v_ja, 0);$t$,
    $t$return floor(p_tx.amount * p_cfg.points_per_real)::int;$t$
  ],
  array[
    $t$  v_alvo      bigint;$t$,
    $t$/ v_total)::bigint$t$,
    $t$v_alvo := floor(v_pago * p_cfg.points_per_real)::bigint;$t$,
    $t$return private.pontos_no_registro(greatest(v_alvo - v_ja, 0));$t$,
    $t$return private.pontos_no_registro(floor(p_tx.amount * p_cfg.points_per_real));$t$
  ],
  array[1, 3, 3, 4, 3]
);

-- O saldo depois do ganho: o mesmo limite do ajuste (o saldo é a soma do
-- extrato, e `saldo_de_pontos` é integer — passar dele quebraria toda leitura).
select pg_temp.trocar_no_corpo(
  'public.on_transaction_loyalty_earn()'::regprocedure,
  array[$t$  if coalesce(v_pontos, 0) <= 0 then return null; end if;$t$],
  array[$t$  if coalesce(v_pontos, 0) <= 0 then return null; end if;
  if public.saldo_de_pontos(new.client_id)::bigint + v_pontos > 2147483647 then
    raise exception 'O saldo de pontos passaria de 2.147.483.647 (o limite do registro): o cliente tem % pontos.',
      public.saldo_de_pontos(new.client_id) using errcode = 'P0001';
  end if;$t$],
  array[1]
);

notify pgrst, 'reload schema';
