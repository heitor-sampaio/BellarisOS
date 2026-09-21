-- Seed de demonstração do INBOX — conversas vindas de anúncio.
--
-- Separado de `seed_demo.sql` de propósito: aquele existe para conferir
-- NÚMEROS na mão (receita, ticket, ocupação) e tem valores esperados no
-- cabeçalho. Este existe para ver uma TELA — como a atribuição de anúncio se
-- parece de verdade, com nome de campanha, de conjunto e de criativo do
-- tamanho que agência realmente usa, que é onde o layout quebra.
--
-- Idempotente: tudo usa UUIDs com prefixo `dddddddd-a000` (conversas) e
-- `dddddddd-b000` (mensagens), e o script apaga esses antes de recriar.
--
-- Cobre os três casos que o recurso precisa mostrar:
--   1. contato novo que chegou por um anúncio
--   2. contato conhecido que VOLTOU por outro anúncio — a mensagem carrega a
--      origem e a conversa aponta para a mais recente; é o caso que
--      `conversations.attribution` sozinha perdia
--   3. conversa orgânica, para o selo não parecer onipresente
--
-- `meta_ad_cache` é semeado à mão: sem a integração Meta Ads conectada a Graph
-- API não responderia, e a tela mostraria só o título do criativo. Com o cache
-- preenchido dá para ver a versão completa do selo — que é o que se quer olhar.

do $inbox$
declare
  v_tenant uuid := '880e0566-d467-4fdd-a3a9-fed682ad1cc3';
  v_conv_a uuid := 'dddddddd-a000-0000-0000-000000000001';
  v_conv_b uuid := 'dddddddd-a000-0000-0000-000000000002';
  v_conv_c uuid := 'dddddddd-a000-0000-0000-000000000003';
  -- Ids no formato real da Meta: 17 dígitos.
  v_ad_1   text := '23861547839210047';   -- vídeo depoimento
  v_ad_2   text := '23861547839210099';   -- carrossel antes/depois
  v_agora  timestamptz := now();
