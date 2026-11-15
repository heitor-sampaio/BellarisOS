-- O gatilho da Auditoria com o plano GENÉRICO (2026-11-16).
--
-- `private.auditar()` roda a cada comando em 88 tabelas. Com o plano
-- personalizado (o padrão do PL/pgSQL), a consulta grande dele, a do insert
-- com as junções e o lateral, era replanejada a cada chamada. Medido em
-- produção, numa transação desfeita:
--   insert de uma tag: 0,10 ms sem o gatilho · 1,70 ms com ele · 0,54 ms com
--   o plano genérico;
--   criar uma rede (101 linhas de auditoria): 11 ms sem · 46 ms com.
-- A completa de 14–15/11 ficou um terço mais lenta que a de 12/11 (antes da
-- Auditoria), e o banco cedeu sob ela duas vezes.
--
-- As buscas do gatilho são todas por chave com índice (tenants, branches,
-- clients pela chave primária; users.auth_id, platform_staff.auth_id e
-- clients(tenant_id, auth_id) únicos), então o plano genérico não troca
-- índice por varredura. O que o gatilho grava não muda.
--
-- Um `create or replace function private.auditar` novo apaga este ajuste:
-- `tests/auditoria-plano-generico.test.ts` trava.

alter function private.auditar() set plan_cache_mode = force_generic_plan;

notify pgrst, 'reload schema';
