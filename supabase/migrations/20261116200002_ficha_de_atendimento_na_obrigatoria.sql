-- FC1 fora das Configurações (Bloco Vocabulário, as telas): a ficha dos
-- procedimentos se chama "ficha de atendimento" em todo texto que se lê. A
-- trava do servidor (`private.obrigatoria_que_falta`, que o
-- `concluir_atendimento` e o plano da avaliação chamam) ainda dizia "na ficha
-- do procedimento." — a mesma frase de `lib/atendimento/obrigatorias.ts`, que
-- já mudou. Só o texto muda.
--
-- Como na 20261116200001: a função é reescrita a partir da definição ATUAL
-- (`pg_get_functiondef`), com a troca exata; frase não achada aborta.

do $migra$
declare
  v_fn    record;
  v_def   text;
  v_achou boolean := false;
  v_velho constant text := $a$na ficha do procedimento.$a$;
  v_novo  constant text := $a$na ficha de atendimento.$a$;
begin
  for v_fn in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'obrigatoria_que_falta'
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    if position(v_velho in v_def) > 0 then
      execute replace(v_def, v_velho, v_novo);
      v_achou := true;
    end if;
  end loop;
  if not v_achou then
    raise exception 'vocabulário: "%" não está em private.obrigatoria_que_falta', v_velho;
  end if;
end
$migra$;

notify pgrst, 'reload schema';
