-- A base da comissão com pontos é de `commission_configs.base_com_pontos`
-- (Configurações → Comissões) desde 2026-09-30. Com o commit que tirou a
-- leitura desta coluna no ar (29dde9a), ela sai.

alter table public.loyalty_configs drop column if exists commission_base;

notify pgrst, 'reload schema';
