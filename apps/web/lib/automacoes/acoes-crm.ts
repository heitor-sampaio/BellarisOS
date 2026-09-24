import { createAdminClient } from '@/lib/supabase/admin'
import { registrarEventoLead } from '@/lib/lead-events'
import { emitirEventoDeLead, eventoDoDesfecho, etapaDeCrm } from '@/lib/events/lead'
import { emitirEventoDeCliente } from '@/lib/events/cliente'
import { EVENTOS } from '@estetica-os/types'
import type { OrigemDeEvento, AtorDoEvento } from '@estetica-os/types'
import type { ContextoDaExecucao } from './contexto'
import { ler } from '@/lib/db'

/**
 * As ações que mexem no CRM.
 *
 * Todas fazem a MESMA coisa que a tela faz, pelos mesmos caminhos: mover uma
 * etapa também grava a linha do tempo do card e emite os eventos, como
 * `updateLeadStage` faz. Uma ação que só trocasse a coluna no banco deixaria o
 * histórico do card mentindo sobre como ele chegou ali.
 *
 * ⚠️ **Todo evento emitido daqui leva `origem: 'automacao'` e a profundidade
 * adiante.** É o que segura o anel: sem isso, mover de etapa dispara
 * `lead.etapa_mudou`, que dispara a automação de novo, que move de etapa.
 */

export interface AtorDaAutomacao {
  tenantId:     string
  automacaoId:  string
  nome:         string
  profundidade: number
}

/** O ator, para a corrente de eventos: a automação, não uma pessoa. */
function ctxDaAutomacao(ator: AtorDaAutomacao) {
  return {
    tenantId:       ator.tenantId,
    internalUserId: null,
    userName:       `Automação · ${ator.nome}`,
  }
}

const extras = (ator: AtorDaAutomacao): {
  origem: OrigemDeEvento
  profundidade: number
  ator: AtorDoEvento
} => ({
  origem:       'automacao',
  profundidade: ator.profundidade + 1,
  ator:         { id: null, nome: `Automação · ${ator.nome}`, tipo: 'sistema' },
})

function leadDo(contexto: ContextoDaExecucao): string | null {
  return (contexto.lead as { id?: string } | null)?.id ?? null
}

function clienteDo(contexto: ContextoDaExecucao): string | null {
  return (contexto.cliente as { id?: string } | null)?.id ?? null
}

/** Move a oportunidade de etapa — com linha do tempo e eventos, como a tela. */
export async function moverDeEtapa(
  ator: AtorDaAutomacao,
  contexto: ContextoDaExecucao,
  etapaId: string,
): Promise<Record<string, unknown>> {
  const leadId = leadDo(contexto)
  if (!leadId) return { movido: false, motivo: 'Este fluxo não tem oportunidade no contexto.' }

  const admin = createAdminClient()

  // Antes do update: é a única chance de saber de onde o card saiu.
  const antes = await ler(admin
    .from('leads').select('crm_stage_id').eq('id', leadId).eq('tenant_id', ator.tenantId).maybeSingle(), 'buscar a oportunidade')
  const etapaAnterior = (antes?.crm_stage_id as string | null) ?? null

  if (etapaAnterior === etapaId) {
    return { movido: false, motivo: 'A oportunidade já estava nesta etapa.' }
  }

  // A etapa de destino tem de ser da MESMA rede: um id de outra clínica moveria
  // o card para um funil que ninguém desta vê.
  const destino = await etapaDeCrm(ator.tenantId, etapaId)
  if (!destino.nome) return { movido: false, motivo: 'Etapa não encontrada nesta rede.' }

  const { error } = await admin
    .from('leads').update({ crm_stage_id: etapaId })
    .eq('id', leadId).eq('tenant_id', ator.tenantId)

  if (error) throw new Error(`Não consegui mover a oportunidade: ${error.message}`)

  const ctx = ctxDaAutomacao(ator)
  const de  = await etapaDeCrm(ator.tenantId, etapaAnterior)

  await registrarEventoLead({
    tenantId:    ator.tenantId,
    leadId,
    type:        'STAGE_CHANGED',
    fromStageId: etapaAnterior,
    toStageId:   etapaId,
    actorName:   `Automação · ${ator.nome}`,
  })

  await emitirEventoDeLead(EVENTOS.LEAD_ETAPA_MUDOU, leadId, ctx, {
    deEtapaNome: de.nome, ...extras(ator),
  })

  // Chegar numa etapa de desfecho emite TAMBÉM o ganho ou o perdido — são
  // eventos próprios, não `etapa_mudou` com um campo.
  const evento = eventoDoDesfecho(destino.desfecho)
  if (evento) await emitirEventoDeLead(evento, leadId, ctx, { deEtapaNome: de.nome, ...extras(ator) })

  return { movido: true, de: de.nome, para: destino.nome }
}

