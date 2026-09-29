-- Comissões, fase 1: quem editou não prende o membro no banco. `updated_by` é
-- rastro, não dono — apagar o membro (o E2E faz; a produção desativa) deixa o
-- rastro nulo em vez de falhar. A regra é do profissional: sai com ele.

alter table public.commission_configs drop constraint if exists commission_configs_updated_by_fkey;
alter table public.commission_configs
  add constraint commission_configs_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null;

alter table public.commission_rules drop constraint if exists commission_rules_updated_by_fkey;
alter table public.commission_rules
  add constraint commission_rules_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null;

alter table public.commission_rules drop constraint if exists commission_rules_professional_id_fkey;
alter table public.commission_rules
  add constraint commission_rules_professional_id_fkey foreign key (professional_id) references public.users(id) on delete cascade;

-- A exceção de um procedimento que deixou de existir não vale nada (a produção
-- desativa procedimento; quem apaga é o E2E).
alter table public.commission_rules drop constraint if exists commission_rules_procedure_id_fkey;
alter table public.commission_rules
  add constraint commission_rules_procedure_id_fkey foreign key (procedure_id) references public.procedures(id) on delete cascade;

-- Como commission_configs e payment_fees: a configuração sai com a rede.
alter table public.commission_rules drop constraint if exists commission_rules_tenant_id_fkey;
alter table public.commission_rules
  add constraint commission_rules_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;
