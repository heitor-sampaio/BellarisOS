-- F45 (a lentidão do banco, 2026-11-07): índice em toda chave estrangeira de
-- public que não tinha um (o advisor de performance, "unindexed_foreign_keys":
-- 131 em public).
--
-- Por quê: apagar o PAI confere cada FILHO pela chave; sem índice nela, é uma
-- varredura da tabela filha inteira para cada linha apagada. Era o que pesava
-- nas consultas quentes da limpeza e da equipe:
--   e2e_apagar_rede  2.969 chamadas, 136 ms em média (acha os filhos pelas
--                    chaves do catálogo e apaga a rede inteira; numa completa
--                    as ~400 redes da rodada ficam no banco até o fim);
--   DELETE users     4.438, 28 ms (máx. 3,4 s): ~45 colunas apontam para
--                    users (criado_por, sold_by, registrado_por...), quase
--                    todas sem índice;
--   DELETE tenants   1.178, 63 ms; DELETE branches 1.392, 39 ms.
-- role_permissions (sem índice no tenant_id) somava 47 milhões de linhas lidas
-- por varredura desde 04/11; messages, 10 milhões (sent_by_id e template_id).
--
-- Só cria índice (if not exists): nada muda no que se grava. As tabelas são
-- pequenas fora da completa, e o índice nasce em milissegundos.

