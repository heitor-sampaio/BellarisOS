-- A sessão só LÊ — e o dado de um módulo, só com o módulo (CLAUDE.md §4,
-- F63: "Configuração e dado sensível: a sessão só LÊ"; varredura de
-- conformidade de 18/11: ATD-P01, ATD-P02, ATD-E01, AUT-01).
--
-- A chave pública está no navegador: o que uma política deixa a sessão
-- fazer, qualquer membro faz direto no PostgREST, sem o assertPermission da
-- action. Até aqui, pela chave pública:
--  - PRONTUÁRIO (medical_records, medical_record_entries, injectable_maps,
--    injectable_applications): ALL para qualquer membro da rede — quem não
--    tem o Prontuário lia a evolução e a ficha de saúde, trocava a evolução
--    do atendimento concluído sem versão (PR2b: só prontuario_corrigir_registro)
--    e apagava registros (§14: nada clínico se apaga);
--  - PROCEDIMENTOS (procedures, procedure_products): qualquer membro da rede
--    criava, mudava o preço (sem o histórico de preço) e apagava;
--  - PRODUTOS (products): ALL dentro da unidade, sem o Estoque;
--  - AUTOMAÇÕES (domain_events, automation_runs, automation_run_steps,
--    automations, automation_versions): qualquer membro da rede lia a
--    corrente inteira — inclusive o texto das mensagens recebidas
--    (conversa.mensagem_recebida), que o "só os meus" do CRM esconde.
--
-- Todo o código já grava (e lê o prontuário e as automações) pelo cliente
-- de serviço, depois da trava da action. O que fica pela sessão:
--  - prontuário: NADA, nem com o Prontuário. É módulo ESCOPÁVEL ("só os
--    meus", SCOPED_MODULES), e a RLS não aplica o escopo: "Toda leitura de
--    módulo escopável passa ownerFilter" (CLAUDE.md §11) e "Realtime de tela
--    que mostra dado com escopo assina um SINAL, não a tabela" (§4). Como as
--    comissões (20261112006302): sem política, a tabela fecha. A tela do
--    atendimento escuta prontuario_sinais (20261124400001) e recarrega pelo
--    servidor; as restritivas do suporte ficam (segunda parede);
--  - procedimentos e produtos: a leitura de antes (o catálogo e o Realtime);
--  - automações: quem tem as Automações e "A rede inteira" (o portal delas).
--    As telas escutam automacoes_sinais (20261124400001).
--
-- RESTRITIVA: aplicar DEPOIS do deploy do código que assina
-- automacoes_sinais e prontuario_sinais — o código de antes assina
-- domain_events, automation_runs e medical_record_entries, que saem do
-- Realtime aqui.

-- ─── Prontuário: nenhuma política para a sessão ─────────────────────────
drop policy if exists "Operacional acessa prontuários" on public.medical_records;
drop policy if exists medical_record_entries_operacional on public.medical_record_entries;
drop policy if exists injectable_maps_all on public.injectable_maps;
drop policy if exists injectable_maps_select on public.injectable_maps;
drop policy if exists injectable_maps_insert on public.injectable_maps;
drop policy if exists injectable_maps_update on public.injectable_maps;
drop policy if exists injectable_maps_delete on public.injectable_maps;
drop policy if exists injectable_applications_all on public.injectable_applications;

-- ─── Procedimentos ──────────────────────────────────────────────────────
-- A leitura (procedures_select, procedure_products_select) fica como está.
drop policy if exists procedures_insert on public.procedures;
drop policy if exists procedures_update on public.procedures;
drop policy if exists procedures_delete on public.procedures;
drop policy if exists procedure_products_insert on public.procedure_products;
drop policy if exists procedure_products_update on public.procedure_products;
drop policy if exists procedure_products_delete on public.procedure_products;

-- ─── Produtos ───────────────────────────────────────────────────────────
-- O ALL vira só a leitura (a mesma condição; tabela do Realtime: to authenticated).
drop policy if exists "Operacional acessa estoque da filial" on public.products;
create policy products_select on public.products
  for select to authenticated
  using (jwt_claim('role') <> 'CLIENT' and private.can_access_branch(branch_id));

-- ─── Automações ─────────────────────────────────────────────────────────
drop policy if exists domain_events_select on public.domain_events;
create policy domain_events_leitura on public.domain_events
  for select to authenticated
  using (
    (tenant_id)::text = jwt_claim('tenant_id')
    and (select private.sessao_ve_o_modulo('automations', 'automacoes', true))
  );

drop policy if exists automation_runs_leitura on public.automation_runs;
create policy automation_runs_leitura on public.automation_runs
  for select to authenticated
  using (
    (tenant_id)::text = jwt_claim('tenant_id')
    and (select private.sessao_ve_o_modulo('automations', 'automacoes', true))
  );

drop policy if exists automation_run_steps_leitura on public.automation_run_steps;
create policy automation_run_steps_leitura on public.automation_run_steps
  for select to authenticated
  using (
    exists (select 1 from public.automation_runs r
             where r.id = automation_run_steps.run_id
               and (r.tenant_id)::text = jwt_claim('tenant_id'))
    and (select private.sessao_ve_o_modulo('automations', 'automacoes', true))
  );

drop policy if exists automations_leitura on public.automations;
create policy automations_leitura on public.automations
  for select to authenticated
  using (
    (tenant_id)::text = jwt_claim('tenant_id')
    and (select private.sessao_ve_o_modulo('automations', 'automacoes', true))
  );

drop policy if exists automation_versions_leitura on public.automation_versions;
create policy automation_versions_leitura on public.automation_versions
  for select to authenticated
  using (
    (tenant_id)::text = jwt_claim('tenant_id')
    and (select private.sessao_ve_o_modulo('automations', 'automacoes', true))
  );

-- O Realtime não entrega mais a corrente, as execuções nem a evolução (a
-- linha inteira ia pelo websocket): as telas escutam automacoes_sinais e
-- prontuario_sinais.
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'domain_events') then
    alter publication supabase_realtime drop table public.domain_events;
  end if;
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'automation_runs') then
    alter publication supabase_realtime drop table public.automation_runs;
  end if;
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'medical_record_entries') then
    alter publication supabase_realtime drop table public.medical_record_entries;
  end if;
end
$$;

notify pgrst, 'reload schema';
