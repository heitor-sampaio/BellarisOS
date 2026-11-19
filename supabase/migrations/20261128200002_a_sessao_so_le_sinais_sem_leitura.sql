-- A sessão só lê SINAIS (o Heitor, 19/11, "vai na 2"; CLAUDE.md §4). Parte 2
-- de 2: o que SAI — vai DEPOIS do código no ar (as telas já assinam os
-- sinais e leem pelo servidor; a parte 1 é a 20261128200001).
--
-- Conferido em 19/11: nenhuma leitura do app passa pelo cliente da sessão
-- (ele ficou só para entrar, sair e "quem sou eu"), e o navegador não lê
-- tabela nenhuma — só assina sinais. A lista abaixo é a da produção em 19/11,
-- e a trava `e2e_leituras_pela_sessao()` a exige vazia depois disto.

-- 1. As 71 políticas de leitura fora dos sinais (70 tabelas).
drop policy if exists appointments_select on public.appointments;
drop policy if exists automation_run_steps_leitura on public.automation_run_steps;
drop policy if exists automation_runs_leitura on public.automation_runs;
drop policy if exists automation_versions_leitura on public.automation_versions;
drop policy if exists automations_leitura on public.automations;
drop policy if exists "Comercial ve filiais da rede" on public.branches;
drop policy if exists "Usuário vê própria filial" on public.branches;
drop policy if exists "Admin lê dispatches do tenant" on public.campaign_dispatches;
drop policy if exists cash_registers_select on public.cash_registers;
drop policy if exists "Cliente lê próprias notificações" on public.client_notifications;
drop policy if exists client_packages_select on public.client_packages;
drop policy if exists clients_select on public.clients;
drop policy if exists contacts_select on public.contacts;
drop policy if exists conversations_select_tenant on public.conversations;
drop policy if exists crm_funnels_select on public.crm_funnels;
drop policy if exists document_signatures_select on public.document_signatures;
drop policy if exists document_template_versions_select on public.document_template_versions;
drop policy if exists document_templates_select on public.document_templates;
drop policy if exists domain_events_leitura on public.domain_events;
drop policy if exists fornecedores_select on public.fornecedores;
drop policy if exists installments_select on public.installments;
drop policy if exists internal_credits_select on public.internal_credits;
drop policy if exists issued_document_events_select on public.issued_document_events;
drop policy if exists issued_documents_select on public.issued_documents;
drop policy if exists lead_events_rede_select on public.lead_events;
drop policy if exists "Comercial le leads da rede" on public.leads;
drop policy if exists lgpd_requests_select on public.lgpd_requests;
drop policy if exists loyalty_accounts_select on public.loyalty_accounts;
drop policy if exists loyalty_configs_select on public.loyalty_configs;
drop policy if exists loyalty_rewards_select on public.loyalty_rewards;
drop policy if exists loyalty_transactions_select on public.loyalty_transactions;
drop policy if exists loyalty_vouchers_select on public.loyalty_vouchers;
drop policy if exists marcas_select on public.marcas;
drop policy if exists message_templates_select on public.message_templates;
drop policy if exists messages_select_tenant on public.messages;
drop policy if exists meta_ad_cache_select on public.meta_ad_cache;
drop policy if exists meta_capi_events_select on public.meta_capi_events;
drop policy if exists notification_campaigns_select on public.notification_campaigns;
drop policy if exists package_sessions_select on public.package_sessions;
drop policy if exists pba_select on public.procedure_branch_availability;
drop policy if exists pbp_select on public.procedure_branch_pricing;
drop policy if exists procedure_price_history_select on public.procedure_price_history;
drop policy if exists procedure_products_select on public.procedure_products;
drop policy if exists procedure_professionals_select on public.procedure_professionals;
drop policy if exists procedure_rooms_select on public.procedure_rooms;
drop policy if exists procedure_sale_units_select on public.procedure_sale_units;
drop policy if exists procedure_sales_select on public.procedure_sales;
drop policy if exists procedures_select on public.procedures;
drop policy if exists product_batches_select on public.product_batches;
drop policy if exists product_categories_select on public.product_categories;
drop policy if exists product_sale_items_select on public.product_sale_items;
drop policy if exists product_sales_select on public.product_sales;
drop policy if exists products_select on public.products;
drop policy if exists push_tokens_select on public.push_tokens;
drop policy if exists recebiveis_do_cartao_select on public.recebiveis_do_cartao;
drop policy if exists role_permissions_select on public.role_permissions;
drop policy if exists role_report_tabs_select on public.role_report_tabs;
drop policy if exists rooms_select on public.rooms;
drop policy if exists service_package_items_select on public.service_package_items;
drop policy if exists service_packages_select on public.service_packages;
drop policy if exists stock_movement_batches_select on public.stock_movement_batches;
drop policy if exists stock_movements_select on public.stock_movements;
drop policy if exists stock_transfer_items_select on public.stock_transfer_items;
drop policy if exists stock_transfers_select on public.stock_transfers;
drop policy if exists tenant_roles_select on public.tenant_roles;
drop policy if exists "Tenant visível para membros da rede" on public.tenants;
drop policy if exists treatment_plan_session_procedures_leitura on public.treatment_plan_session_procedures;
drop policy if exists treatment_plan_sessions_leitura on public.treatment_plan_sessions;
drop policy if exists user_notifications_select on public.user_notifications;
drop policy if exists "Usuário vê membros do próprio tenant/filial" on public.users;
drop policy if exists web_push_subscriptions_select on public.web_push_subscriptions;

