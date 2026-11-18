import { createAdminClient } from '@/lib/supabase/admin'
import { filtroDosMembrosDaUnidade } from '@/lib/unidades/do-membro'
import { notifyUser } from '@/lib/notifications/notify'
import { registrarEventoLead } from '@/lib/lead-events'
import type { ContextoDaExecucao } from './contexto'

/**
 * As ações — o que a automação efetivamente FAZ.
 *
 * Cada uma devolve um resumo legível em vez de nada: é ele que aparece no
 * passo a passo do run e responde "para quem foi?" sem abrir o banco. Nenhuma
 * lança; quem trata o erro é o executor, que registra o passo como falho.
 *
 * ⚠️ Ação NÃO reimplementa regra de negócio. Notificar é `notifyUser`, anotar é
 * `registrarEventoLead`, mandar mensagem vai ser `resolverCanal` — os mesmos
 * caminhos que a tela usa. Uma segunda implementação divergiria no primeiro
 * ajuste e ninguém perceberia.
 */

interface AvisoParaEquipe {
  alvo:      'usuario' | 'cargo' | 'unidade' | 'responsavel'
  alvoId:    string | null
  /** Em `responsavel`: quem cuida da oportunidade do fluxo (`lead.responsavelId`). */
  responsavelId?: string | null
  /** A oportunidade do fluxo: o aviso abre o card (o "Abrir" do sino). */
  leadId?:   string | null
  titulo:    string
  corpo:     string
  automacao: string
}

/**
 * Avisa a equipe pelo sino que já existe no topbar.
 *
 * Três alvos, porque as três perguntas são reais: "avise a Ana", "avise quem é
 * recepcionista", "avise a unidade Centro". Resolver cargo e unidade em uma
 * lista de usuários é responsabilidade daqui — o node não deveria precisar
 * saber que `users.role_id` existe.
 */
export async function notificarEquipe(
  tenantId: string,
  aviso: AvisoParaEquipe,
): Promise<Record<string, unknown>> {
  const admin = createAdminClient()

  // "Quem cuida da oportunidade" (o modelo "Marque o ganho", auditoria das
  // regras, 2026-11-18): o card sem responsável não tem a quem avisar — é um
  // fato, não erro de configuração.
  if (aviso.alvo === 'responsavel' && !aviso.responsavelId) {
    return { avisados: 0, motivo: 'A oportunidade não tem responsável.' }
  }

  let q = admin.from('users').select('id, branch_id, branches(slug)').eq('tenant_id', tenantId).eq('is_active', true)

  // Alvo sem id é configuração incompleta, e LANÇA: o passo tem de aparecer
  // como falho no histórico. Devolver um resumo dizendo "não avisei" deixaria
  // o run verde, e um run verde que não fez nada é pior que um vermelho — é a
  // mentira que o passo a passo existe para não contar.
  if (aviso.alvo === 'responsavel') {
    q = q.eq('id', aviso.responsavelId!)
  } else if (aviso.alvo === 'usuario') {
    if (!aviso.alvoId) throw new Error('Nenhuma pessoa escolhida para avisar.')
    q = q.eq('id', aviso.alvoId)
  } else if (aviso.alvo === 'cargo') {
    if (!aviso.alvoId) throw new Error('Nenhum cargo escolhido para avisar.')
    q = q.eq('role_id', aviso.alvoId)
  } else if (aviso.alvoId) {
    // Unidade: quem é da unidade E quem é da rede (branch_id nulo) — este
    // último opera todas, e deixá-lo de fora faria o aviso sumir justamente
    // para quem cuida da clínica inteira.
    // D1 da 17ª: e quem tem a unidade nas outras dela (EQ1a).
    q = q.or(filtroDosMembrosDaUnidade(aviso.alvoId))
  }

  const { data, error } = await q
  if (error) throw new Error(`Não consegui achar quem avisar: ${error.message}`)

  const destinatarios = (data ?? []) as unknown as { id: string; branch_id?: string | null; branches?: { slug?: string } | null }[]
  if (!destinatarios.length) return { avisados: 0, motivo: 'Ninguém corresponde ao alvo.' }

  for (const u of destinatarios) {
    await notifyUser(admin, u.id, {
      type:  'automacao',
      title: aviso.titulo || 'Automação',
      body:  aviso.corpo,
      // A origem vai no payload para a tela poder dizer de onde veio, em vez
      // de mais um aviso anônimo no sino. Com oportunidade, o "Abrir" leva ao
      // card no portal de quem recebe (como o lembrete do cron fazia).
      data:  {
        automacao: aviso.automacao,
        ...(aviso.leadId ? { leadId: aviso.leadId, caminho: caminhoDoCard(u, aviso.leadId) } : {}),
      },
    })
  }

  return { avisados: destinatarios.length, alvo: aviso.alvo }
}

/** O quadro no portal de quem recebe, com o card aberto (`?lead=`). */
function caminhoDoCard(u: { branch_id?: string | null; branches?: { slug?: string } | null }, leadId: string): string {
  return u.branch_id && u.branches?.slug
    ? `/${u.branches.slug}/oportunidades?lead=${leadId}`
    : `/admin/oportunidades?lead=${leadId}`
}

/**
 * Anota na linha do tempo do card.
 *
 * Precisa de um lead no contexto — anotação é do card, não do cliente. Quando
 * o fluxo nasceu de um evento sem lead, o passo diz isso em vez de gravar em
 * lugar nenhum e se dar por satisfeito.
 */
export async function anotarNaLinhaDoTempo(
  tenantId: string,
  contexto: ContextoDaExecucao,
  nota: { texto: string; automacao: string },
): Promise<Record<string, unknown>> {
  const lead = contexto.lead as { id?: string } | null | undefined
  const leadId = lead?.id

  if (!leadId) return { anotado: false, motivo: 'Este fluxo não tem oportunidade no contexto.' }

  await registrarEventoLead({
    tenantId,
    leadId,
    type:      'UPDATED',
    actorName: `Automação · ${nota.automacao}`,
    changes:   [{ campo: 'Automação', de: null, para: nota.texto }],
  })

  return { anotado: true, leadId }
}
