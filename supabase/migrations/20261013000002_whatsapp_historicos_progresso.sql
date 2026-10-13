-- O andamento da importação do histórico, para Configurações → Ações em lote
-- (2026-10-13).
--
-- - `etapa`: 'aguardando_whatsapp' (o pareamento ainda manda o histórico) ou
--   'importando' — o status sozinho não dizia por que demorava.
-- - `total_conversas`: quantas a uazapi diz ter (quando diz) — "12 de 80".
-- - `atualizada_em`: o sinal de vida. A passagem roda em `after()`, e um
--   deploy no meio a mata sem aviso: sem sinal há 15 min, a linha vira
--   "interrompida" (falhou) e libera a caixa — o índice de uma em aberto por
--   caixa travaria a próxima para sempre.

alter table public.whatsapp_historicos
  add column if not exists etapa           text check (etapa in ('aguardando_whatsapp', 'importando')),
  add column if not exists total_conversas integer,
  add column if not exists atualizada_em   timestamptz not null default now();

notify pgrst, 'reload schema';
