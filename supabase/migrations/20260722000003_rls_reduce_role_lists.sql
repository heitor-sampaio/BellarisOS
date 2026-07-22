-- Fase 7: RLS deixa de checar listas fixas de role (que quebram cargos dinamicos)
-- e passa a distinguir apenas operacional (role <> 'CLIENT') vs cliente, mantendo
-- o isolamento por filial/tenant. Autorizacao por funcionalidade fica na app layer
-- (assertPermission). Politicas de rede ("Comercial ...") passam a valer para
-- abrangencia de rede (branch_id null no JWT).
-- Aplicada no remoto via MCP (migration: rls_reduce_role_lists_to_isolation).

alter policy anamnesis_data_operacional on public.anamnesis_data
  using (jwt_claim('role') <> 'CLIENT');
alter policy consent_terms_operacional on public.consent_terms
  using (jwt_claim('role') <> 'CLIENT');
alter policy medical_record_entries_operacional on public.medical_record_entries
  using (jwt_claim('role') <> 'CLIENT');
alter policy "Operacional acessa prontuários" on public.medical_records
  using (jwt_claim('role') <> 'CLIENT');
alter policy record_photos_operacional on public.record_photos
  using (jwt_claim('role') <> 'CLIENT');

alter policy cash_registers_operacional on public.cash_registers
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy conversations_operacional on public.conversations
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy "Operacional acessa financeiro da filial" on public.financial_transactions
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy installments_operacional on public.installments
  using ((jwt_claim('role') <> 'CLIENT') and exists (
    select 1 from financial_transactions ft
    where ft.id = installments.transaction_id and private.can_access_branch(ft.branch_id)));
alter policy messages_operacional on public.messages
  using ((jwt_claim('role') <> 'CLIENT') and exists (
    select 1 from conversations c
    where c.id = messages.conversation_id and private.can_access_branch(c.branch_id)));
alter policy stock_transfers_operacional on public.stock_transfers
  using ((jwt_claim('role') <> 'CLIENT') and (private.can_access_branch(from_branch_id) or private.can_access_branch(to_branch_id)));

alter policy commissions_select on public.commissions
  using (private.can_access_branch(branch_id) and (jwt_claim('role') <> 'CLIENT'));
alter policy commission_rules_insert on public.commission_rules
  with check ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy commission_rules_select on public.commission_rules
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy commission_rules_update on public.commission_rules
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));

alter policy client_packages_insert on public.client_packages
  with check ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy client_packages_select on public.client_packages
  using (((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id))
    or ((jwt_claim('role') = 'CLIENT') and (client_id = (select clients.id from clients where clients.auth_id = (select auth.uid())::text limit 1))));

alter policy internal_credits_select on public.internal_credits
  using (((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id))
    or ((jwt_claim('role') = 'CLIENT') and (client_id = (select clients.id from clients where clients.auth_id = (select auth.uid())::text limit 1))));

alter policy lgpd_requests_select on public.lgpd_requests
  using (((jwt_claim('role') <> 'CLIENT') and exists (
      select 1 from clients c where c.id = lgpd_requests.client_id and c.tenant_id::text = jwt_claim('tenant_id')))
    or ((jwt_claim('role') = 'CLIENT') and (client_id = (select clients.id from clients where clients.auth_id = (select auth.uid())::text limit 1))));

alter policy loyalty_accounts_delete on public.loyalty_accounts
  using (jwt_claim('role') <> 'CLIENT');
alter policy loyalty_accounts_insert on public.loyalty_accounts
  with check (jwt_claim('role') <> 'CLIENT');
alter policy loyalty_accounts_select on public.loyalty_accounts
  using ((jwt_claim('role') <> 'CLIENT')
    or ((jwt_claim('role') = 'CLIENT') and (client_id::text = jwt_claim('client_id'))));
alter policy loyalty_accounts_update on public.loyalty_accounts
  using (jwt_claim('role') <> 'CLIENT');
alter policy loyalty_transactions_operacional on public.loyalty_transactions
  using ((jwt_claim('role') <> 'CLIENT')
    or ((jwt_claim('role') = 'CLIENT') and exists (
      select 1 from loyalty_accounts la where la.id = loyalty_transactions.loyalty_account_id and la.client_id::text = jwt_claim('client_id'))));

alter policy procedure_price_history_select on public.procedure_price_history
  using ((jwt_claim('role') <> 'CLIENT') and private.procedure_in_tenant(procedure_id));
alter policy procedure_products_delete on public.procedure_products
  using ((jwt_claim('role') <> 'CLIENT') and private.procedure_in_tenant(procedure_id));
alter policy procedure_products_insert on public.procedure_products
  with check ((jwt_claim('role') <> 'CLIENT') and private.procedure_in_tenant(procedure_id));
alter policy procedure_products_update on public.procedure_products
  using ((jwt_claim('role') <> 'CLIENT') and private.procedure_in_tenant(procedure_id));
alter policy product_batches_select on public.product_batches
  using ((jwt_claim('role') <> 'CLIENT') and private.product_accessible(product_id));
alter policy stock_transfer_items_select on public.stock_transfer_items
  using ((jwt_claim('role') <> 'CLIENT') and private.transfer_accessible(transfer_id));

alter policy rooms_delete on public.rooms
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy rooms_insert on public.rooms
  with check ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));
alter policy rooms_update on public.rooms
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));

alter policy service_packages_insert on public.service_packages
  with check ((jwt_claim('role') <> 'CLIENT') and (tenant_id = jwt_claim('tenant_id')::uuid));
alter policy service_packages_update on public.service_packages
  using ((jwt_claim('role') <> 'CLIENT') and (tenant_id = jwt_claim('tenant_id')::uuid));

-- Politicas de rede: abrangencia de rede (branch_id null) em vez de nome de role
alter policy "Comercial ve filiais da rede" on public.branches
  using ((tenant_id::text = jwt_claim('tenant_id')) and (jwt_claim('branch_id') is null) and (jwt_claim('role') <> 'CLIENT'));
alter policy "Comercial le conversas da rede" on public.conversations
  using ((tenant_id::text = jwt_claim('tenant_id')) and (jwt_claim('branch_id') is null) and (jwt_claim('role') <> 'CLIENT'));
alter policy "Comercial le leads da rede" on public.leads
  using ((tenant_id::text = jwt_claim('tenant_id')) and (jwt_claim('branch_id') is null) and (jwt_claim('role') <> 'CLIENT'));
alter policy "Comercial le mensagens da rede" on public.messages
  using ((tenant_id::text = jwt_claim('tenant_id')) and (jwt_claim('branch_id') is null) and (jwt_claim('role') <> 'CLIENT'));
