-- D7 da 29ª simulação (2026-11-25): o acesso ao prontuário registrado em dobro
-- dentro de 30 minutos.
--
-- PT-04 (catálogo do Atendimento): "A mesma pessoa relendo a mesma cliente no
-- mesmo ponto em 30 minutos é um registro só". Dois furos na
-- prontuario_registrar_acesso:
--
-- 1. O `insert … where not exists` não tinha trava: o layout e a página da
--    ficha renderizam EM PARALELO (CLAUDE.md §6), as duas chamadas liam "não
--    existe" ao mesmo tempo e as duas gravavam. Agora a função trava por pessoa
--    e cliente (`pg_advisory_xact_lock`, solta no fim da transação): a segunda
--    espera a primeira gravar e, em READ COMMITTED (cada comando do plpgsql com
--    a sua foto), já a vê.
-- 2. A conta comparava também a `referencia` (o plano, o agendamento), que a
--    regra não cita: a referência continua gravada, mas não entra na conta
--    (decisão do Claude, 25/11 — a do relatório da 29ª).
--
-- Troca de trechos no corpo VIVO (o molde de 20261130100007), com a
-- conferência da contagem; a função vira plpgsql para a trava vir antes do
-- insert. A assinatura, o retorno e os grants não mudam (create or replace).

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
  'public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid, uuid)'::regprocedure,
  array[
    $t$ LANGUAGE sql
$t$,
    $t$AS $function$
  insert into public.prontuario_acessos$t$,
    $t$          and a.referencia is not distinct from p_referencia
$t$,
    $t$interval '30 minutes')
$function$$t$
  ],
  array[
    $t$ LANGUAGE plpgsql
$t$,
    $t$AS $function$
begin
  -- Uma de cada vez por pessoa e cliente: as renderizações em paralelo entram uma vez só.
  perform pg_advisory_xact_lock(hashtext(coalesce(p_usuario::text, '-')), hashtext(p_cliente::text));
  insert into public.prontuario_acessos$t$,
    '',
    $t$interval '30 minutes');
end
$function$$t$
  ],
  array[1, 1, 1, 1]
);

-- Só o servidor (reafirmado; o create or replace não mexe nos grants).
revoke execute on function public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
