-- O criativo do anúncio: nome e imagem.
--
-- O selo de "veio de anúncio" mostrava o `title` do aviso do WhatsApp, que na
-- prática é o texto do BOTÃO — "Fale conosco" em 109 de 109 mensagens reais.
-- Isso não identifica anúncio nenhum: dois criativos diferentes da mesma
-- campanha têm o mesmo botão.
--
-- O que identifica de verdade vem de dois lugares:
--
--  • o **nome do criativo** e a campanha, da Graph API (estas colunas);
--  • a **imagem**, do próprio aviso do WhatsApp — em base64, ~2,2 KB, porque a
--    URL que a Meta manda junto **expira em quatro dias** (medido: o parâmetro
--    `oe=` é um timestamp). Guardar a URL daria um selo que funciona na
--    semana em que a mensagem chegou e quebra depois.

alter table public.meta_ad_cache
  add column if not exists creative_name text,
  add column if not exists creative_thumb_url text,
  add column if not exists creative_body text;

comment on column public.meta_ad_cache.creative_name is
  'Nome do criativo na Meta. Diferente de ad_name: um anúncio pode reusar um criativo nomeado.';
comment on column public.meta_ad_cache.creative_thumb_url is
  'Miniatura hospedada pela Meta. Ao contrário da URL do aviso do WhatsApp, esta não expira em dias.';
