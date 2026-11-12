import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { seedDefaultFunnel } from '@/lib/crm/funis'
import { getLeadFunnel, getMotivosDePerda, getConversaoPorOrigem, getPainelComercial } from './queries'
import { percent } from './period'

/** Painel comercial, calculado no servidor — a aba Comercial dos Relatórios e o Copilot (C5, F68). */
export interface DadosComerciais {
  funis:      { id: string; name: string }[]
  funilAtivo: string
  etapas:     { name: string; count: number }[]
  totalLeads:  number
  /** As oportunidades na etapa de ganho, de todos os funis (a conversão é da oportunidade). */
  ganhos:      number
  temGanho:    boolean
  /** Ganhas ÷ oportunidades (lib/metrics); nula sem etapa de ganho ("—"). */
  conversao:   number | null
  comerciaisAgendados:    number
  comerciaisConsiderados: number
  comerciaisRealizados:   number
  comparecimento:         number
  ranking: { id: string; name: string; leads: number; ganhos: number; conversaoPct: number | null; agendamentos: number }[]
  /** Por que as oportunidades do período foram perdidas (2026-10-21). */
  motivosDePerda: { motivo: string; total: number }[]
  /** A conversão de cada origem do lead (A20 da 7ª), contada e dividida em lib/metrics. */
  conversaoPorOrigem: { origem: string; leads: number; ganhos: number; conversaoPct: number | null }[]
}

/**
 * Funil, conversão e ranking do time comercial.
 *
 * Duas fronteiras diferentes de propósito: os **leads são da rede**
 * (`leads.branch_id` é nulo — é assim que o inbox os cria, e filtrar por filial
 * esvaziava o painel inteiro), enquanto os **atendimentos respeitam o recorte**
 * de unidade escolhido no topo da tela.
 */
export async function painelComercial({
  tenantId, branchIds, from, to, rawFunil, ownerId,
}: {
  tenantId:  string
  branchIds: string[]
  from:      Date
  /** Fim natural do período, não "agora": avaliação marcada para amanhã conta. */
  to:        Date
  rawFunil?: string
  /** CRM "só os meus": os leads dela e os sem dono (o recorte do quadro). */
  ownerId?:  string | null
}): Promise<DadosComerciais> {
  const admin    = createAdminClient()

  // A rede pode ter vários funis; o painel mostra um. Empilhar todos somaria
  // etapas que não se sucedem.
  const funis       = await seedDefaultFunnel(tenantId)
  const funisAtivos = funis.filter(f => f.archived_at === null)
  const funilAtivo  = funisAtivos.find(f => f.id === rawFunil)
    ?? funisAtivos.find(f => f.is_default)
    ?? funisAtivos[0]

  // Os números vêm agregados do banco (getPainelComercial, 2026-10-22): a tela
  // contava sobre as listas de leads e de atendimentos, e o PostgREST cortava
  // cada uma em 1000.
  const [etapasRaw, painel, usersRaw, motivosDePerda] = await Promise.all([
    getLeadFunnel({
      tenantId, branchIds: null, from, to, funnelId: funilAtivo?.id ?? null, ownerId,
    }),

    getPainelComercial({ tenantId, branchIds, from, to, ownerId }),

    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId), 'carregar a equipe'),

    getMotivosDePerda({ tenantId, from, to, ownerId }),
  ])

  // A20 da 7ª simulação: a conversão por origem, a mesma conta, sobre as mesmas oportunidades.
  const conversaoPorOrigem = await getConversaoPorOrigem({ tenantId, from, to, ownerId, temGanho: painel.temGanho })

  const nomeDe = new Map((usersRaw ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))

  // Comparecimento exclui as canceladas do denominador: com elas dentro a
  // métrica misturava "não cancelou" com "compareceu" e ficava sempre baixa.
  //
  // A base eram as AVALIAÇÕES (`is_evaluation`), que deixaram de existir em
  // 2026-09-25 — a avaliação virou um procedimento como outro qualquer e não
  // há mais o que a distinga na tabela. O que a métrica sempre quis saber é do
  // funil do time comercial: quantos primeiros atendimentos foram marcados e
  // quantos aconteceram. Isso o `source` responde, e o rótulo mudou junto.
  const comerciaisConsiderados = painel.considerados
  const comerciaisRealizados   = painel.realizados

  // Leads sem dono entram numa linha própria em vez de sumirem: antes o
  // ranking somava menos leads que o KPI de leads recebidos, sem explicação.
  // Uma linha por dono já vem do banco, com a conversão de lib/metrics
  // (ganhas ÷ oportunidades dele); aqui só o nome.
  const ranking = painel.porDono.map(d => ({
    id:   d.dono ?? '__sem_responsavel__',
    name: d.dono ? (nomeDe.get(d.dono) ?? 'Sem nome') : 'Sem responsável',
    leads: d.leads, ganhos: d.ganhos, conversaoPct: d.conversaoPct, agendamentos: d.agendamentos,
  }))

  return {
    funis:      funisAtivos.map(f => ({ id: f.id, name: f.name })),
    funilAtivo: funilAtivo?.id ?? '',
    etapas:     etapasRaw.map(s => ({ name: s.name, count: s.leads })),
    // A conversão é da OPORTUNIDADE, somando os funis (2026-10-29): ganhas ÷ todas.
    totalLeads: painel.totalLeads,
    ganhos:     painel.ganhos,
    temGanho:   painel.temGanho,
    conversao:  painel.conversaoPct,
    comerciaisAgendados: painel.agendados,
    comerciaisConsiderados,
    comerciaisRealizados,
    comparecimento: percent(comerciaisRealizados, comerciaisConsiderados) ?? 0,
    ranking: ranking.sort((a, b) => (b.leads + b.agendamentos) - (a.leads + a.agendamentos)),
    motivosDePerda,
    conversaoPorOrigem,
  }
}
