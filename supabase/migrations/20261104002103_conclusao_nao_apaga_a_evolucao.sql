-- D8 da 6ª simulação (2026-11-04; princípio 3): a conclusão nunca troca a
-- evolução (e a intercorrência) GRAVADA por vazio.
--
-- Depois de "Gerar plano e enviar à recepção" — que grava a evolução da
-- avaliação no prontuário —, a tela trocava de formulário e o "Finalizar"
-- levava a evolução VAZIA; `concluir_atendimento` fazia `notes =
-- excluded.notes` no conflito, e a evolução gravada virava nula. A tela agora
-- tem um estado só (components/branch/appointment-session.tsx); o banco também
-- se defende: no conflito, o vazio não apaga o que já estava escrito.
--
-- O corpo é o da PRODUÇÃO (pg_get_functiondef), com a troca conferida — a
-- função passou por várias frentes (atend-04, D1, D3…), e nenhuma migration
-- antiga tem o corpo de hoje. O trecho tem de aparecer uma vez, ou a migration
-- para sem mudar nada.
do $migracao$
declare
  v_oid oid;
  v_def text;
  v_antes text := $q$        notes             = excluded.notes,
        intercurrences    = excluded.intercurrences,$q$;
  v_depois text := $q$        -- D8: o vazio da conclusão não apaga a evolução gravada (pelo plano, pelo "Salvar").
        notes             = coalesce(nullif(btrim(excluded.notes), ''), medical_record_entries.notes),
        intercurrences    = coalesce(nullif(btrim(excluded.intercurrences), ''), medical_record_entries.intercurrences),$q$;
  v_vezes int;
begin
  select p.oid into strict v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'concluir_atendimento';
  v_def := pg_get_functiondef(v_oid);
  v_vezes := (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes);
  if v_vezes <> 1 then
    raise exception 'concluir_atendimento: o trecho da evolução apareceu % vez(es), esperado 1', v_vezes;
  end if;
  execute replace(v_def, v_antes, v_depois);
end
$migracao$;

notify pgrst, 'reload schema';
