-- RLS por ABRANGÊNCIA, não por nome de cargo.
--
-- As policies decidiam com `jwt_claim('role') = 'NETWORK_ADMIN'`, o que a
-- migração de cargos dinâmicos tornou errado: hoje cada rede cria os próprios
-- cargos, e quem opera a rede é quem NÃO tem unidade fixa (`branch_id` null no
-- JWT) — pode se chamar "Comercial", "Diretoria" ou qualquer coisa.
--
-- O efeito era silencioso e confuso: um cargo de rede caía no ramo "da unidade"
-- e comparava `branch_id = null`, que não casa com linha nenhuma. Em
-- `/[slug]/team` isso aparecia como "0 membros cadastrados" com quatro pessoas
-- cadastradas na filial; em `branches`, quem era da rede não conseguia sequer
-- resolver a filial da URL pelo cliente do usuário.
--
-- É a mesma regra do app (`lib/auth.ts`): abrangência é `users.branch_id`, e
-- "nunca decida acesso por nome de cargo" (CLAUDE.md, seção 11).

-- `client_id` entra na conta porque o cliente final também tem `branch_id` null.
-- Sem isso ele passaria a contar como "da rede". O `tenant_id` dele é null, o
-- que já barraria as comparações seguintes, mas a intenção fica explícita aqui
-- em vez de depender de um efeito colateral.
create or replace function public.eh_da_rede()
returns boolean
language sql
stable
set search_path to ''
as $$
  select public.jwt_claim('branch_id') is null
     and public.jwt_claim('client_id') is null
     and public.jwt_claim('tenant_id') is not null;
$$;

comment on function public.eh_da_rede() is
  'true quando o usuário do JWT opera a rede inteira (sem unidade fixa). Abrangência, não cargo.';

-- ── Leitura ────────────────────────────────────────────────────────────────

drop policy if exists "Usuário vê membros do próprio tenant/filial" on public.users;
create policy "Usuário vê membros do próprio tenant/filial"
  on public.users for select
  using (
    case
      when public.eh_da_rede() then tenant_id = (public.jwt_claim('tenant_id'))::uuid
      else branch_id = (public.jwt_claim('branch_id'))::uuid
    end
  );

drop policy if exists "Usuário vê própria filial" on public.branches;
create policy "Usuário vê própria filial"
  on public.branches for select
  using (
    case
      when public.eh_da_rede() then tenant_id = (public.jwt_claim('tenant_id'))::uuid
      else id = (public.jwt_claim('branch_id'))::uuid
    end
  );

drop policy if exists "Admin lê dispatches do tenant" on public.campaign_dispatches;
create policy "Admin lê dispatches do tenant"
  on public.campaign_dispatches for select
  using (
    exists (
      select 1 from public.notification_campaigns nc
      where nc.id = campaign_dispatches.campaign_id
        and nc.tenant_id = (public.jwt_claim('tenant_id'))::uuid
        and public.eh_da_rede()
    )
  );

-- ── Escrita ────────────────────────────────────────────────────────────────
-- A autorização de verdade é a do app (`assertPermission`); estas policies são a
-- segunda linha de defesa. O que muda é só o critério de "é da rede".

drop policy if exists "loyalty_configs_update" on public.loyalty_configs;
create policy "loyalty_configs_update"
  on public.loyalty_configs for update
  using (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "Admin gerencia campanhas do tenant" on public.notification_campaigns;
create policy "Admin gerencia campanhas do tenant"
  on public.notification_campaigns for all
  using       (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid)
  with check  (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "product_categories_insert" on public.product_categories;
create policy "product_categories_insert"
  on public.product_categories for insert
  with check (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "product_categories_update" on public.product_categories;
create policy "product_categories_update"
  on public.product_categories for update
  using (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "product_categories_delete" on public.product_categories;
create policy "product_categories_delete"
  on public.product_categories for delete
  using (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "role_permissions_upsert" on public.role_permissions;
create policy "role_permissions_upsert"
  on public.role_permissions for insert
  with check (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "role_permissions_update" on public.role_permissions;
create policy "role_permissions_update"
  on public.role_permissions for update
  using (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "role_permissions_delete" on public.role_permissions;
create policy "role_permissions_delete"
  on public.role_permissions for delete
  using (public.eh_da_rede() and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

drop policy if exists "tenant_roles_insert" on public.tenant_roles;
create policy "tenant_roles_insert"
  on public.tenant_roles for insert
  with check (
    public.eh_da_rede()
    and tenant_id = (public.jwt_claim('tenant_id'))::uuid
    and is_system = false
  );

drop policy if exists "tenant_roles_delete" on public.tenant_roles;
create policy "tenant_roles_delete"
  on public.tenant_roles for delete
  using (
    public.eh_da_rede()
    and tenant_id = (public.jwt_claim('tenant_id'))::uuid
    and is_system = false
  );

drop policy if exists "pba_insert" on public.procedure_branch_availability;
create policy "pba_insert"
  on public.procedure_branch_availability for insert
  with check (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_branch_availability.procedure_id
        and p.tenant_id = (public.jwt_claim('tenant_id'))::uuid
        and public.eh_da_rede()
    )
  );

drop policy if exists "pba_update" on public.procedure_branch_availability;
create policy "pba_update"
  on public.procedure_branch_availability for update
  using (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_branch_availability.procedure_id
        and p.tenant_id = (public.jwt_claim('tenant_id'))::uuid
        and public.eh_da_rede()
    )
  );

drop policy if exists "pba_delete" on public.procedure_branch_availability;
create policy "pba_delete"
  on public.procedure_branch_availability for delete
  using (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_branch_availability.procedure_id
        and p.tenant_id = (public.jwt_claim('tenant_id'))::uuid
        and public.eh_da_rede()
    )
  );

drop policy if exists "pbp_insert" on public.procedure_branch_pricing;
create policy "pbp_insert"
  on public.procedure_branch_pricing for insert
  with check (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_branch_pricing.procedure_id
        and p.tenant_id = (public.jwt_claim('tenant_id'))::uuid
        and public.eh_da_rede()
    )
  );

drop policy if exists "pbp_update" on public.procedure_branch_pricing;
create policy "pbp_update"
  on public.procedure_branch_pricing for update
  using (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_branch_pricing.procedure_id
        and p.tenant_id = (public.jwt_claim('tenant_id'))::uuid
        and public.eh_da_rede()
    )
  );

drop policy if exists "pbp_delete" on public.procedure_branch_pricing;
create policy "pbp_delete"
  on public.procedure_branch_pricing for delete
  using (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_branch_pricing.procedure_id
        and p.tenant_id = (public.jwt_claim('tenant_id'))::uuid
        and public.eh_da_rede()
    )
  );
