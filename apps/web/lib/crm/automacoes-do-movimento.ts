import 'server-only'
import { EVENTOS } from '@estetica-os/types'
import type { DadosDeLead, GrafoDeAutomacao, NomeDeEvento, TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { temRecurso } from '@/lib/auth'
import { eventoDoDesfecho } from '@/lib/events/lead'
import { gatilhoCasa } from '@/lib/automacoes/gatilho-casa'
import type { EventoDoGatilho } from '@/lib/automacoes/contexto'

/**
 * "Mover dispara a automação “X”. Disparar?" (A35 da 22ª; o Heitor,
 * 2026-11-17 e 2026-11-18: "Também ao arrastar um"). Antes de mover pela tela
 * — um card ou as N de uma etapa —, quais automações LIGADAS aquela mudança
 * dispararia: as que assinam o movimento (e o ganho ou a perda, quando o
 * destino é de desfecho) e cujo gatilho CASA com o fato — o funil e a etapa de
 * destino, os filtros do gatilho —, pela mesma régua do despacho
 * (`gatilhoCasa`). A tela pergunta só quando há alguma.
 */

/** As colunas do card que a previsão lê (as mesmas do retrato do evento e da hidratação do lead). */
export const COLUNAS_DO_CARD_PARA_PREVER =
  'id, branch_id, name, phone, email, client_id, source, owner_id, crm_stage_id, tags, value, crm_stages(name)'

export interface CardParaPrever {
  id: string
  branch_id: string | null
  name: string | null
  phone: string | null
  client_id: string | null
  source: string | null
  crm_stage_id: string | null
  crm_stages?: { name?: string | null } | { name?: string | null }[] | null
  [coluna: string]: unknown
}

export interface DestinoDoMovimento { id: string; nome: string | null; desfecho: string | null; funilNome: string | null }

const nomeDaEtapa = (c: CardParaPrever) =>
  (Array.isArray(c.crm_stages) ? c.crm_stages[0]?.name : c.crm_stages?.name) ?? null

/**
 * O fato que o movimento emitiria (`emitirEventoDeLead`): o retrato do card
 * já no destino, com a etapa de onde saiu.
 */
export function eventoPrevistoDoMovimento(
  nome: NomeDeEvento, card: CardParaPrever, para: DestinoDoMovimento, atorNome: string | null,
): EventoDoGatilho {
  const dados: DadosDeLead = {
    nome: card.name ?? null,
    telefone: card.phone ?? null,
    clienteId: card.client_id ?? null,
    funilNome: para.funilNome,
    etapaNome: para.nome,
    desfecho: para.desfecho,
    origemDoLead: card.source ?? null,
  }
  const de = nomeDaEtapa(card)
  if (de) dados.deEtapaNome = de
  return {
    id: 'previa', nome, entidade: 'lead', entidadeId: card.id,
    dados: dados as unknown as Record<string, unknown>,
    atorNome, atorTipo: 'usuario', origem: 'app',
    ocorridoEm: new Date().toISOString(), branchId: card.branch_id ?? null,
  }
}

/**
 * Os nomes das automações que mover estes cards para `paraStageId` dispararia.
 * Vazio quando nada dispararia: sem as automações no plano, na sessão de
 * suporte (o fato não vai ao motor, `emitirEvento`), card que já está lá.
 */
export async function automacoesQueOMovimentoDispara(
  ctx: TenantContext, cards: CardParaPrever[], paraStageId: string,
): Promise<string[]> {
  if (!ctx.tenantId || ctx.suporte || !temRecurso(ctx, 'automacoes')) return []
  const vaoMudar = cards.filter(c => c.crm_stage_id !== paraStageId)
  if (!vaoMudar.length) return []
  const admin = createAdminClient()

  const etapa = await ler(admin.from('crm_stages').select('id, name, outcome, crm_funnels(name)')
    .eq('id', paraStageId).eq('tenant_id', ctx.tenantId).maybeSingle(), 'ler a etapa de destino') as
    { id: string; name: string | null; outcome: string | null; crm_funnels?: { name?: string } | { name?: string }[] | null } | null
  if (!etapa) return []
  const funil = Array.isArray(etapa.crm_funnels) ? etapa.crm_funnels[0] : etapa.crm_funnels
  const para: DestinoDoMovimento = { id: etapa.id, nome: etapa.name ?? null, desfecho: etapa.outcome ?? null, funilNome: funil?.name ?? null }

  const desfecho = eventoDoDesfecho(para.desfecho)
  const eventos: NomeDeEvento[] = [EVENTOS.LEAD_ETAPA_MUDOU, ...(desfecho ? [desfecho] : [])]
  const ligadas = await ler(admin.from('automations').select('id, nome, gatilhos, grafo')
    .eq('tenant_id', ctx.tenantId).eq('status', 'ATIVA').overlaps('gatilhos', eventos)
    .order('nome'), 'ler as automações do movimento') as
    { id: string; nome: string; gatilhos: string[] | null; grafo: GrafoDeAutomacao }[] | null
  if (!ligadas?.length) return []

  // O card hidratado (`lead.*` no filtro) é lido antes de mudar: no fato real,
  // ele já está no destino.
  const noDestino = (contexto: Record<string, unknown>) => {
    const lead = contexto.lead as Record<string, unknown> | null | undefined
    if (lead && typeof lead === 'object') { lead.etapaId = para.id; lead.etapa = para.nome }
  }

  const nomes: string[] = []
  for (const a of ligadas) {
    const dela = eventos.filter(e => (a.gatilhos ?? []).includes(e))
    let casa = false
    for (const nome of dela) {
      for (const card of vaoMudar) {
        const evento = eventoPrevistoDoMovimento(nome, card, para, ctx.userName || null)
        if (await gatilhoCasa(a.grafo, evento, ctx.tenantId, { ajustar: noDestino, rotulo: a.id })) { casa = true; break }
      }
      if (casa) break
    }
    if (casa) nomes.push(a.nome)
  }
  return nomes
}
