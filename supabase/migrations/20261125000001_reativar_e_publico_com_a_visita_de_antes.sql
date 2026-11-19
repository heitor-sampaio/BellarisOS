-- D7 da 25ª simulação: a migração entra no "sem retorno".
--
-- A regra (decisão 1 (c) do Heitor sobre a 8ª simulação, "concordo";
-- docs/regras/crm-inbox.md, "A migração"): a "Última visita" da planilha é a
-- última visita no sistema de ANTES e entra no "Reativar clientes" (sumida =
-- sem visita, nem a de antes, nos 90 dias) e no público "sem retorno" das
-- campanhas.
--
-- O defeito: o "é cliente antes do corte" das duas listas lia só
-- coalesce(cliente_desde, created_at). A ficha importada com a Última visita
-- e SEM o "Cliente desde" ficava com o cadastro de hoje e saía das duas — a
-- campanha "sem visita há N dias" e o Reativar ("Ninguém sumiu") não a viam.
--
-- Agora (decisão do Claude pelo princípio 3): quem tem a visita de antes é
-- cliente pelo menos desde ela — least(coalesce(cliente_desde, created_at),
-- ultima_visita_antes); o LEAST ignora o nulo. Os "Novos clientes" e o selo
-- "Novo" NÃO mudam (a pergunta do A29 ao Heitor).

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

-- O público das campanhas e dos fluxos de agenda (20261124200006).
select pg_temp.trocar_no_corpo(
  'public.clientes_do_publico(uuid,jsonb)'::regprocedure,
  array[$t$or coalesce(c.cliente_desde::timestamp at time zone f.fuso, c.created_at) < f.cliente_desde_antes)$t$],
  array[$t$or least(coalesce(c.cliente_desde::timestamp at time zone f.fuso, c.created_at), c.ultima_visita_antes::timestamp at time zone f.fuso) < f.cliente_desde_antes)$t$],
  array[1]);

-- O "Reativar clientes" (sempre o da rede — 20261123600001).
select pg_temp.trocar_no_corpo(
  'public.metrics_clientes_para_reativar_rede(uuid,timestamp with time zone,integer,uuid)'::regprocedure,
  array[$t$coalesce(c.cliente_desde::timestamp at time zone (select f from fuso), c.created_at) as created_at$t$],
  array[$t$least(coalesce(c.cliente_desde::timestamp at time zone (select f from fuso), c.created_at), c.ultima_visita_antes::timestamp at time zone (select f from fuso)) as created_at$t$],
  array[1]);

-- O create or replace mantém dono e grants (service_role só, como antes).

notify pgrst, 'reload schema';
