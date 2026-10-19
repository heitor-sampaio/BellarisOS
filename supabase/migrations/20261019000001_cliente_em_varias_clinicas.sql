-- A mesma pessoa cliente de várias clínicas (2026-10-19, decisão do Heitor).
--
-- Um login por pessoa, uma ficha em cada clínica. Até aqui `clients.auth_id`
-- era ÚNICO no banco inteiro (um login, uma ficha, em qualquer rede), e várias
-- políticas pegavam "a ficha deste login" com `limit 1` ou pelo `client_id`
-- da claim — com duas fichas, uma delas sumiria em silêncio.
--
-- Agora:
--   • um login tem no máximo UMA ficha por rede (índice único por rede);
--   • `private.clientes_do_login()` são as fichas deste login — todas, e só
--     as dela: toda política do lado CLIENT passa por ela. Security definer
--     porque lê `clients` (a política de `clients` também a usa: pela sessão,
--     voltaria a si mesma).
--   • a claim `client_id` continua no token como a marca "é cliente" (as
--     conferências `jwt_claim('client_id') is null` = equipe seguem valendo),
--     mas nenhuma política escolhe dado por ela.
--
-- O índice único antigo (`clients_auth_id_key`) sai na migration seguinte,
-- em separado: é o único passo que apaga algo.

create unique index if not exists clients_um_login_por_rede
  on public.clients (tenant_id, auth_id) where auth_id is not null;
create index if not exists clients_auth_id_idx
  on public.clients (auth_id) where auth_id is not null;

create or replace function private.clientes_do_login()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.clients c
   where c.auth_id is not null and c.auth_id = (select auth.uid())::text
$$;
revoke execute on function private.clientes_do_login() from public, anon;
grant execute on function private.clientes_do_login() to authenticated, service_role;

-- O lado da equipe de cada política fica como estava; só o da cliente muda.

alter policy clients_select on public.clients using (
  ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id))
  or ((jwt_claim('role') = 'CLIENT') and id in (select private.clientes_do_login()))
);

alter policy appointments_select on public.appointments using (
  ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);

alter policy "Cliente lê próprias notificações" on public.client_notifications using (
  client_id in (select private.clientes_do_login())
);
alter policy "Cliente atualiza próprias notificações" on public.client_notifications
  using (client_id in (select private.clientes_do_login()))
  with check (client_id in (select private.clientes_do_login()));

alter policy client_packages_select on public.client_packages using (
  ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);

alter policy internal_credits_select on public.internal_credits using (
  ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);

alter policy lgpd_requests_select on public.lgpd_requests using (
  ((jwt_claim('role') <> 'CLIENT') and exists (
    select 1 from public.clients c
     where c.id = lgpd_requests.client_id and (c.tenant_id)::text = jwt_claim('tenant_id')))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);
alter policy lgpd_requests_insert on public.lgpd_requests with check (
  (jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login())
);

alter policy procedure_sales_select on public.procedure_sales using (
  ((jwt_claim('role') <> 'CLIENT') and ((tenant_id)::text = jwt_claim('tenant_id')) and private.can_access_branch(branch_id))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);

alter policy issued_documents_select on public.issued_documents using (
  ((jwt_claim('role') <> 'CLIENT') and (tenant_id = (jwt_claim('tenant_id'))::uuid))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);

alter policy loyalty_accounts_select on public.loyalty_accounts using (
  ((jwt_claim('role') <> 'CLIENT') and private.cliente_da_minha_rede(client_id))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);

alter policy loyalty_vouchers_select on public.loyalty_vouchers using (
  ((jwt_claim('role') <> 'CLIENT') and private.cliente_da_minha_rede(client_id))
  or ((jwt_claim('role') = 'CLIENT') and client_id in (select private.clientes_do_login()))
);

alter policy loyalty_transactions_select on public.loyalty_transactions using (
  ((jwt_claim('role') <> 'CLIENT') and private.conta_de_pontos_da_minha_rede(loyalty_account_id))
  or ((jwt_claim('role') = 'CLIENT') and exists (
    select 1 from public.loyalty_accounts la
     where la.id = loyalty_transactions.loyalty_account_id
       and la.client_id in (select private.clientes_do_login())))
);

-- As recompensas da rede de CADA clínica dela.
alter policy loyalty_rewards_select on public.loyalty_rewards using (
  ((jwt_claim('role') <> 'CLIENT') and (tenant_id = (jwt_claim('tenant_id'))::uuid))
  or ((jwt_claim('role') = 'CLIENT') and exists (
    select 1 from public.clients c
     where c.id in (select private.clientes_do_login()) and c.tenant_id = loyalty_rewards.tenant_id))
);

alter policy injectable_maps_all on public.injectable_maps using (
  exists (select 1 from public.clients c
           where c.id = injectable_maps.client_id
             and (((jwt_claim('client_id') is null) and private.can_access_branch(c.branch_id))
                  or c.id in (select private.clientes_do_login())))
);
alter policy injectable_applications_all on public.injectable_applications using (
  exists (select 1 from public.clients c
           where c.id = injectable_applications.client_id
             and (((jwt_claim('client_id') is null) and private.can_access_branch(c.branch_id))
                  or c.id in (select private.clientes_do_login())))
);

-- O aparelho: o lado do membro fica; o da cliente vale para qualquer ficha dela.
alter policy push_tokens_select on public.push_tokens using (
  ((user_id is not null) and (user_id = (select users.id from public.users where users.auth_id = (select auth.uid())::text limit 1)))
  or ((client_id is not null) and client_id in (select private.clientes_do_login()))
);
alter policy push_tokens_insert on public.push_tokens with check (
  ((user_id is not null) and (user_id = (select users.id from public.users where users.auth_id = (select auth.uid())::text limit 1)))
  or ((client_id is not null) and client_id in (select private.clientes_do_login()))
);
alter policy push_tokens_update on public.push_tokens using (
  ((user_id is not null) and (user_id = (select users.id from public.users where users.auth_id = (select auth.uid())::text limit 1)))
  or ((client_id is not null) and client_id in (select private.clientes_do_login()))
);
alter policy push_tokens_delete on public.push_tokens using (
  ((user_id is not null) and (user_id = (select users.id from public.users where users.auth_id = (select auth.uid())::text limit 1)))
  or ((client_id is not null) and client_id in (select private.clientes_do_login()))
);
alter policy "Cliente gerencia próprio token push" on public.web_push_subscriptions
  using (client_id in (select private.clientes_do_login()))
  with check (client_id in (select private.clientes_do_login()));

create or replace function private.client_package_accessible(p_cp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_packages cp
     where cp.id = p_cp_id
       and (
         (public.jwt_claim('client_id') is null and private.can_access_branch(cp.branch_id))
         or (public.jwt_claim('role') = 'CLIENT' and cp.client_id in (select private.clientes_do_login()))
       )
  )
$$;

notify pgrst, 'reload schema';
