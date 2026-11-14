import 'server-only'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { precosDaUnidade, precoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'
import { composicaoDoPacote, type ItemDoPacote } from './rateio'
import type { PacoteAVenda } from '@/components/shared/vender-pacote'
import { comissaoDoPacoteDaLinha, type ComissaoDoPacote } from '@/lib/comissoes/config'

export interface ItemDoCatalogo { procedureId: string; procedureName: string; quantidade: number; precoTabela: number }

export interface PacoteDoCatalogoLido {
  id: string; name: string; price: number; totalSessions: number; validityDays: number | null
  isActive: boolean; itens: ItemDoCatalogo[]; composicao: string
  /** A comissão de venda e de execução do pacote (2026-10-30). */
  comissao: ComissaoDoPacote
  /** Os documentos puxados dos procedimentos que a rede tirou deste pacote (DC1c). */
  documentosExcluidos: string[]
}

/** O catálogo de pacotes: da rede (e os da unidade, quando houver), com os itens. */
export async function catalogoDePacotes(tenantId: string, opcoes: { branchId?: string | null; soAtivos?: boolean } = {}): Promise<PacoteDoCatalogoLido[]> {
  let q = createAdminClient().from('service_packages')
    .select('id, name, price, total_sessions, validity_days, is_active, comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor, comissao_responsavel_tipo, comissao_responsavel_valor, documentos_excluidos, service_package_items(procedure_id, quantity, sort_order, procedures(name, price))')
    .eq('tenant_id', tenantId)
    // O registro do pacote trazido de fora (F35) não é do catálogo.
    .eq('de_fora', false)
  if (opcoes.soAtivos) q = q.eq('is_active', true)
  if (opcoes.branchId) q = q.or(`branch_id.is.null,branch_id.eq.${opcoes.branchId}`)
  // Com a unidade, a tabela de cada item é a DELA (D2 da 9ª): o pacote
  // equivalente do checkout compara com o preço que o plano tem ali.
  const [linhas, daUnidade] = await Promise.all([
    ler(q.order('name'), 'carregar o catálogo de pacotes'),
    precosDaUnidade(createAdminClient(), opcoes.branchId),
  ])
  return ((linhas ?? []) as unknown as {
    id: string; name: string; price: number; total_sessions: number; validity_days: number | null; is_active: boolean
    comissao_venda_tipo: string | null; comissao_venda_valor: number | null; comissao_execucao: string; comissao_execucao_valor: number | null
    comissao_responsavel_tipo: string | null; comissao_responsavel_valor: number | null
    documentos_excluidos: string[] | null
    service_package_items: { procedure_id: string; quantity: number; sort_order: number; procedures: { name: string; price: number | null } | null }[]
  }[]).map(p => {
    const itens = [...(p.service_package_items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(i => ({
      procedureId: i.procedure_id, procedureName: i.procedures?.name ?? '—',
      quantidade: i.quantity, precoTabela: precoNaUnidade(i.procedures?.price, daUnidade.get(i.procedure_id)),
    }))
    return {
      id: p.id, name: p.name, price: Number(p.price), totalSessions: p.total_sessions,
      validityDays: p.validity_days, isActive: p.is_active, itens, composicao: composicaoDoPacote(itens),
      comissao: comissaoDoPacoteDaLinha(p),
      documentosExcluidos: p.documentos_excluidos ?? [],
    }
  })
}

/** O que a ficha oferece para vender: os ativos, ao alcance da unidade. */
export async function pacotesAVenda(tenantId: string, branchId: string | null): Promise<PacoteAVenda[]> {
  if (!branchId) return []
  // Pacotes fora do PLANO da rede: nada a oferecer (lib/planos/recursos.ts).
  if (!(await redeTemRecurso(tenantId, 'pacotes'))) return []
  return (await catalogoDePacotes(tenantId, { branchId, soAtivos: true })).map(p => ({
    id: p.id, name: p.name, price: p.price, totalSessions: p.totalSessions,
    composicao: p.composicao, validityDays: p.validityDays,
    // com-04: o pacote paga quem atende sobre o valor dele — a venda pede a responsável.
    pedeResponsavel: p.comissao.execucao.tipo === 'PACOTE',
    // A18 da 12ª: o "De venda" do pacote, dito no Vender.
    comissaoVenda: p.comissao.venda,
  }))
}

/**
 * Os itens de um pacote para o rateio da venda: o preço de tabela ATUAL de cada
 * procedimento NA UNIDADE da venda (D2 da 9ª: o preço por unidade vale em todo
 * caminho de preço; sem preço próprio, o da rede).
 */
export async function itensParaRateio(tenantId: string, pacoteId: string, branchId?: string | null): Promise<ItemDoPacote[]> {
  const admin = createAdminClient()
  const [linhas, daUnidade] = await Promise.all([
    ler(admin.from('service_package_items')
      .select('procedure_id, quantity, sort_order, procedures(price)')
      .eq('tenant_id', tenantId).eq('package_id', pacoteId).order('sort_order'), 'ler os itens do pacote'),
    precosDaUnidade(admin, branchId),
  ])
  return ((linhas ?? []) as unknown as { procedure_id: string; quantity: number; procedures: { price: number | null } | null }[])
    .map(i => ({ procedureId: i.procedure_id, quantidade: i.quantity, precoTabela: precoNaUnidade(i.procedures?.price, daUnidade.get(i.procedure_id)) }))
}
