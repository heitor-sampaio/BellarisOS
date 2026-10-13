-- E-mail e rede social são da PESSOA (2026-10-13).
--
-- Até aqui só a oportunidade os guardava (leads.email, leads.social_media): uma
-- lista de leads importada sem criar oportunidade perdia o e-mail, e a pessoa
-- não tinha onde mostrá-lo. Agora o importador grava na pessoa (só o vazio,
-- como o resto), e o painel do inbox os mostra e edita na seção do contato.
-- A oportunidade continua com a cópia dela — é o card, não a pessoa.

alter table public.contacts
  add column if not exists email text,
  add column if not exists social_media text;

comment on column public.contacts.email is
  'E-mail da pessoa (importação, painel do inbox). A oportunidade guarda a sua cópia em leads.email.';
comment on column public.contacts.social_media is
  'Rede social da pessoa (@ ou link). A oportunidade guarda a sua cópia em leads.social_media.';

notify pgrst, 'reload schema';
