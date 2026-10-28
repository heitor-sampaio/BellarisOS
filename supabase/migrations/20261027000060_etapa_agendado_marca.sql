-- A etapa "agendado" do funil ganha uma MARCA (2026-10-27, D11/A12).
--
-- Agendar uma cliente com oportunidade aberta leva o card para a etapa de
-- agendado. Essa etapa só era identificável pelo NOME ("Agendado"), e a clínica
-- renomeia etapa: a regra não pode depender de texto. `marca` é o que o código
-- lê; o nome é só rótulo. Uma etapa marcada por funil.
--
-- Os dados de hoje: as etapas-modelo (DEFAULT_STAGES) chamadas "Agendado",
-- abertas (OUTCOME = OPEN), uma por funil (conferido antes: 3, em 3 funis).

alter table public.crm_stages add column if not exists marca text;

alter table public.crm_stages drop constraint if exists crm_stages_marca_valida;
alter table public.crm_stages add constraint crm_stages_marca_valida
  check (marca is null or marca in ('AGENDADO'));

create unique index if not exists crm_stages_uma_marca_por_funil
  on public.crm_stages (funnel_id, marca) where marca is not null;

update public.crm_stages s
   set marca = 'AGENDADO'
 where s.marca is null
   and s.outcome = 'OPEN'
   and lower(trim(s.name)) = 'agendado'
   and not exists (select 1 from public.crm_stages o where o.funnel_id = s.funnel_id and o.marca = 'AGENDADO');

notify pgrst, 'reload schema';
