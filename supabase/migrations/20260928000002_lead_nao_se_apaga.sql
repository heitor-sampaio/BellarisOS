-- Oportunidade não se apaga (decisão do Heitor, 2026-09-28).
--
-- Apagar um lead levava junto o histórico dele (`lead_events` em cascata). A
-- action `deleteLead` e o botão saíram do app; aqui se fecha o banco, que é
-- alcançável pela chave pública no navegador (§4).
--
-- O que se achou ao olhar:
--  - a política FOR ALL de `leads` ("Operacional acessa leads do proprio
--    tenant") comparava `auth.jwt() ->> 'tenant_id'` — no TOPO do token, onde a
--    claim não está (ela mora em `app_metadata`, que é o que `jwt_claim` lê).
--    Nunca valeu para ninguém: a sessão só LIA lead, pela política do
--    comercial. Sai por ser morta; NÃO se cria leitura/escrita nova no lugar —
--    isso ampliaria o acesso (o escopo "só os meus" do CRM é regra do app, e a
--    sessão passaria a ler todos os leads da rede).
--  - a de `lead_events` usava `jwt_claim` e valia: qualquer membro APAGAVA e
--    reescrevia o histórico. Vira leitura e acréscimo — é append-only.
--
-- O service role (o app) continua podendo tudo; o que ele não faz mais é
-- oferecer o apagar.

-- ─── leads: sai só a política morta ───────────────────────────────────────
drop policy if exists "Operacional acessa leads do proprio tenant" on public.leads;

-- ─── lead_events: ler e acrescentar ──────────────────────────────────────
drop policy if exists lead_events_tenant on public.lead_events;

create policy lead_events_rede_select on public.lead_events
  for select using ((tenant_id)::text = jwt_claim('tenant_id'));
create policy lead_events_rede_insert on public.lead_events
  for insert with check ((tenant_id)::text = jwt_claim('tenant_id'));
