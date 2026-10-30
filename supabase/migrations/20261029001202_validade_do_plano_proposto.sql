-- O plano PROPOSTO aparece no app com a validade (D-18, decisão do Heitor,
-- 2026-10-30). Não havia validade de proposta em lugar nenhum: é da REDE,
-- em dias a partir de quando o plano foi proposto (Configurações → Geral),
-- 30 por padrão. É informação para a cliente: o checkout na clínica não
-- recusa o plano vencido.

alter table public.tenants
  add column if not exists plano_validade_dias integer not null default 30;

alter table public.tenants
  drop constraint if exists tenants_plano_validade_dias_faixa;
alter table public.tenants
  add constraint tenants_plano_validade_dias_faixa check (plano_validade_dias between 1 and 365);

comment on column public.tenants.plano_validade_dias is
  'Por quantos dias o plano PROPOSTO vale, a partir de quando foi proposto (o app da cliente mostra "Válido até").';

notify pgrst, 'reload schema';
