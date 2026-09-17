-- Avaliação vira um procedimento do catálogo.
--
-- Era um checkbox no agendamento que criava o atendimento SEM procedimento:
-- preço fixo em R$ 0, duração fixa em 60 minutos, sem ficha própria e sem
-- comissão. Rede que cobra avaliação não conseguia cobrar; rede que não faz
-- avaliação tinha o checkbox assim mesmo.
--
-- Agora a rede marca no catálogo quais procedimentos são avaliação, e tudo o
-- mais (preço, duração, ficha, insumos, comissão) vem de lá como em qualquer
-- procedimento. `appointments.is_evaluation` continua existindo, herdado do
-- procedimento, mas passa a ser só métrica de conversão.

alter table procedures
  add column if not exists is_evaluation boolean not null default false;

comment on column procedures.is_evaluation is
  'Consulta de avaliação: abre o planejamento de tratamento e entra na métrica de conversão. Preço e duração são os do próprio procedimento.';

create index if not exists procedures_is_evaluation_idx
  on procedures(tenant_id)
  where is_evaluation;

-- Um procedimento "Avaliação" por rede, para quem já usava o checkbox não ficar
-- sem o fluxo. Nasce grátis e com a duração que o checkbox fixava; quem cobra
-- muda o preço, quem não faz avaliação desativa.
insert into procedures (tenant_id, branch_id, name, category, duration_min, price, is_active, visible_on_client_app, is_evaluation, description)
select t.id, null, 'Avaliação', 'Avaliação', 60, 0, true, false, true,
       'Consulta de avaliação: a profissional monta o plano de tratamento.'
from tenants t
where not exists (
  select 1 from procedures p where p.tenant_id = t.id and p.is_evaluation
);

-- Avaliações antigas nasceram sem procedimento. Liga cada uma à "Avaliação" da
-- rede dela, para que a tela do atendimento tenha o que mostrar.
update appointments a
set procedure_id = p.id
from branches b, procedures p
where a.branch_id = b.id
  and p.tenant_id = b.tenant_id
  and p.is_evaluation
  and p.name = 'Avaliação'
  and a.is_evaluation
  and a.procedure_id is null;
