-- A linha da ficha na Auditoria é da REDE (auditoria das regras, 18/11).
--
-- O Heitor: "o cliente não é da unidade, o cliente é da rede" (H16); "Nada se
-- prende a clients.branch_id" (CLAUDE.md §5). O gatilho tirava a unidade da
-- linha de `clients` de `clients.branch_id` — onde a ficha NASCEU —, e a tela
-- mostrava a ficha como da unidade de cadastro (e o filtro de unidade a
-- escondia nas outras). Agora a linha de `clients` não leva unidade ("Da
-- rede"), nem a tabela-filha cuja unidade viria da ficha. O filtro de unidade
-- da leitura (`lib/auditoria/leitura.ts`, `gravacoesDaUnidade`) não a esconde.
--
-- O corpo parte da definição VIVA (pg_get_functiondef) e só troca o trecho
-- abaixo — como em 20261116300001. O plano genérico (20261116300002) fica.
-- Sem backfill: a auditoria não se altera (e o banco é zerado antes do lançamento).

do $$
declare
  d text := pg_get_functiondef('private.auditar()'::regprocedure);
  velho text := $t$nullif(case v_tab when 'branches' then y.r ->> 'id' else coalesce(y.r ->> 'branch_id', v_pais -> (y.r ->> v_pai_col) ->> 'branch_id') end, '')::uuid as b,$t$;
  novo text := $t$nullif(case v_tab when 'branches' then y.r ->> 'id' when 'clients' then null else coalesce(y.r ->> 'branch_id', case when v_pai_tab = 'clients' then null else v_pais -> (y.r ->> v_pai_col) ->> 'branch_id' end) end, '')::uuid as b,$t$;
begin
  if position(novo in d) > 0 then
    raise exception 'private.auditar já tem a ficha da rede: nada a fazer (ou a migration rodou duas vezes)';
  end if;
  if position(velho in d) = 0 then
    raise exception 'private.auditar mudou: o trecho da unidade não está onde se esperava';
  end if;
  execute replace(d, velho, novo);
end $$;

alter function private.auditar() set plan_cache_mode = force_generic_plan;

notify pgrst, 'reload schema';
