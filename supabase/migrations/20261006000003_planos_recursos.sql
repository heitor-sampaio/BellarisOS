-- PLANOS com funcionalidades e limites (decisão do Heitor, 2026-10-06).
--
-- O catálogo de funcionalidades é FECHADO no código
-- (packages/nucleo/src/lib/planos/recursos.ts); o banco guarda o jsonb
-- { funcionalidades: text[], limites: { unidades, membros, whatsapp } }
-- (limite null = ilimitado).
--
-- - platform_plans.recursos: o que o plano inclui. Os planos que já existiam
--   nascem com TUDO ligado e sem limite — nada muda para ninguém.
-- - tenant_subscriptions.recursos: o RETRATO na rede (como o valor_centavos).
--   NULL = sem retrato = tudo liberado (nenhuma rede real tinha plano).
alter table public.platform_plans
  add column if not exists recursos jsonb not null default '{
    "funcionalidades": ["agenda","prontuario","documentos","estoque","portal","fidelidade","pacotes","pre_pago",
      "planos_de_tratamento","inbox","oportunidades","campanhas","templates","anuncios","automacoes","financeiro",
      "comissoes","relatorios","cargos","copilot"],
    "limites": {"unidades": null, "membros": null, "whatsapp": null}
  }'::jsonb;

alter table public.platform_plans
  drop constraint if exists platform_plans_recursos_objeto;
alter table public.platform_plans
  add constraint platform_plans_recursos_objeto check (
    jsonb_typeof(recursos) = 'object'
    and jsonb_typeof(recursos -> 'funcionalidades') = 'array'
    and jsonb_typeof(recursos -> 'limites') = 'object'
  );

alter table public.tenant_subscriptions
  add column if not exists recursos jsonb;

alter table public.tenant_subscriptions
  drop constraint if exists tenant_subscriptions_recursos_objeto;
alter table public.tenant_subscriptions
  add constraint tenant_subscriptions_recursos_objeto check (
    recursos is null or (
      jsonb_typeof(recursos) = 'object'
      and jsonb_typeof(recursos -> 'funcionalidades') = 'array'
      and jsonb_typeof(recursos -> 'limites') = 'object'
    )
  );

comment on column public.platform_plans.recursos is
  'O que o plano inclui: { funcionalidades: [...chaves do catálogo em lib/planos/recursos.ts], limites: { unidades, membros, whatsapp } } (null = ilimitado).';
comment on column public.tenant_subscriptions.recursos is
  'RETRATO dos recursos do plano na rede (copiado ao atribuir o plano; "Aplicar a versão atual do plano" copia de novo). NULL = tudo liberado.';

notify pgrst, 'reload schema';
