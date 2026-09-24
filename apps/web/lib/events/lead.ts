import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import { EVENTOS } from '@estetica-os/types'
import type { NomeDeEvento, AtorDoEvento, OrigemDeEvento, DadosDeLead } from '@estetica-os/types'
import { ler } from '@/lib/db'

/**
 * Emite um evento do funil com o retrato do card.
 *
 * **Mover para uma etapa de desfecho emite DOIS eventos**: o
 * `lead.etapa_mudou`, que descreve o movimento, e o `lead.ganho` ou
 * `lead.perdido`, que descreve o que aconteceu. Não é redundância: uma
 * automação de "avisar o dono quando o card sai da coluna X" quer o primeiro,
 * e uma de "pedir avaliação quando fechar" quer o segundo — e obrigá-la a ler
 * o `outcome` da etapa para descobrir seria devolver ao motor o trabalho que
 * este catálogo existe para poupar.
 */
export async function emitirEventoDeLead(
  nome: NomeDeEvento,
  leadId: string,
  ctx: { tenantId?: string | null; internalUserId?: string | null; userName?: string | null },
  extras?: {
    deEtapaNome?: string | null
    ator?: AtorDoEvento
    origem?: OrigemDeEvento
    /** Quantas automações houve antes deste fato — o anti-loop do motor. */
    profundidade?: number
  },
): Promise<void> {
  try {
    if (!ctx.tenantId) return
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('leads')
      .select(`
        id, branch_id, name, phone, client_id, source,
        crm_stages(name, outcome, crm_funnels(name))
      `)
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()

    if (error) console.error('[eventoDeLead] retrato:', error.message)

    const etapa = data?.crm_stages as unknown as
      { name?: string; outcome?: string; crm_funnels?: { name?: string } | { name?: string }[] } | null
    const funil = Array.isArray(etapa?.crm_funnels) ? etapa?.crm_funnels[0] : etapa?.crm_funnels

    const dados: DadosDeLead = {
      nome:         (data?.name  as string) ?? null,
      telefone:     (data?.phone as string) ?? null,
      clienteId:    (data?.client_id as string) ?? null,
      funilNome:    funil?.name   ?? null,
      etapaNome:    etapa?.name   ?? null,
      desfecho:     etapa?.outcome ?? null,
      origemDoLead: (data?.source as string) ?? null,
    }
    if (extras?.deEtapaNome) dados.deEtapaNome = extras.deEtapaNome

    await emitirEvento(nome, {
      tenantId:   ctx.tenantId,
      branchId:   (data?.branch_id as string) ?? null,
      entidadeId: leadId,
      dados,
      ator:       extras?.ator ?? (ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA),
      origem:       extras?.origem ?? 'app',
      profundidade: extras?.profundidade,
      // Só a criação é única. Um card entra e sai da mesma etapa várias vezes,
      // e pode ser reaberto depois de ganho — cada passagem é um fato novo.
      chave: nome === EVENTOS.LEAD_CRIADO ? `${nome}:${leadId}` : undefined,
    })
  } catch (e) {
    console.error('[eventoDeLead]', nome, (e as Error).message)
  }
}

/** O evento de desfecho que uma etapa dispara, quando dispara algum. */
export function eventoDoDesfecho(outcome: string | null | undefined): NomeDeEvento | null {
  if (outcome === 'WON')  return EVENTOS.LEAD_GANHO
  if (outcome === 'LOST') return EVENTOS.LEAD_PERDIDO
  return null
}

/**
 * Nome e desfecho de uma etapa, numa consulta só.
 *
 * Os dois vêm juntos porque quem move um card precisa dos dois ao mesmo tempo:
 * o nome para dizer de onde saiu, o desfecho para saber se além do movimento
 * houve um ganho ou uma perda.
 */
export async function etapaDeCrm(
  tenantId: string,
  stageId: string | null | undefined,
): Promise<{ nome: string | null; desfecho: string | null }> {
  if (!stageId) return { nome: null, desfecho: null }
  try {
    const data = await ler(createAdminClient()
      .from('crm_stages')
      .select('name, outcome')
      .eq('id', stageId)
      .eq('tenant_id', tenantId)
      .maybeSingle(), 'buscar a etapa')
    return { nome: (data?.name as string) ?? null, desfecho: (data?.outcome as string) ?? null }
  } catch {
    return { nome: null, desfecho: null }
  }
}
