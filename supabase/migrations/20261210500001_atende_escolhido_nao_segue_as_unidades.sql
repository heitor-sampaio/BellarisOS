-- D9 da 32ª simulação (2026-11-26): acrescentar Cascavel às "Unidades" da
-- Ivanete, que atendia só em Passo Fundo, a punha para atender em Cascavel
-- sozinha — e desmarcar antes de salvar não adiantava.
--
-- A regra é a do Heitor (8ª simulação: "o atende vira um checklist com todas
-- as unidades, as que estiverem marcadas ficam disponiveis"): a pessoa atende
-- onde está MARCADO. A tela da Equipe já manda a lista escolhida
-- (`atende_em`), mas o gatilho `private.atende_em_sincronizar` tem um ramo para
-- quem grava só as unidades (`branch_id`/`outras_unidades`) sem mexer no
-- `atende_em`: se a lista de antes era "as unidades dela", ele a estende para
-- as unidades novas. Quando a Equipe manda a MESMA lista de antes (a Ivanete
-- com [Passo Fundo]), o `atende_em` não muda, e o ramo a trocava por [Passo
-- Fundo, Cascavel].
--
-- A Equipe passa a mandar o cabeçalho `x-bellaris-atende-escolhido: 1` quando
-- a lista vem do formulário (actions/team.ts), e o ramo não vale nesse caso: a
-- lista escolhida é a que fica. Sem o cabeçalho (os outros caminhos que só
-- mudam as unidades), segue como era. Decisão do Claude, 26/11.
--
-- Troca de trecho no corpo VIVO, com a conferência da contagem (o padrão de
-- 20261130100007).

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
  'private.atende_em_sincronizar()'::regprocedure,
  array[$t$elsif (new.branch_id is distinct from old.branch_id or new.outras_unidades is distinct from old.outras_unidades)
          and new.provides_services then$t$],
  array[$t$elsif (new.branch_id is distinct from old.branch_id or new.outras_unidades is distinct from old.outras_unidades)
          and new.provides_services
          and coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-bellaris-atende-escolhido', '') <> '1' then$t$],
  array[1]
);

notify pgrst, 'reload schema';