begin
  delete from public.messages      where conversation_id::text like 'dddddddd-a000%';
  delete from public.conversations where id::text like 'dddddddd-a000%';
  delete from public.meta_ad_cache where tenant_id = v_tenant and ad_id in (v_ad_1, v_ad_2);

  -- ── A campanha inventada ────────────────────────────────────────────────
  -- Nomes longos de propósito: é assim que agência nomeia, e é o que põe à
  -- prova o corte por reticências no selo.
  insert into public.meta_ad_cache
    (tenant_id, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name)
  values
    (v_tenant, v_ad_1,
     'Vídeo depoimento — Marina, 32 anos',
     '23861547839210001', 'Mulheres 30-50 · Florianópolis 15km',
     '23861547839210000', '[SET/26] Toxina Botulínica | Conversas'),
    (v_tenant, v_ad_2,
     'Carrossel antes e depois — 4 fotos',
     '23861547839210002', 'Retargeting · visitou o site em 30d',
     '23861547839210000', '[SET/26] Toxina Botulínica | Conversas');

  -- ── 1. Contato novo, veio do anúncio de vídeo ───────────────────────────
  insert into public.conversations
    (id, tenant_id, branch_id, channel, status, contact_name, contact_phone,
     contact_external_id, contact_aliases, tags, attribution,
     last_message, last_message_at, last_message_direction, last_inbound_at,
     awaiting_since, unread_count, created_at)
  values (
    v_conv_a, v_tenant, null, 'whatsapp', 'open',
    'Marina Alvarenga', '5548991234567',
    '5548991234567', array['5548991234567'],
    array['Meta Ads'],
    jsonb_build_object('source', 'Meta Ads', 'utm_source', 'instagram',
                       'ad_id', v_ad_1, 'ctwa_clid', 'ARBx9KpQ2mTn7vL4cZ'),
    'Oi! Vi o anúncio do botox com 20% de desconto, ainda está valendo?',
    v_agora - interval '12 minutes', 'inbound', v_agora - interval '12 minutes',
    v_agora - interval '12 minutes', 1, v_agora - interval '12 minutes'
  );

  insert into public.messages
    (id, conversation_id, tenant_id, direction, content, channel, status,
     external_id, is_read, created_at, ad_referral)
  values (
    'dddddddd-b000-0000-0000-000000000001', v_conv_a, v_tenant, 'inbound',
    'Oi! Vi o anúncio do botox com 20% de desconto, ainda está valendo?',
    'whatsapp', 'delivered', 'DEMO_AD_0001', false, v_agora - interval '12 minutes',
    jsonb_build_object(
      'source_type',   'ad',
      'source_id',     v_ad_1,
      'source_url',    'https://www.instagram.com/p/C_demo_toxina/',
      'ctwa_clid',     'ARBx9KpQ2mTn7vL4cZ',
      'headline',      'Botox com 20% de desconto em setembro',
      'body',          'Avaliação gratuita com a Dra. Ana. Agende pelo WhatsApp.',
      'media_type',    'VIDEO',
      'thumbnail_url', null)
  );

  -- ── 2. Conhecida que VOLTOU por outro anúncio ───────────────────────────
  -- O primeiro contato foi orgânico, há mais de um mês; a volta veio do
  -- carrossel de retargeting.
  insert into public.conversations
    (id, tenant_id, branch_id, channel, status, contact_name, contact_phone,
     contact_external_id, contact_aliases, tags, attribution,
     last_message, last_message_at, last_message_direction, last_inbound_at,
     awaiting_since, unread_count, created_at)
  values (
    v_conv_b, v_tenant, null, 'whatsapp', 'open',
    'Juliana Peixoto', '5548996547321',
    '5548996547321', array['5548996547321'],
    array['Meta Ads'],
    jsonb_build_object('source', 'Orgânico', 'ad_id', v_ad_2,
                       'ctwa_clid', 'ARDz4WsY8hJm1pQ6tB'),
    'Voltei! Vi aquele antes e depois no Instagram. Consigo ainda esse mês?',
    v_agora - interval '3 hours', 'inbound', v_agora - interval '3 hours',
    v_agora - interval '3 hours', 1, v_agora - interval '35 days'
  );

  insert into public.messages
    (id, conversation_id, tenant_id, direction, content, channel, status,
     external_id, is_read, created_at, ad_referral)
  values
    ('dddddddd-b000-0000-0000-000000000002', v_conv_b, v_tenant, 'inbound',
     'Boa tarde, vocês fazem limpeza de pele?', 'whatsapp', 'delivered',
     'DEMO_AD_0002', true, v_agora - interval '35 days', null),
    ('dddddddd-b000-0000-0000-000000000003', v_conv_b, v_tenant, 'outbound',
     'Boa tarde, Juliana! Fazemos sim. Quer que eu veja um horário para você?',
     'whatsapp', 'read', 'DEMO_AD_0003', true,
     v_agora - interval '35 days' + interval '6 minutes', null),
    ('dddddddd-b000-0000-0000-000000000004', v_conv_b, v_tenant, 'inbound',
     'Voltei! Vi aquele antes e depois no Instagram. Consigo ainda esse mês?',
     'whatsapp', 'delivered', 'DEMO_AD_0004', false, v_agora - interval '3 hours',
     jsonb_build_object(
       'source_type',   'ad',
       'source_id',     v_ad_2,
       'source_url',    'https://www.facebook.com/ads/demo_antes_depois',
       'ctwa_clid',     'ARDz4WsY8hJm1pQ6tB',
       'headline',      'Antes e depois reais das nossas clientes',
       'body',          'Toxina botulínica com aplicação personalizada.',
       'media_type',    'IMAGE',
       'thumbnail_url', null));

  -- ── 3. Conversa orgânica, para efeito de contraste ──────────────────────
  insert into public.conversations
    (id, tenant_id, branch_id, channel, status, contact_name, contact_phone,
     contact_external_id, contact_aliases, tags, attribution,
     last_message, last_message_at, last_message_direction, last_inbound_at,
     awaiting_since, unread_count, created_at)
  values (
    v_conv_c, v_tenant, null, 'whatsapp', 'open',
    'Carla Menezes', '5548993216547',
    '5548993216547', array['5548993216547'],
    array['Orgânico'],
    jsonb_build_object('source', 'Orgânico'),
    'Oi, uma amiga me indicou vocês. Qual o valor do preenchimento labial?',
    v_agora - interval '1 hour', 'inbound', v_agora - interval '1 hour',
    v_agora - interval '1 hour', 1, v_agora - interval '1 hour'
  );

  insert into public.messages
    (id, conversation_id, tenant_id, direction, content, channel, status,
     external_id, is_read, created_at, ad_referral)
  values (
    'dddddddd-b000-0000-0000-000000000005', v_conv_c, v_tenant, 'inbound',
    'Oi, uma amiga me indicou vocês. Qual o valor do preenchimento labial?',
    'whatsapp', 'delivered', 'DEMO_AD_0005', false, v_agora - interval '1 hour', null
  );
end $inbox$;
