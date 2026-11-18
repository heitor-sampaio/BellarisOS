-- ATD-P07 (varredura de conformidade de 18/11): a aplicação de injetáveis se
-- CONFIRMA e se REGISTRA só no atendimento (D14 da simulação de 2026-10-28,
-- decisão do Heitor; docs/regras/atendimento.md). A action
-- (`registrarAplicacao`) aceitava o atendimento nulo, e a função do registro
-- inseria a aplicação sem atendimento ("Sem atendimento, insere como antes").
--
-- Aqui a função recusa o atendimento nulo. A action recusa antes, com a frase
-- da tela; esta é a segunda linha. As aplicações sem atendimento que já
-- existem ficam (o passado não muda).
--
-- Troca de texto sobre o corpo VIVO (migration 20261107004201): o trecho tem
-- de aparecer o número de vezes esperado, ou a migration para. O replace
-- mantém os grants (só o servidor).

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

select pg_temp.trocar_no_corpo(
  'public.injetavel_registrar_aplicacao(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,boolean)'::regprocedure,
  array[$t$  if p_agendamento is not null then$t$],
  array[$t$  if p_agendamento is null then
    raise exception 'A aplicação se registra no atendimento.' using errcode = '22023';
  end if;

  if p_agendamento is not null then$t$],
  array[1]);

notify pgrst, 'reload schema';
