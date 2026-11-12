-- A sessão só LÊ (F63, C1 do levantamento das regras).
--
-- A chave pública está no navegador: o que uma política deixa a sessão
-- gravar, qualquer membro grava direto no PostgREST, sem o assertPermission
-- da action. Estas tabelas aceitavam escrita pela sessão sem conferir o
-- módulo — às vezes nem o cargo:
--  - a matriz de cargos (role_permissions, role_report_tabs, tenant_roles):
--    qualquer membro da REDE (eh_da_rede) se dava Gerenciar em tudo;
--  - lgpd_requests: a cliente gravava o próprio pedido com qualquer status,
--    o prontuário "aprovado" e o caminho do arquivo de outra pessoa;
--  - stock_movements era ALL: movimento de estoque sem a função do servidor;
--  - clients_delete: apagar a ficha (a clínica arquiva, nunca apaga);
--  - campanhas, categorias do estoque, disponibilidade e preço do
--    procedimento por unidade: só eh_da_rede(), sem o módulo.
-- E a LEITURA das comissões, das regras, dos fechamentos, da configuração e
-- das taxas da maquininha ia a qualquer membro (commissions também pelo
-- Realtime): quem o cargo deixa ver "só as minhas" lia as das colegas, e a
-- taxa que a tela esconde (D7) se lia pela chave pública.
--
-- Todo o código grava (e lê as de comissão) pelo cliente de serviço desde a
-- F63, depois da trava da action. As telas de comissão escutam
-- comissoes_sinais (20261112006301).
--
-- RESTRITIVA: aplicar DEPOIS do deploy do código da F63 — o código de antes
-- grava os cargos pela sessão e assina commissions.

-- Cargos: só o servidor grava.
drop policy if exists role_permissions_upsert on public.role_permissions;
drop policy if exists role_permissions_update on public.role_permissions;
drop policy if exists role_permissions_delete on public.role_permissions;
drop policy if exists role_report_tabs_insert on public.role_report_tabs;
drop policy if exists role_report_tabs_update on public.role_report_tabs;
drop policy if exists role_report_tabs_delete on public.role_report_tabs;
drop policy if exists tenant_roles_insert on public.tenant_roles;
drop policy if exists tenant_roles_update on public.tenant_roles;
drop policy if exists tenant_roles_delete on public.tenant_roles;

-- LGPD: o pedido nasce pela action (actions/lgpd.ts), que decide status,
-- prontuário e arquivo.
drop policy if exists lgpd_requests_insert on public.lgpd_requests;

-- A ficha não se apaga pela sessão (§14: nada clínico se apaga).
drop policy if exists clients_delete on public.clients;

-- Estoque: o movimento nasce pelas funções do servidor; a tela lê (e assina).
drop policy if exists "Operacional acessa movimentos de estoque" on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (jwt_claim('role') <> 'CLIENT' and private.can_access_branch(branch_id));

-- Configurações da rede: o servidor grava, depois do módulo e da
-- recusaDaConfigDaClinica.
drop policy if exists "Admin gerencia campanhas do tenant" on public.notification_campaigns;
create policy notification_campaigns_select on public.notification_campaigns
  for select to authenticated
  using (eh_da_rede() and tenant_id = (jwt_claim('tenant_id'))::uuid);
drop policy if exists product_categories_insert on public.product_categories;
drop policy if exists product_categories_update on public.product_categories;
drop policy if exists product_categories_delete on public.product_categories;
drop policy if exists pba_insert on public.procedure_branch_availability;
drop policy if exists pba_update on public.procedure_branch_availability;
drop policy if exists pba_delete on public.procedure_branch_availability;
drop policy if exists pbp_insert on public.procedure_branch_pricing;
drop policy if exists pbp_update on public.procedure_branch_pricing;
drop policy if exists pbp_delete on public.procedure_branch_pricing;

-- Comissões e taxas: nenhuma leitura pela sessão (lib/comissoes/leitura.ts lê
-- pelo servidor, com o "só as minhas" do cargo). Sem política, a tabela fecha.
drop policy if exists commissions_select on public.commissions;
drop policy if exists commission_lines_select on public.commission_lines;
drop policy if exists commission_rules_select on public.commission_rules;
drop policy if exists commission_payouts_select on public.commission_payouts;
drop policy if exists commission_configs_select on public.commission_configs;
drop policy if exists payment_fees_select on public.payment_fees;

-- O gatilho que barra estornar à mão a despesa de um fechamento lia
-- commission_payouts como quem grava: sem a leitura pela sessão, deixaria de
-- achar o fechamento. Passa a ler como dono.
alter function private.despesa_de_fechamento_so_pelo_fechamento() security definer set search_path = public;
revoke execute on function private.despesa_de_fechamento_so_pelo_fechamento() from public, anon, authenticated;

-- O Realtime não entrega mais commissions: as telas escutam o sinal.
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commissions') then
    alter publication supabase_realtime drop table public.commissions;
  end if;
end
$$;

notify pgrst, 'reload schema';
