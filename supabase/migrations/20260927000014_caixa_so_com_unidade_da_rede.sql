-- A unidade (rótulo) de uma caixa de WhatsApp tem de ser DA MESMA REDE.
--
-- `definir_vinculos_do_numero` já conferia, mas os dois caminhos que CRIAM a
-- caixa (`salvarNumeroWhatsApp`, `criarConexaoUazapi`) gravavam `branch_id`
-- direto do formulário. É rótulo, não escopo (§9.8.0) — mas um rótulo com a
-- unidade de outra clínica exibiria o nome dela onde a caixa aparece.
--
-- A garantia vai para o banco, como as outras regras de caixa: uma chave
-- composta (branch_id, tenant_id) → branches(id, tenant_id). Nenhum caminho
-- novo de escrita consegue esquecê-la. `SET NULL (branch_id)` mantém o que a
-- FK antiga fazia ao apagar a unidade sem zerar o `tenant_id` (NOT NULL).

create unique index if not exists branches_id_tenant_id_key on public.branches (id, tenant_id);

alter table public.whatsapp_numbers drop constraint if exists whatsapp_numbers_branch_id_fkey;
alter table public.whatsapp_numbers
  add constraint whatsapp_numbers_branch_da_rede
  foreign key (branch_id, tenant_id) references public.branches (id, tenant_id)
  on delete set null (branch_id);
