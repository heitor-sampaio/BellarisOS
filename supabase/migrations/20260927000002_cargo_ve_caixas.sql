-- Quais caixas de WhatsApp um cargo enxerga no inbox (pedido do Heitor,
-- 2026-09-27: "não deve ser fixo, pode ser uma configuração feita nos cargos").
--
-- Ligar pessoas a um número (`whatsapp_number_users`) decide por onde elas
-- ENVIAM. Isto decide o que elas VEEM:
--
--   'todas'  — o inbox mostra as conversas de todas as caixas da rede. É o
--              comportamento até aqui, e por isso o padrão: nenhum cargo muda
--              de visão no dia da migração.
--   'minhas' — só as conversas das caixas a que a PESSOA está ligada. Quem não
--              está ligada a nenhuma não vê conversa de WhatsApp nenhuma.
--
-- Conversa sem caixa (Instagram, Messenger, nota manual) não é afetada: não há
-- caixa para comparar. E soma-se ao escopo do CRM, não o substitui — com "só os
-- meus leads" as duas regras valem juntas.
--
-- Por cargo, e não por rede como `tenants.inbox_visibilidade`: numa mesma
-- clínica a recepção vê tudo e a SDR vê o número dela.

alter table public.tenant_roles
  add column if not exists inbox_caixas text not null default 'todas';

alter table public.tenant_roles
  drop constraint if exists tenant_roles_inbox_caixas_check;
alter table public.tenant_roles
  add constraint tenant_roles_inbox_caixas_check
  check (inbox_caixas in ('todas', 'minhas'));

comment on column public.tenant_roles.inbox_caixas is
  'Inbox: todas = conversas de todas as caixas; minhas = só das caixas a que a pessoa está ligada (whatsapp_number_users). Conversa sem caixa não é afetada.';

notify pgrst, 'reload schema';