/**
 * Marca ganho ou perdido.
 *
 * Não grava um campo: move para a etapa de desfecho do funil em que o card
 * está, que é como o sistema representa isso. Funil sem etapa de ganho é
 * configuração faltando, e a ação diz isso em vez de inventar uma.
 */
export async function marcarDesfecho(
  ator: AtorDaAutomacao,
  contexto: ContextoDaExecucao,
  desfecho: 'ganho' | 'perdido',
): Promise<Record<string, unknown>> {
  const leadId = leadDo(contexto)
  if (!leadId) return { marcado: false, motivo: 'Este fluxo não tem oportunidade no contexto.' }

  const admin = createAdminClient()

  const lead = await ler(admin
    .from('leads').select('crm_stage_id').eq('id', leadId).eq('tenant_id', ator.tenantId).maybeSingle(), 'buscar a oportunidade')

  const atual = await ler(admin
    .from('crm_stages').select('funnel_id').eq('id', lead?.crm_stage_id ?? '').maybeSingle(), 'buscar a etapa')

  if (!atual) return { marcado: false, motivo: 'A oportunidade não está em nenhum funil.' }

  const etapas = await ler(admin
    .from('crm_stages').select('id, name, outcome')
    .eq('funnel_id', atual.funnel_id)
    .eq('outcome', desfecho)
    .limit(1), 'carregar as etapas')

  const destino = etapas?.[0]
  if (!destino) {
    return { marcado: false, motivo: `Este funil não tem etapa de "${desfecho}".` }
  }

  const r = await moverDeEtapa(ator, contexto, destino.id as string)
  return { ...r, desfecho }
}

/** Adiciona ou remove uma tag do cliente. */
export async function mudarTagDoCliente(
  ator: AtorDaAutomacao,
  contexto: ContextoDaExecucao,
  tag: string,
  modo: 'adicionar' | 'remover',
): Promise<Record<string, unknown>> {
  const clienteId = clienteDo(contexto)
  if (!clienteId) return { alterado: false, motivo: 'Este fluxo não tem cliente no contexto.' }

  const limpa = tag.trim()
  if (!limpa) throw new Error('Nenhuma tag escolhida.')

  const admin = createAdminClient()
  const cliente = await ler(admin
    .from('clients').select('tags').eq('id', clienteId).eq('tenant_id', ator.tenantId).maybeSingle(), 'buscar o cliente')

  if (!cliente) return { alterado: false, motivo: 'Cliente não encontrado.' }

  const atuais = (cliente.tags as string[] | null) ?? []
  const tem    = atuais.includes(limpa)

  // Nada a fazer é um FATO, não um erro: adicionar uma tag que já está lá não
  // deveria pintar o passo de vermelho nem emitir "dados alterados".
  if (modo === 'adicionar' && tem)  return { alterado: false, motivo: 'O cliente já tinha esta tag.' }
  if (modo === 'remover'   && !tem) return { alterado: false, motivo: 'O cliente não tinha esta tag.' }

  const novas = modo === 'adicionar' ? [...atuais, limpa] : atuais.filter(t => t !== limpa)

  const { error } = await admin
    .from('clients').update({ tags: novas }).eq('id', clienteId).eq('tenant_id', ator.tenantId)

  if (error) throw new Error(`Não consegui alterar as tags: ${error.message}`)

  await emitirEventoDeCliente(EVENTOS.CLIENTE_DADOS_ALTERADOS, clienteId, ctxDaAutomacao(ator), {
    alterou: ['tags'],
    ...extras(ator),
  })

  return { alterado: true, tag: limpa, modo }
}

/** Define (ou tira) o responsável pela oportunidade. */
export async function definirResponsavel(
  ator: AtorDaAutomacao,
  contexto: ContextoDaExecucao,
  usuarioId: string | null,
): Promise<Record<string, unknown>> {
  const leadId = leadDo(contexto)
  if (!leadId) return { atribuido: false, motivo: 'Este fluxo não tem oportunidade no contexto.' }

  const admin = createAdminClient()

  let nome: string | null = null
  if (usuarioId) {
    // O responsável tem de ser da REDE. Sem esta conferência, um id de outra
    // clínica viraria dono de um card que essa pessoa nunca vai ver.
    const membro = await ler(admin
      .from('users').select('id, name').eq('id', usuarioId).eq('tenant_id', ator.tenantId).maybeSingle(), 'buscar o usuário')
    if (!membro) return { atribuido: false, motivo: 'Pessoa não encontrada nesta rede.' }
    nome = membro.name as string
  }

  const { error } = await admin
    .from('leads').update({ owner_id: usuarioId }).eq('id', leadId).eq('tenant_id', ator.tenantId)

  if (error) throw new Error(`Não consegui definir o responsável: ${error.message}`)

  await registrarEventoLead({
    tenantId:  ator.tenantId,
    leadId,
    type:      'OWNER_CHANGED',
    actorName: `Automação · ${ator.nome}`,
    changes:   [{ campo: 'Responsável', de: null, para: nome }],
  })

  return { atribuido: true, responsavel: nome ?? 'ninguém' }
}