-- 2. As funções que a sessão executava pelo /rpc (leem como quem chama, ou
--    recebem a rede por parâmetro). Ficam as duas da trava: `jwt_claim` (as
--    políticas dos sinais) e `planos_do_site` (os preços públicos do site).
--    O serviço continua executando todas (lib/metrics, o estoque).
revoke execute on function public.chave_do_nome(p text) from public, anon, authenticated;
revoke execute on function public.custo_do_lote(p_lote uuid) from public, anon, authenticated;
revoke execute on function public.eh_da_rede() from public, anon, authenticated;
revoke execute on function public.fuso_da_unidade(p_branch uuid) from public, anon, authenticated;
revoke execute on function public.fuso_do_recorte(p_tenant uuid, p_branch_ids uuid[]) from public, anon, authenticated;
revoke execute on function public.metrics_pago_com_credito_do_cliente(p_tenant uuid, p_client uuid) from public, anon, authenticated;
revoke execute on function public.metrics_perdas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.recorte_e_a_clinica(p_tenant uuid, p_branch_ids uuid[]) from public, anon, authenticated;
grant execute on function public.chave_do_nome(p text) to service_role;
grant execute on function public.custo_do_lote(p_lote uuid) to service_role;
grant execute on function public.eh_da_rede() to service_role;
grant execute on function public.fuso_da_unidade(p_branch uuid) to service_role;
grant execute on function public.fuso_do_recorte(p_tenant uuid, p_branch_ids uuid[]) to service_role;
grant execute on function public.metrics_pago_com_credito_do_cliente(p_tenant uuid, p_client uuid) to service_role;
grant execute on function public.metrics_perdas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone) to service_role;
grant execute on function public.recorte_e_a_clinica(p_tenant uuid, p_branch_ids uuid[]) to service_role;

-- 3. O Realtime só publica sinais: as 20 tabelas de conteúdo saem (sem
--    política nenhuma já não entregariam nada; fora da publicação, nem o
--    trabalho de conferir cada mudança para cada inscrito).
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'appointments', 'branch_product_stock', 'branches', 'client_notifications', 'client_packages',
    'clients', 'conversations', 'installments', 'leads', 'messages', 'notification_campaigns',
    'package_sessions', 'procedure_products', 'procedures', 'product_batches', 'products',
    'stock_movements', 'treatment_plans', 'user_notifications', 'users'
  ] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela) then
      execute format('alter publication supabase_realtime drop table public.%I', v_tabela);
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
