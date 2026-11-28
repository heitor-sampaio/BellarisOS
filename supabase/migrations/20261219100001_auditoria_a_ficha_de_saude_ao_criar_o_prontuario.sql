-- D7 da 40ª simulação (AD-22 do catálogo de plataforma; decisão do Claude,
-- 27/11): a ficha de saúde que a equipe preenche na sessão, sem pendente a
-- fechar, grava o prontuário por um upsert (`gravarAnamneseGeral`). Com o
-- prontuário novo, é um INSERT — e o INSERT não dizia coluna nenhuma: a
-- Auditoria lia "Criou o prontuário", igual ao prontuário aberto vazio.
--
-- O gatilho passa a dizer, no INSERT de medical_records, que a ficha de saúde
-- veio junto: só o NOME da coluna (`general_anamnesis`), nunca o conteúdo — a
-- tabela segue no modo 'clinico' (antes e depois vazios). A frase lê "Preencheu
-- a ficha de saúde de X" (pela cliente, pelo link: "Respondeu a ficha de
-- saúde"). A gravação de antes não tem a coluna e segue "Criou o prontuário"
-- (a auditoria não se altera).
--
-- Troca de trecho no corpo VIVO de private.auditar(), com a conferência da
-- contagem (o padrão de 20261130100007); o SET plan_cache_mode do corpo vivo
-- segue, e o alter do fim o reafirma (tests/auditoria-plano-generico.test.ts).

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
  'private.auditar()'::regprocedure,
  array[$t$               else '{}'::text[] end as cols$t$],
  array[$t$               when tg_op = 'INSERT' and v_tab = 'medical_records'
                    and coalesce(jsonb_typeof(y.n -> 'general_anamnesis'), 'null') <> 'null'
                 then array['general_anamnesis']::text[]
               else '{}'::text[] end as cols$t$],
  array[1]
);

alter function private.auditar() set plan_cache_mode = force_generic_plan;

notify pgrst, 'reload schema';
