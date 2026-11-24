-- D11 da 26ª simulação: a liberação do cancelamento com o dinheiro do fim.
--
-- O pacote cancelado (e o plano) acertava a comissão ANTES de o dinheiro
-- mexer (o passo 4, "o dinheiro ainda não mexeu"): com o valor novo do pacote
-- e o pagamento de antes ainda vivo, a linha contava como quitada pelo cartão
-- que o mesmo cancelamento ia estornar — "Liberação — Cancelamento do pacote"
-- de R$ 71,63 (15% de R$ 500,00 − 4,5% da Cielo). Depois, a cada mexida do
-- dinheiro, o gatilho do pagamento acertava de novo: o estorno tirava os
-- R$ 71,63 e o "usado" no Pix liberava R$ 75,00. O extrato, que diz a base de
-- HOJE (comissoes.md, "Cada lançamento com a base DA HORA DELE" vale para o
-- cancelamento pelo fator, e a base é a do detalhe), mostrava "base R$ 500,00
-- · 15% · taxa 0,00" ao lado de R$ 71,63: o valor e o detalhe contavam contas
-- diferentes (princípio 3).
--
-- A regra do cancelamento é a comissão "com o dinheiro do fim" (o passo 7, já
-- idempotente). Decisão do Claude, 26ª: o cancelamento acerta UMA vez, no fim.
-- - O passo 4 sai das duas funções; no lugar, a marca de transação
--   `bellaris.comissao_adiada` = a venda que está sendo cancelada.
-- - O gatilho do pagamento (`private.comissoes_do_pagamento`) não acerta a
--   venda marcada: o acerto é o do passo 7.
-- - Depois do dinheiro, a marca se apaga, e o passo 7 acerta as mesmas linhas
--   que o gatilho acertaria (todas as da venda — no plano, também as que não
--   são da origem PLANO), ligado ao lançamento que o cancelamento gravou agora
--   (o "usado"), para o `comissao.liberada` seguir saindo como saía.
-- Os lançamentos que já existem não mudam (o passado não se reescreve).
--
-- Partes do corpo VIVO (o padrão `pg_temp.trocar_no_corpo`), com a contagem.
-- O `plano_cancelar_devolvendo` também muda na 20261125400001 (só a mensagem
-- da recusa da proposta): os trechos daqui não se cruzam com o dela.

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

-- ─── O pacote ──────────────────────────────────────────────────────────────
select pg_temp.trocar_no_corpo(
  'public.pacote_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[
$t$  -- 4. A comissão, já pelo novo valor do pacote (o dinheiro ainda não mexeu).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.client_package_id = p_pacote and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do pacote', null);
  end loop;
$t$,
$t$  -- 7. A comissão de novo, agora com o dinheiro do fim (idempotente).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.client_package_id = p_pacote and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do pacote', null);
  end loop;
$t$],
  array[
$t$  -- 4. A comissão espera o dinheiro do fim (D11 da 26ª): o gatilho do
  -- pagamento não acerta este pacote enquanto o dinheiro mexe — o passo 7
  -- acerta uma vez, com o que ficou.
  perform set_config('bellaris.comissao_adiada', p_pacote::text, true);
$t$,
$t$  perform set_config('bellaris.comissao_adiada', '', true);

  -- 7. A comissão, uma vez, com o dinheiro do fim (D11 da 26ª): as linhas que
  -- o gatilho acertaria, ligadas ao lançamento que o cancelamento gravou agora.
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.client_package_id = p_pacote
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do pacote',
      (select t.id from public.financial_transactions t
        where t.client_package_id = p_pacote and t.type::text = 'INCOME' and t.estorno_de is null
          and t.is_paid and t.created_at = now()
        order by t.amount desc, t.id limit 1));
  end loop;
$t$],
  array[1, 1]);

-- ─── O plano ───────────────────────────────────────────────────────────────
select pg_temp.trocar_no_corpo(
  'public.plano_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[
$t$  -- 4. A comissão, já pelo novo valor do plano (o dinheiro ainda não mexeu).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.treatment_plan_id = p_plano and cl.origem = 'PLANO' and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do plano', null);
  end loop;
$t$,
$t$  -- 7. A comissão de novo, agora com o dinheiro do fim (idempotente).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.treatment_plan_id = p_plano and cl.origem = 'PLANO' and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do plano', null);
  end loop;
$t$],
  array[
$t$  -- 4. A comissão espera o dinheiro do fim (D11 da 26ª): o gatilho do
  -- pagamento não acerta este plano enquanto o dinheiro mexe — o passo 7
  -- acerta uma vez, com o que ficou.
  perform set_config('bellaris.comissao_adiada', p_plano::text, true);
$t$,
$t$  perform set_config('bellaris.comissao_adiada', '', true);

  -- 7. A comissão, uma vez, com o dinheiro do fim (D11 da 26ª): as linhas que
  -- o gatilho acertaria (todas as do plano), ligadas ao lançamento que o
  -- cancelamento gravou agora.
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.treatment_plan_id = p_plano
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do plano',
      (select t.id from public.financial_transactions t
        where t.treatment_plan_id = p_plano and t.type::text = 'INCOME' and t.estorno_de is null
          and t.is_paid and t.created_at = now()
        order by t.amount desc, t.id limit 1));
  end loop;
$t$],
  array[1, 1]);

-- ─── O gatilho do pagamento ────────────────────────────────────────────────
select pg_temp.trocar_no_corpo(
  'private.comissoes_do_pagamento()'::regprocedure,
  array[
$t$begin
  if new.appointment_id is null and new.treatment_plan_id is null and new.client_package_id is null$t$],
  array[
$t$begin
  -- D11 da 26ª: o pacote ou o plano que está sendo cancelado acerta a
  -- comissão uma vez, no fim do cancelamento (o passo 7 dele).
  if coalesce(current_setting('bellaris.comissao_adiada', true), '') <> ''
     and current_setting('bellaris.comissao_adiada', true)
         in (coalesce(new.client_package_id::text, '-'), coalesce(new.treatment_plan_id::text, '-')) then
    return new;
  end if;
  if new.appointment_id is null and new.treatment_plan_id is null and new.client_package_id is null$t$],
  array[1]);

notify pgrst, 'reload schema';
