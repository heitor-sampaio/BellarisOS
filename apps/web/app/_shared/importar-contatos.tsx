import { getTenantContext, assertAnyPermission, can, temRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { seedDefaultFunnel, listAllStages } from '@/lib/crm/funis'
import { podeTrocarResponsavel } from '@/lib/crm/responsavel'
import { ImportadorDeContatos } from '@/components/branch/importador-de-contatos'

/**
 * O corpo da aba Configurações → Importações (2026-10-13), dividido pelos dois
 * portais: na rede escolhe-se a unidade dos clientes; na unidade, importa-se
 * para ela. Cada destino aparece só para quem tem o módulo dele em
 * Gerenciar (clientes → `clients`, contatos → `crm`), e a oportunidade, para
 * quem tem o CRM e o recurso do plano.
 */
export async function ImportarContatos({ unidadeFixa }: {
  /** No portal da unidade: a unidade dos clientes, sem escolha. */
  unidadeFixa: { id: string; nome: string } | null
}) {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, ['clients', 'crm'], 'MANAGE')
  const admin = createAdminClient()

  const podeClientes = can(ctx, 'clients', 'MANAGE')
  const podeContatos = can(ctx, 'crm', 'MANAGE')
  const podeOportunidade = podeContatos && temRecurso(ctx, 'oportunidades')

  // A unidade: a da sessão vence (quem é de unidade só importa para a dela).
  let unidades: { id: string; nome: string }[] = []
  if (unidadeFixa) unidades = [unidadeFixa]
  else if (ctx.branchId) {
    const b = await ler(admin.from('branches').select('id, name').eq('id', ctx.branchId).maybeSingle(), 'buscar a unidade')
    if (b) unidades = [{ id: b.id as string, nome: b.name as string }]
  } else {
    const bs = await ler(admin.from('branches').select('id, name').eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true).order('name'), 'listar as unidades') as { id: string; name: string }[] | null
    unidades = (bs ?? []).map(b => ({ id: b.id, nome: b.name }))
  }

  // A prévia resolve os nomes da planilha (etapa, responsável, procedimento)
  // com estas listas; o servidor monta as dele de novo.
  const [funis, etapas, pessoas, procedimentos] = podeOportunidade
    ? await Promise.all([
        seedDefaultFunnel(ctx.tenantId!),
        listAllStages(ctx.tenantId!),
        podeTrocarResponsavel(ctx)
          ? ler(admin.from('users').select('id, name, email').eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'listar os responsáveis')
          : Promise.resolve(null),
        ler(admin.from('procedures').select('id, name').eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'listar os procedimentos'),
      ])
    : [[], [], null, null]

  // Só funis ATIVOS (a etapa de um arquivado criaria a oportunidade fora do
  // quadro), começando pela primeira etapa do funil padrão.
  const ativos = funis.filter(f => !f.archived_at)
  const doQuadro = etapas.filter(e => ativos.some(f => f.id === e.funnel_id))
  const padrao = ativos.find(f => f.is_default) ?? ativos[0]
  const etapaPadrao = doQuadro.find(e => e.funnel_id === padrao?.id)?.id ?? doQuadro[0]?.id ?? ''

  return (
    <ImportadorDeContatos
      podeClientes={podeClientes}
      podeContatos={podeContatos}
      podeOportunidade={podeOportunidade}
      unidades={unidades}
      unidadeFixa={!!unidadeFixa || !!ctx.branchId}
      funis={ativos.map(f => ({ id: f.id, name: f.name }))}
      etapas={doQuadro.map(e => ({ id: e.id, funnel_id: e.funnel_id, name: e.name }))}
      etapaPadrao={etapaPadrao}
      responsaveis={(pessoas as { id: string; name: string; email: string | null }[] | null) ?? null}
      procedimentos={(procedimentos as { id: string; name: string }[] | null) ?? []}
      eu={ctx.internalUserId ?? null}
    />
  )
}
