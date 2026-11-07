-- F45 (a lentidão do banco, 2026-11-07): tira da publicação do Realtime as
-- tabelas que NENHUMA tela assina.
--
-- O Realtime lê o WAL pela `realtime.list_changes` e, para cada linha mudada
-- de uma tabela publicada, roda `realtime.apply_rls`. Era 61% de todo o tempo
-- do banco desde 04/11 (401 mil chamadas, ~5.840 s; a mais lenta, 12,7 s), e
-- as quedas das completas de 06–07/11 vieram junto de erros dele
-- ("PoolingReplicationError", o slot recriado). Tabela publicada sem
-- assinante é trabalho sem leitor.
--
-- Conferido no código (apps/web, apps/sistema, apps/suporte, packages/nucleo;
-- o app Android é o mesmo portal web): `RealtimeRefresher tables=[…]` e
-- `.on('postgres_changes', { table })`. Ninguém assina:
--   crm_stages          — o quadro assina o SINAL `crm_quadro_sinais`, que o
--                         gatilho das etapas já marca (CLAUDE.md §4);
--   cash_registers      — sem tela que a escute (e sem escrita desde 04/11);
--   treatment_plan_items — idem.
-- Não apaga dado: só deixa de mandar a mudança ao Realtime.

alter publication supabase_realtime drop table public.crm_stages;
alter publication supabase_realtime drop table public.cash_registers;
alter publication supabase_realtime drop table public.treatment_plan_items;
