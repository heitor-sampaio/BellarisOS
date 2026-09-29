import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import {
  configDaLinha, linhasDaComissao, precoDaSessaoDePacote,
  type ConfigDeComissao, type RegraDeComissao, type TaxaDePagamento, type TipoDeRegra, type MetodoComTaxa,
  type ItemExecutado, type LinhaDeComissao,
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

/**
 * As linhas de comissão de um atendimento que está sendo concluído, com a base
 * de cada procedimento lida AQUI, no servidor:
 * - avulso: o preço do atendimento;
 * - sessão de plano: cada procedimento da sessão, com o preço dele no plano
 *   (antes a regra do primeiro procedimento valia sobre a sessão inteira);
 * - sessão de pacote: preço do pacote ÷ sessões (antes, o preço que o
 *   navegador mandou ao agendar).
 */
export async function linhasDoAtendimento(tenantId: string, appt: {
  id: string; procedure_id: string | null; professional_id: string; price: number; treatment_plan_id: string | null
}): Promise<LinhaDeComissao[]> {
  const admin = createAdminClient()
  const regras = (await regrasDaRede(tenantId, appt.professional_id)).get(appt.professional_id) ?? []
  if (!regras.length) return []

  if (appt.treatment_plan_id) {
    const sessao = await ler(admin.from('treatment_plan_sessions')
      .select('id, treatment_plan_session_procedures(procedure_id, price, sort_order)')
      .eq('plan_id', appt.treatment_plan_id).eq('appointment_id', appt.id).maybeSingle(), 'buscar a sessão do plano')
    const procs = ((sessao?.treatment_plan_session_procedures ?? []) as { procedure_id: string; price: number; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order)
    const itens: ItemExecutado[] = procs.length
      ? procs.map(p => ({ procedure_id: p.procedure_id, preco: Number(p.price) }))
      : [{ procedure_id: appt.procedure_id, preco: appt.price }]
    return linhasDaComissao(itens, regras, 'PLANO', appt.treatment_plan_id)
  }

  const sessaoDePacote = await ler(admin.from('package_sessions')
    .select('client_packages!inner(service_packages!inner(price, total_sessions, procedure_id))')
    .eq('appointment_id', appt.id).maybeSingle(), 'buscar a sessão do pacote')
  const pacote = (sessaoDePacote?.client_packages as unknown as {
    service_packages: { price: number; total_sessions: number; procedure_id: string | null } | null
  } | null)?.service_packages
  if (pacote) {
    return linhasDaComissao([{
      procedure_id: pacote.procedure_id ?? appt.procedure_id,
      preco: precoDaSessaoDePacote(Number(pacote.price), Number(pacote.total_sessions)),
    }], regras, 'PACOTE', null)
  }

  return linhasDaComissao([{ procedure_id: appt.procedure_id, preco: appt.price }], regras, 'AVULSO', null)
}
