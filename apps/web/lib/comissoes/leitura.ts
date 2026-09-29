import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import {
  configDaLinha, type ConfigDeComissao, type RegraDeComissao, type TaxaDePagamento, type TipoDeRegra, type MetodoComTaxa,
} from './config'

/** A configuração de comissões da rede (os padrões, se ela nunca salvou). */
export async function configDeComissaoDaRede(tenantId: string): Promise<ConfigDeComissao> {
  const linha = await ler(createAdminClient().from('commission_configs')
    .select('modo, desconta_insumos, desconta_taxa, base_com_pontos, periodo')
    .eq('tenant_id', tenantId).maybeSingle(), 'ler a configuração de comissões')
  return configDaLinha(linha)
}

export async function taxasDaRede(tenantId: string): Promise<TaxaDePagamento[]> {
  const linhas = await ler(createAdminClient().from('payment_fees')
    .select('metodo, parcelas, taxa_pct').eq('tenant_id', tenantId)
    .order('metodo').order('parcelas'), 'ler as taxas da maquininha')
  return (linhas ?? []).map(l => ({ metodo: l.metodo as MetodoComTaxa, parcelas: l.parcelas as number, taxa_pct: Number(l.taxa_pct) }))
}

/**
 * Quem atende clientes (ativo) e não tem comissão PADRÃO: o atendimento dele
 * termina sem comissão, e a tela avisa. Só exceções não bastam — o
 * procedimento sem exceção cairia no nada.
 */
export async function profissionaisSemComissao(tenantId: string): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminClient()
  const [membros, padroes] = await Promise.all([
    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId)
      .eq('provides_services', true).eq('is_active', true).order('name'), 'listar quem atende'),
    ler(admin.from('commission_rules').select('professional_id').eq('tenant_id', tenantId)
      .eq('is_active', true).is('procedure_id', null), 'listar as comissões padrão'),
  ])
  const comPadrao = new Set((padroes ?? []).map(p => p.professional_id as string))
  return (membros ?? []).filter(m => !comPadrao.has(m.id as string)).map(m => ({ id: m.id as string, nome: m.name as string }))
}

/**
 * Os procedimentos que podem virar exceção: o catálogo da rede e, para quem
 * tem unidade fixa, os locais da unidade; para quem é da rede, todos.
 */
export async function procedimentosParaComissao(tenantId: string, branchId: string | null): Promise<{ id: string; name: string }[]> {
  let q = createAdminClient().from('procedures').select('id, name')
    .eq('tenant_id', tenantId).eq('is_active', true)
  if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`)
  const linhas = await ler(q.order('name'), 'listar os procedimentos')
  return (linhas ?? []).map(p => ({ id: p.id as string, name: p.name as string }))
}

/** As regras ativas de cada profissional da rede (padrão + exceções). */
export async function regrasDaRede(tenantId: string, profissionalId?: string): Promise<Map<string, RegraDeComissao[]>> {
  let q = createAdminClient().from('commission_rules')
    .select('professional_id, procedure_id, type, value')
    .eq('tenant_id', tenantId).eq('is_active', true)
  if (profissionalId) q = q.eq('professional_id', profissionalId)
  const linhas = await ler(q, 'ler as regras de comissão')
  const mapa = new Map<string, RegraDeComissao[]>()
  for (const l of linhas ?? []) {
    const lista = mapa.get(l.professional_id as string) ?? []
    lista.push({ procedure_id: (l.procedure_id as string | null) ?? null, tipo: l.type as TipoDeRegra, valor: Number(l.value) })
    mapa.set(l.professional_id as string, lista)
  }
  return mapa
}
