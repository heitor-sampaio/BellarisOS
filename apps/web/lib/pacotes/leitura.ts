import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { composicaoDoPacote, type ItemDoPacote } from './rateio'
import type { PacoteAVenda } from '@/components/shared/vender-pacote'

export interface ItemDoCatalogo { procedureId: string; procedureName: string; quantidade: number; precoTabela: number }

export interface PacoteDoCatalogoLido {
  id: string; name: string; price: number; totalSessions: number; validityDays: number | null
  isActive: boolean; itens: ItemDoCatalogo[]; composicao: string
}

/** O catálogo de pacotes: da rede (e os da unidade, quando houver), com os itens. */
export async function catalogoDePacotes(tenantId: string, opcoes: { branchId?: string | null; soAtivos?: boolean } = {}): Promise<PacoteDoCatalogoLido[]> {
  let q = createAdminClient().from('service_packages')
    .select('id, name, price, total_sessions, validity_days, is_active, service_package_items(procedure_id, quantity, sort_order, procedures(name, price))')
    .eq('tenant_id', tenantId)
  if (opcoes.soAtivos) q = q.eq('is_active', true)
  if (opcoes.branchId) q = q.or(`branch_id.is.null,branch_id.eq.${opcoes.branchId}`)
  const linhas = await ler(q.order('name'), 'carregar o catálogo de pacotes')
  return ((linhas ?? []) as unknown as {
    id: string; name: string; price: number; total_sessions: number; validity_days: number | null; is_active: boolean
    service_package_items: { procedure_id: string; quantity: number; sort_order: number; procedures: { name: string; price: number | null } | null }[]
  }[]).map(p => {
    const itens = [...(p.service_package_items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(i => ({
      procedureId: i.procedure_id, procedureName: i.procedures?.name ?? '—',
      quantidade: i.quantity, precoTabela: Number(i.procedures?.price ?? 0),
    }))
    return {
      id: p.id, name: p.name, price: Number(p.price), totalSessions: p.total_sessions,
      validityDays: p.validity_days, isActive: p.is_active, itens, composicao: composicaoDoPacote(itens),
    }
  })
}

/** O que a ficha oferece para vender: os ativos, ao alcance da unidade. */
export async function pacotesAVenda(tenantId: string, branchId: string | null): Promise<PacoteAVenda[]> {
  if (!branchId) return []
  return (await catalogoDePacotes(tenantId, { branchId, soAtivos: true })).map(p => ({
    id: p.id, name: p.name, price: p.price, totalSessions: p.totalSessions,
    composicao: p.composicao, validityDays: p.validityDays,
  }))
}

/** Os itens de um pacote para o rateio da venda (preço de tabela ATUAL de cada procedimento). */
export async function itensParaRateio(tenantId: string, pacoteId: string): Promise<ItemDoPacote[]> {
  const linhas = await ler(createAdminClient().from('service_package_items')
    .select('procedure_id, quantity, sort_order, procedures(price)')
    .eq('tenant_id', tenantId).eq('package_id', pacoteId).order('sort_order'), 'ler os itens do pacote')
  return ((linhas ?? []) as unknown as { procedure_id: string; quantity: number; procedures: { price: number | null } | null }[])
    .map(i => ({ procedureId: i.procedure_id, quantidade: i.quantity, precoTabela: Number(i.procedures?.price ?? 0) }))
}
