-- As funções de acesso também decidiam por nome de cargo.
--
-- A migração `20260917000003` trocou o critério nas policies, mas duas funções
-- SECURITY DEFINER ficaram para trás — e são elas que a maior parte das policies
-- chama. O efeito aparecia longe da causa: na agenda da unidade, quem opera a
-- rede via "Nenhum cliente cadastrado nesta filial" com 13 clientes cadastrados.
--
-- `private.can_access_branch` decidia por `role = 'NETWORK_ADMIN'`; quem é da
-- rede com outro cargo caía no ramo da unidade e comparava `branch_id` nulo.
--
-- `private.client_package_accessible` ia além: exigia que o cargo estivesse na
-- lista fixa ('NETWORK_ADMIN','BRANCH_ADMIN','RECEPTIONIST','PROFESSIONAL',
-- 'FINANCIAL') — os cargos que existiam ANTES de cada rede criar os seus. Hoje
-- nenhum cargo novo está nessa lista, então ninguém via pacote de cliente.

create or replace function private.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select case
    when public.eh_da_rede() then exists (
      select 1 from public.branches
      where id = p_branch_id
        and tenant_id = public.jwt_claim('tenant_id')::uuid
    )
    else public.jwt_claim('branch_id')::uuid = p_branch_id
  end
$$;

comment on function private.can_access_branch(uuid) is
  'Abrangência: quem opera a rede alcança qualquer filial do próprio tenant; quem tem unidade fixa, só a dela.';

create or replace function private.client_package_accessible(p_cp_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.client_packages cp
    where cp.id = p_cp_id
      and (
        -- Equipe: vale a abrangência, não o nome do cargo.
        (public.jwt_claim('client_id') is null and private.can_access_branch(cp.branch_id))
        or
        -- O próprio cliente, pelo pacote dele.
        (public.jwt_claim('role') = 'CLIENT' and cp.client_id = (
          select id from public.clients where auth_id = auth.uid()::text limit 1
        ))
      )
  )
$$;

comment on function private.client_package_accessible(uuid) is
  'Pacote visível para a equipe com alcance na filial, ou para o próprio cliente.';
