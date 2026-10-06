-- A verificação em duas etapas da plataforma vira OPÇÃO do admin do sistema
-- (decisão do Heitor, 2026-10-06): nasce DESLIGADA. Desligada, quem é da
-- plataforma e não tem autenticador entra só com a senha; quem cadastrou um
-- continua sendo pedido o código. A regra mora em
-- packages/nucleo/src/lib/plataforma/verificacao-exigida.ts.
alter table public.platform_settings
  add column if not exists exigir_verificacao boolean not null default false;

comment on column public.platform_settings.exigir_verificacao is
  'Exige a verificação em duas etapas (TOTP, aal2) de toda a equipe da plataforma. Desligada, só de quem tem autenticador cadastrado.';

notify pgrst, 'reload schema';
