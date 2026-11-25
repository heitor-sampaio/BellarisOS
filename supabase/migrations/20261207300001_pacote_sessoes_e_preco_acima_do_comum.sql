-- As sessões e o preço do pacote deixam de recusar acima do teto de antes.
--
-- O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."
--
-- O banco guardava os tetos da tela: cada procedimento do pacote de 1 a 100
-- sessões (`service_package_items_quantity_check`, 20260930000020) e o pacote
-- trazido de fora de 1 a 100 sessões (`pacote_trazer`, 20261106003501). Acima
-- de 100 (o "comum"), agora, a tela avisa e o servidor grava
-- (apps/web/lib/pacotes/tamanho-e-valor.ts).
--
-- Fica o impossível (decisão do Claude, 25/11):
-- - as sessões: cada uma vira UMA LINHA em `package_sessions` — até 32.767, o
--   mesmo limite do crediário. `pacote_salvar` passa a conferir o total (não
--   tinha teto nenhum); o CHECK de cada procedimento vai ao mesmo número;
-- - o preço e o valor de referência: gravam em `service_packages.price`
--   (numeric(10,2); o pacote de fora grava ali o valor de referência) — até
--   99.999.999,99. Acima, o Postgres dizia "numeric field overflow"; agora a
--   recusa é em português.
--
-- Troca de trecho nos corpos VIVOS, com a conferência da contagem (o padrão de
-- 20261207100001). A última definição de `pacote_salvar` é 20261115300001; a
-- de `pacote_trazer`, 20261106003501 (o texto da equipe trocado em
-- 20261116200001, fora dos trechos daqui). O create or replace mantém os
-- grants (só o servidor).

alter table public.service_package_items
  drop constraint if exists service_package_items_quantity_check,
  add constraint service_package_items_quantity_check check (quantity between 1 and 32767);

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
  'public.pacote_salvar(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb, uuid[])'::regprocedure,
  array[$t$  if v_total < 2 then$t$],
  array[$t$  if v_total > 32767 then
    raise exception 'No máximo 32.767 sessões num pacote (o limite do registro).' using errcode = 'P0001';
  end if;
  if p_preco > 99999999.99 then
    raise exception 'No máximo 99.999.999,99 reais (o limite do registro).' using errcode = 'P0001';
  end if;
  if v_total < 2 then$t$],
  array[1]
);

select pg_temp.trocar_no_corpo(
  'public.pacote_trazer(uuid, uuid, uuid, uuid, integer, integer, timestamptz, numeric, uuid)'::regprocedure,
  array[
    $t$p_total < 1 or p_total > 100 then$t$,
    $t$'O pacote de antes tem de 1 a 100 sessões.'$t$,
    $t$  if v_valor is not null and v_valor < 0 then$t$
  ],
  array[
    $t$p_total < 1 or p_total > 32767 then$t$,
    $t$'O pacote de antes tem de 1 a 32.767 sessões (o limite do registro).'$t$,
    $t$  if v_valor is not null and v_valor > 99999999.99 then
    raise exception 'No máximo 99.999.999,99 reais (o limite do registro).' using errcode = 'P0001';
  end if;
  if v_valor is not null and v_valor < 0 then$t$
  ],
  array[1, 1, 1]
);

notify pgrst, 'reload schema';
