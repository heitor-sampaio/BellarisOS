-- Termos e contratos — o link de assinatura pela conversa do inbox.
--
-- Escolha da REDE (decisão do Heitor, 2026-09-30), e nasce DESLIGADA: mandar
-- pela conversa põe a mensagem no WhatsApp da clínica, com o nome de quem
-- mandou, e há clínica que prefere que só o comercial fale por ali. Desligada,
-- a equipe continua com "Copiar link" e "Abrir no WhatsApp" (do aparelho).

alter table public.tenants
  add column documentos_link_pela_conversa boolean not null default false;

comment on column public.tenants.documentos_link_pela_conversa is
  'A equipe pode mandar o link de assinatura pela conversa do cliente no inbox (Configurações → Documentos).';

notify pgrst, 'reload schema';
