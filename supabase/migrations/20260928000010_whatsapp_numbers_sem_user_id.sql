-- whatsapp_numbers.user_id sai.
--
-- Era "a pessoa que fala por este número", do tempo em que cada número tinha
-- uma pessoa só. Em 2026-09-27 ("um número, várias pessoas") isso passou para
-- whatsapp_number_users, com definir_vinculos_do_numero como única escrita, e a
-- coluna ficou para trás de propósito — não apagar dado no mesmo passo em que a
-- estrutura mudava.
--
-- Conferido antes de tirar (2026-09-28): zero linhas preenchidas; nenhum código,
-- função, view ou política a lê; os testes usam whatsapp_number_users. A garantia
-- "no máximo um número por pessoa" mora em whatsapp_number_users (unique user_id).
--
-- O índice uniq_whatsapp_numbers_usuario e a FK saem junto com a coluna.

alter table public.whatsapp_numbers drop column if exists user_id;

notify pgrst, 'reload schema';
