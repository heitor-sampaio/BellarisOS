-- Credencial não chega ao navegador de ninguém.
--
-- As três tabelas tinham uma política FOR ALL que só conferia a REDE:
--  - `integration_configs` — token da Meta, do Google Ads, segredo do app;
--  - `whatsapp_numbers`   — o token de cada número (uazapi e oficial);
--  - `whatsapp_number_users` — quem fala por cada número.
-- Qualquer membro logado (uma recepcionista, um SDR) lia os tokens e mexia nos
-- vínculos falando direto com o PostgREST pela chave pública, que está no
-- navegador (§4). Provado antes desta migration em
-- `e2e/credenciais-fora-da-sessao.spec.ts`: um SDR com `crm: VIEW` leu o token
-- da Meta.
--
-- Nada no app lê essas tabelas pela sessão: todas as leituras e escritas usam o
-- cliente de serviço, nenhuma está na publicação do realtime, e nenhuma função
-- SECURITY INVOKER as toca (conferido em 2026-09-28). Então a sessão perde o
-- acesso inteiro: RLS ligada e NENHUMA política — o Postgres nega tudo a `anon`
-- e `authenticated`, e o service role, que ignora RLS, segue igual.
--
-- ⚠️ Tela nova que precise de algo daqui pelo navegador (um realtime, por
-- exemplo) NÃO reabre a tabela: expõe só o que precisa, sem credencial, numa
-- view ou numa função que devolva as colunas certas.

drop policy if exists tenant_isolation on public.integration_configs;
drop policy if exists "Rede gerencia os números de WhatsApp" on public.whatsapp_numbers;
drop policy if exists "Rede gerencia quem fala por cada número" on public.whatsapp_number_users;

alter table public.integration_configs   enable row level security;
alter table public.whatsapp_numbers      enable row level security;
alter table public.whatsapp_number_users enable row level security;

comment on table public.integration_configs is
  'Credenciais das integrações da rede. Sem política de RLS de propósito: só o servidor (service role) lê.';
comment on table public.whatsapp_numbers is
  'Os números de WhatsApp da rede, com o token de cada um. Sem política de RLS de propósito: só o servidor lê.';
