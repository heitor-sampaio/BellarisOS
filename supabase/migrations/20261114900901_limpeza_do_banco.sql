-- Limpeza do banco (o Heitor, 2026-11-13: mudança destrutiva "aplica e anota").
-- 1. O schema de cópia feito antes de zerar o banco de teste (13/11): 141
--    tabelas, ninguém lê.
-- 2. users.sem_comissao_de_proposito: o "sem comissão, de propósito" saiu em
--    13/11 (docs/regras/comissoes.md) e a coluna ficou sem uso.
drop schema if exists backup_wipe_20261113 cascade;
alter table public.users drop column if exists sem_comissao_de_proposito;
notify pgrst, 'reload schema';
