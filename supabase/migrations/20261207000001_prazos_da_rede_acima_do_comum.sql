-- Os três prazos que a rede configura deixam de recusar acima do teto de antes.
--
-- O Heitor, 25/11, perguntado se o "no máximo, avisar" do princípio 2 vale
-- para eles: "Se não for impossível, ainda que improvável, pode ser feito."
--
-- O banco guardava os tetos da tela: a validade do plano proposto até 365 dias
-- (20261029001202), o prazo para alterar o agendamento pelo portal até 720
-- horas (20261021000014) e a validade da ficha de saúde até 36 meses
-- (20261020000002). Acima deles, agora, a tela avisa e o servidor grava.
--
-- Fica o impossível (decisão do Claude, 25/11): o negativo e o zero onde não
-- cabe (a validade do plano e da ficha começam em 1; o prazo do portal aceita
-- 0), e acima de 100 anos — cada prazo vira uma DATA, e a conta da data
-- estoura (o gatilho do envio da ficha faz `now() - make_interval(months => N)`
-- em todo agendamento): 36.500 dias, 876.000 horas, 1.200 meses. O fracionário
-- o tipo da coluna (integer) já não guarda. Os mesmos números de
-- `apps/web/lib/acima-do-comum.ts`.

alter table public.tenants
  drop constraint if exists tenants_plano_validade_dias_faixa,
  add constraint tenants_plano_validade_dias_faixa check (plano_validade_dias between 1 and 36500),
  drop constraint if exists tenants_portal_prazo_alteracao,
  add constraint tenants_portal_prazo_alteracao check (portal_prazo_alteracao_horas between 0 and 876000),
  drop constraint if exists tenants_pre_atendimento_validade,
  add constraint tenants_pre_atendimento_validade check (pre_atendimento_validade_meses between 1 and 1200);

notify pgrst, 'reload schema';