create index if not exists agenda_bloqueios_branch_id_fk_idx on public.agenda_bloqueios (branch_id);
create index if not exists agenda_bloqueios_criado_por_fk_idx on public.agenda_bloqueios (criado_por);
create index if not exists automation_runs_evento_id_fk_idx on public.automation_runs (evento_id);
create index if not exists automation_runs_tenant_id_fk_idx on public.automation_runs (tenant_id);
create index if not exists automation_versions_criado_por_fk_idx on public.automation_versions (criado_por);
create index if not exists automation_versions_tenant_id_fk_idx on public.automation_versions (tenant_id);
create index if not exists automations_criado_por_fk_idx on public.automations (criado_por);
create index if not exists client_documents_uploaded_by_fk_idx on public.client_documents (uploaded_by);
create index if not exists client_packages_branch_id_fk_idx on public.client_packages (branch_id);
create index if not exists client_packages_cancelado_por_fk_idx on public.client_packages (cancelado_por);
create index if not exists client_packages_registrado_por_fk_idx on public.client_packages (registrado_por);
create index if not exists client_packages_responsavel_id_fk_idx on public.client_packages (responsavel_id);
create index if not exists client_packages_sold_by_fk_idx on public.client_packages (sold_by);
create index if not exists commission_configs_updated_by_fk_idx on public.commission_configs (updated_by);
create index if not exists commission_lines_branch_id_fk_idx on public.commission_lines (branch_id);
create index if not exists commission_lines_procedure_id_fk_idx on public.commission_lines (procedure_id);
create index if not exists commission_lines_procedure_sale_id_fk_idx on public.commission_lines (procedure_sale_id);
create index if not exists commission_lines_professional_id_fk_idx on public.commission_lines (professional_id);
create index if not exists commission_payouts_branch_id_fk_idx on public.commission_payouts (branch_id);
create index if not exists commission_payouts_estornado_por_fk_idx on public.commission_payouts (estornado_por);
create index if not exists commission_payouts_estorno_transaction_id_fk_idx on public.commission_payouts (estorno_transaction_id);
create index if not exists commission_payouts_paid_by_fk_idx on public.commission_payouts (paid_by);
create index if not exists commission_payouts_professional_id_fk_idx on public.commission_payouts (professional_id);
create index if not exists commission_payouts_transaction_id_fk_idx on public.commission_payouts (transaction_id);
create index if not exists commission_rules_updated_by_fk_idx on public.commission_rules (updated_by);
create index if not exists commissions_payout_id_fk_idx on public.commissions (payout_id);
create index if not exists commissions_transaction_id_fk_idx on public.commissions (transaction_id);
create index if not exists copilot_acoes_tenant_id_fk_idx on public.copilot_acoes (tenant_id);
create index if not exists copilot_acoes_user_id_fk_idx on public.copilot_acoes (user_id);
create index if not exists copilot_conversas_tenant_id_fk_idx on public.copilot_conversas (tenant_id);
create index if not exists copilot_mensagens_tenant_id_fk_idx on public.copilot_mensagens (tenant_id);
create index if not exists document_link_attempts_link_id_fk_idx on public.document_link_attempts (link_id);
create index if not exists document_sign_links_created_by_fk_idx on public.document_sign_links (created_by);
create index if not exists document_sign_links_tenant_id_fk_idx on public.document_sign_links (tenant_id);
create index if not exists document_signatures_conducted_by_fk_idx on public.document_signatures (conducted_by);
create index if not exists document_signatures_link_id_fk_idx on public.document_signatures (link_id);
create index if not exists document_signatures_tenant_id_fk_idx on public.document_signatures (tenant_id);
create index if not exists document_template_versions_created_by_fk_idx on public.document_template_versions (created_by);
create index if not exists document_template_versions_template_id_tenant_id_fk_idx on public.document_template_versions (template_id, tenant_id);
create index if not exists document_template_versions_tenant_id_fk_idx on public.document_template_versions (tenant_id);
create index if not exists document_templates_created_by_fk_idx on public.document_templates (created_by);
create index if not exists domain_events_branch_id_fk_idx on public.domain_events (branch_id);
create index if not exists fechamentos_do_dia_fechado_por_fk_idx on public.fechamentos_do_dia (fechado_por);
create index if not exists fechamentos_do_dia_tenant_id_fk_idx on public.fechamentos_do_dia (tenant_id);
create index if not exists fundos_de_troco_informado_por_fk_idx on public.fundos_de_troco (informado_por);
create index if not exists fundos_de_troco_tenant_id_fk_idx on public.fundos_de_troco (tenant_id);
create index if not exists importacoes_branch_id_fk_idx on public.importacoes (branch_id);
create index if not exists importacoes_criada_por_fk_idx on public.importacoes (criada_por);
create index if not exists injectable_applications_map_id_fk_idx on public.injectable_applications (map_id);
create index if not exists injectable_applications_professional_id_fk_idx on public.injectable_applications (professional_id);
create index if not exists injectable_maps_branch_id_fk_idx on public.injectable_maps (branch_id);
create index if not exists injectable_maps_updated_by_fk_idx on public.injectable_maps (updated_by);
create index if not exists issued_document_events_actor_user_id_fk_idx on public.issued_document_events (actor_user_id);
create index if not exists issued_document_events_tenant_id_fk_idx on public.issued_document_events (tenant_id);
create index if not exists issued_documents_branch_id_fk_idx on public.issued_documents (branch_id);
create index if not exists issued_documents_closed_by_fk_idx on public.issued_documents (closed_by);
create index if not exists issued_documents_template_id_tenant_id_fk_idx on public.issued_documents (template_id, tenant_id);
create index if not exists issued_documents_procedure_id_fk_idx on public.issued_documents (procedure_id);
create index if not exists issued_documents_replaced_by_fk_idx on public.issued_documents (replaced_by);
create index if not exists issued_documents_template_version_id_fk_idx on public.issued_documents (template_version_id);
create index if not exists lead_events_actor_user_id_fk_idx on public.lead_events (actor_user_id);
create index if not exists lead_events_from_stage_id_fk_idx on public.lead_events (from_stage_id);
create index if not exists lead_events_to_stage_id_fk_idx on public.lead_events (to_stage_id);
create index if not exists leads_motivo_perda_id_fk_idx on public.leads (motivo_perda_id);
create index if not exists lgpd_requests_medical_reviewed_by_fk_idx on public.lgpd_requests (medical_reviewed_by);
create index if not exists loyalty_rewards_procedure_id_fk_idx on public.loyalty_rewards (procedure_id);
create index if not exists loyalty_rewards_product_id_fk_idx on public.loyalty_rewards (product_id);
create index if not exists loyalty_transactions_appointment_id_fk_idx on public.loyalty_transactions (appointment_id);
create index if not exists loyalty_transactions_branch_id_fk_idx on public.loyalty_transactions (branch_id);
create index if not exists loyalty_transactions_treatment_plan_id_fk_idx on public.loyalty_transactions (treatment_plan_id);
create index if not exists loyalty_transactions_voucher_id_fk_idx on public.loyalty_transactions (voucher_id);
create index if not exists loyalty_vouchers_branch_id_fk_idx on public.loyalty_vouchers (branch_id);
create index if not exists loyalty_vouchers_procedure_id_fk_idx on public.loyalty_vouchers (procedure_id);
create index if not exists loyalty_vouchers_product_id_fk_idx on public.loyalty_vouchers (product_id);
create index if not exists loyalty_vouchers_reward_id_fk_idx on public.loyalty_vouchers (reward_id);
create index if not exists loyalty_vouchers_tenant_id_fk_idx on public.loyalty_vouchers (tenant_id);
create index if not exists loyalty_vouchers_used_stock_movement_id_fk_idx on public.loyalty_vouchers (used_stock_movement_id);
create index if not exists message_templates_created_by_fk_idx on public.message_templates (created_by);
create index if not exists messages_sent_by_id_fk_idx on public.messages (sent_by_id);
create index if not exists messages_template_id_fk_idx on public.messages (template_id);
create index if not exists package_sessions_procedure_id_fk_idx on public.package_sessions (procedure_id);
create index if not exists platform_audit_log_staff_id_fk_idx on public.platform_audit_log (staff_id);
create index if not exists platform_settings_updated_by_fk_idx on public.platform_settings (updated_by);
create index if not exists platform_staff_created_by_fk_idx on public.platform_staff (created_by);
create index if not exists pre_atendimento_link_attempts_link_id_fk_idx on public.pre_atendimento_link_attempts (link_id);
create index if not exists pre_atendimento_links_created_by_fk_idx on public.pre_atendimento_links (created_by);
create index if not exists pre_atendimento_links_tenant_id_fk_idx on public.pre_atendimento_links (tenant_id);
create index if not exists pre_atendimentos_respondido_por_fk_idx on public.pre_atendimentos (respondido_por);
create index if not exists pre_atendimentos_tenant_id_fk_idx on public.pre_atendimentos (tenant_id);
create index if not exists procedure_sale_units_cancelled_by_fk_idx on public.procedure_sale_units (cancelled_by);
create index if not exists procedure_sales_client_id_fk_idx on public.procedure_sales (client_id);
create index if not exists procedure_sales_procedure_id_fk_idx on public.procedure_sales (procedure_id);
create index if not exists procedure_sales_registrado_por_fk_idx on public.procedure_sales (registrado_por);
create index if not exists procedure_sales_sold_by_fk_idx on public.procedure_sales (sold_by);
create index if not exists procedures_form_id_fk_idx on public.procedures (form_id);
create index if not exists procedures_consent_template_id_tenant_id_fk_idx on public.procedures (consent_template_id, tenant_id);
create index if not exists procedures_contract_template_id_tenant_id_fk_idx on public.procedures (contract_template_id, tenant_id);
create index if not exists product_batches_branch_id_fk_idx on public.product_batches (branch_id);
create index if not exists product_sale_items_devolucao_movement_id_fk_idx on public.product_sale_items (devolucao_movement_id);
create index if not exists product_sale_items_product_id_fk_idx on public.product_sale_items (product_id);
create index if not exists product_sale_items_stock_movement_id_fk_idx on public.product_sale_items (stock_movement_id);
create index if not exists product_sale_items_tenant_id_fk_idx on public.product_sale_items (tenant_id);
create index if not exists product_sales_devolucao_movement_id_fk_idx on public.product_sales (devolucao_movement_id);
create index if not exists product_sales_product_id_fk_idx on public.product_sales (product_id);
create index if not exists product_sales_registrado_por_fk_idx on public.product_sales (registrado_por);
create index if not exists product_sales_sold_by_fk_idx on public.product_sales (sold_by);
create index if not exists product_sales_stock_movement_id_fk_idx on public.product_sales (stock_movement_id);
create index if not exists prontuario_acessos_tenant_id_fk_idx on public.prontuario_acessos (tenant_id);
create index if not exists quick_replies_created_by_fk_idx on public.quick_replies (created_by);
create index if not exists role_permissions_tenant_id_fk_idx on public.role_permissions (tenant_id);
create index if not exists service_package_items_procedure_id_fk_idx on public.service_package_items (procedure_id);
create index if not exists service_package_items_tenant_id_fk_idx on public.service_package_items (tenant_id);
create index if not exists stock_movement_batches_batch_id_fk_idx on public.stock_movement_batches (batch_id);
create index if not exists support_grants_granted_by_user_id_fk_idx on public.support_grants (granted_by_user_id);
create index if not exists support_grants_revoked_by_staff_id_fk_idx on public.support_grants (revoked_by_staff_id);
create index if not exists support_grants_revoked_by_user_id_fk_idx on public.support_grants (revoked_by_user_id);
create index if not exists support_grants_ticket_id_fk_idx on public.support_grants (ticket_id);
create index if not exists support_sessions_grant_id_fk_idx on public.support_sessions (grant_id);
create index if not exists support_sessions_ticket_id_fk_idx on public.support_sessions (ticket_id);
create index if not exists support_ticket_messages_author_staff_id_fk_idx on public.support_ticket_messages (author_staff_id);
create index if not exists support_ticket_messages_author_user_id_fk_idx on public.support_ticket_messages (author_user_id);
create index if not exists support_tickets_assigned_staff_id_fk_idx on public.support_tickets (assigned_staff_id);
create index if not exists support_tickets_branch_id_fk_idx on public.support_tickets (branch_id);
create index if not exists support_tickets_grant_id_fk_idx on public.support_tickets (grant_id);
create index if not exists tenant_subscriptions_plan_id_fk_idx on public.tenant_subscriptions (plan_id);
create index if not exists treatment_plans_desconto_por_fk_idx on public.treatment_plans (desconto_por);
create index if not exists treatment_plans_vendido_por_fk_idx on public.treatment_plans (vendido_por);
create index if not exists whatsapp_historicos_tenant_id_fk_idx on public.whatsapp_historicos (tenant_id);
create index if not exists whatsapp_number_users_user_id_tenant_id_fk_idx on public.whatsapp_number_users (user_id, tenant_id);
create index if not exists whatsapp_number_users_whatsapp_number_id_tenant_id_fk_idx on public.whatsapp_number_users (whatsapp_number_id, tenant_id);
create index if not exists whatsapp_numbers_branch_id_tenant_id_fk_idx on public.whatsapp_numbers (branch_id, tenant_id);
