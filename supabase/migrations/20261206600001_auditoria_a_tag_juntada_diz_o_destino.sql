-- A4 da 30ª simulação (crm-inbox:TG-08, "Não existe apagar tag"; plataforma:AD-13,
-- princípio 3). Renomear a tag para o nome de outra que já existe JUNTA as duas
-- (`renomear_tag`): a de origem sai do banco, e as fichas, os contatos e as
-- conversas passam a ter a de destino. A Auditoria só tinha o apagar da origem
-- ("Juntou a tag Noiva à que já existia com o mesmo nome") e não dizia em QUAL.
--
-- O gatilho (`private.auditar`) guarda no apagar só as colunas da linha que saiu.
-- O destino vai por um ajuste local da transação, que `renomear_tag` liga só em
-- volta do `delete` da junção e desliga logo depois; o gatilho o lê só no apagar
-- de `tags`, e o grava em `depois` ({"juntada_em": "<nome da de destino>"}). O
-- resto da Auditoria não muda: em todo outro apagar o `depois` segue vazio.
-- `lib/auditoria/frase.ts` diz "Juntou a tag Noiva em Noivas"; a gravação de
-- antes (sem o destino) segue com a frase de então (a auditoria é imutável).
--
-- Troca de trecho nos corpos VIVOS, com a conferência da contagem (o padrão de
-- 20261130100007). O SET plan_cache_mode do corpo vivo de private.auditar()
-- segue (pg_get_functiondef o traz), e o alter do fim o reafirma
-- (tests/auditoria-plano-generico.test.ts).

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

-- O gatilho: no apagar de tags, o destino da junção vai em `depois`.
select pg_temp.trocar_no_corpo(
  'private.auditar()'::regprocedure,
  array[$t$                when tg_op = 'INSERT' then private.auditoria_recorte(z.n, v_rotulo || v_valores, false)$t$],
  array[$t$                when tg_op = 'DELETE' and v_tab = 'tags' and coalesce(current_setting('bellaris.tag_juntada_em', true), '') <> ''
                  then jsonb_build_object('juntada_em', current_setting('bellaris.tag_juntada_em', true))
                when tg_op = 'INSERT' then private.auditoria_recorte(z.n, v_rotulo || v_valores, false)$t$],
  array[1]
);

alter function private.auditar() set plan_cache_mode = force_generic_plan;

-- A junção: o destino só em volta do apagar da tag de origem.
select pg_temp.trocar_no_corpo(
  'public.renomear_tag(uuid, uuid, text)'::regprocedure,
  array[$t$    delete from public.tags where id = p_tag;$t$],
  array[$t$    perform set_config('bellaris.tag_juntada_em', v_final, true);
    delete from public.tags where id = p_tag;
    perform set_config('bellaris.tag_juntada_em', '', true);$t$],
  array[1]
);

-- renomear_tag segue só do servidor (o create or replace mantém os grants; reafirmado).
revoke execute on function public.renomear_tag(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.renomear_tag(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
