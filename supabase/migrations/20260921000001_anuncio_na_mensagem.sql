-- Atribuição de anúncio na MENSAGEM (click-to-WhatsApp).
--
-- Já existia `conversations.attribution`, mas ela é preenchida uma vez, na
-- criação da conversa. Quem já é conhecido e volta meses depois clicando em
-- outro anúncio não deixava rastro nenhum: a conversa continuava com a
-- atribuição da primeira vez, e a equipe não tinha como saber que aquele "oi"
-- veio de uma campanha nova.
--
-- A procedência é da MENSAGEM. Guardada aqui, ela responde "esta conversa
-- começou num anúncio?" e também "de qual anúncio veio cada retorno?".

alter table public.messages
  add column if not exists ad_referral jsonb;

comment on column public.messages.ad_referral is
  'Anúncio de origem desta mensagem (click-to-WhatsApp), como veio do provedor: '
  '{source_type, source_id, source_url, ctwa_clid, headline, body, media_type, thumbnail_url}. '
  'Nulo = mensagem não veio de anúncio.';

-- Só as mensagens de anúncio: é uma minoria, e o índice parcial não paga o
-- preço das outras.
create index if not exists messages_ad_referral_idx
  on public.messages ((ad_referral ->> 'source_id'))
  where ad_referral is not null;


-- ─── cache de nomes de anúncio ────────────────────────────────────
--
-- O aviso do WhatsApp traz o ID do anúncio e o título dele — nunca o nome da
-- campanha. Para isso é preciso perguntar à API de Anúncios da Meta, e essa
-- resposta não muda: o mesmo anúncio pertence à mesma campanha para sempre.
-- Sem cache, cada mensagem de uma campanha ativa viraria uma chamada à Graph
-- API, com rate limit e latência dentro do webhook.
create table if not exists public.meta_ad_cache (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  ad_id         text not null,
  ad_name       text,
  adset_id      text,
  adset_name    text,
  campaign_id   text,
  campaign_name text,
  -- Consulta que falhou fica registrada com `fetched_at` para não ser repetida
  -- a cada mensagem: anúncio de outra conta de anúncios nunca vai resolver.
  erro          text,
  fetched_at    timestamptz not null default now(),
  primary key (tenant_id, ad_id)
);

comment on table public.meta_ad_cache is
  'Nome do anúncio/conjunto/campanha por ad_id, buscado na Graph API. O vínculo '
  'ad -> campanha não muda, então a entrada não expira; `erro` marca a busca que '
  'falhou, para não repetir a chamada a cada mensagem.';

alter table public.meta_ad_cache enable row level security;

-- Leitura pelo tenant; a escrita é só do service role (webhook).
create policy meta_ad_cache_select on public.meta_ad_cache
  for select using (tenant_id = public.jwt_claim('tenant_id')::uuid);
