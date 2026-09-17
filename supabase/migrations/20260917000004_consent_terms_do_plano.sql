-- Termo de consentimento sabe de qual plano de tratamento ele é.
--
-- O checkout gera dois termos (anamnese e contrato) ao entrar no passo de
-- documentação. Sem vínculo com o plano não havia como reencontrá-los: cada
-- entrada no passo criava outro par, e todo checkout abandonado deixava dois
-- `consent_terms` PENDING soltos no prontuário do cliente.
--
-- `on delete set null` porque o termo assinado é documento do prontuário e
-- sobrevive ao plano: se um dia o plano for apagado, o que o cliente assinou
-- continua valendo.

alter table consent_terms
  add column if not exists treatment_plan_id uuid references treatment_plans(id) on delete set null;

create index if not exists consent_terms_plan_idx
  on consent_terms(treatment_plan_id)
  where treatment_plan_id is not null;

comment on column consent_terms.treatment_plan_id is
  'Plano de tratamento que originou o termo (checkout). Null nos termos avulsos e nos anteriores a esta coluna.';
