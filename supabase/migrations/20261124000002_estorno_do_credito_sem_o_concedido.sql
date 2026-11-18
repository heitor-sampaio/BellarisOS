-- Auditoria das regras (2026-11-18), agente C — item 6.
--
-- O estorno da venda de crédito interno devolve só o crédito VENDIDO que
-- sobrou, nunca o CONCEDIDO (decisão do Claude pelos princípios, 2026-11-18,
-- sobre a fala do Heitor no bônus: "não vamos fazer as clinicas perderem
-- dinheiro"). Até aqui `credito_estornar_venda` devolvia o SALDO da cliente
-- até o pago: com R$ 300 vendidos, R$ 119 usados e R$ 100 concedidos pelo
-- "Conceder crédito", voltavam R$ 281 em dinheiro — R$ 100 de presente viravam
-- dinheiro. Agora o crédito concedido que não é desta venda (o "Conceder
-- crédito", o bônus de OUTRA venda) sai da conta antes: ele é o último a ser
-- gasto, fica com a cliente como crédito e não volta em dinheiro. O bônus desta
-- venda segue a escolha de sempre (inteiro ou na proporção). A prévia diz
-- quanto concedido fica (`concedido_fica`), e a janela o mostra.
--
-- A função é a viva (a de 20261111005901): trocam-se só os trechos, e a
-- migration falha se algum não for encontrado.

do $migracao$
declare
  v_def   text := pg_get_functiondef('public.credito_estornar_venda(uuid, uuid, uuid, text, text, numeric, boolean, text, jsonb, text)'::regprocedure);
  v_troca text[][] := array[
    array[
$a$  v_pro_bonus   numeric;
begin$a$,
$b$  v_pro_bonus   numeric;
  v_concedido   numeric := 0;
begin$b$],
    array[
$a$  v_saldo_pos := greatest(v_saldo, 0);$a$,
$b$  v_saldo_pos := greatest(v_saldo, 0);
  -- O concedido de fora desta venda (o "Conceder crédito", o bônus de outra
  -- venda) não volta em dinheiro: é o último a ser gasto, e fica com a cliente.
  select coalesce(sum(c.amount), 0) into v_concedido from public.internal_credits c
   where c.client_id = v_venda.client_id and c.concedido and c.credito_vendido_id is distinct from p_venda;
  v_concedido := least(greatest(v_concedido, 0), v_saldo_pos);
  v_saldo_pos := v_saldo_pos - v_concedido;$b$],
    array[
$a$    'vendido', v_venda.valor, 'pago', v_tx.amount, 'saldo', v_saldo,$a$,
$b$    'vendido', v_venda.valor, 'pago', v_tx.amount, 'saldo', v_saldo, 'concedido_fica', v_concedido,$b$]
  ];
  i int;
begin
  for i in 1 .. array_length(v_troca, 1) loop
    if position(v_troca[i][1] in v_def) = 0 then
      raise exception 'credito_estornar_venda: o trecho % não está na função viva.', i;
    end if;
    v_def := replace(v_def, v_troca[i][1], v_troca[i][2]);
  end loop;
  execute v_def;
end $migracao$;

notify pgrst, 'reload schema';
