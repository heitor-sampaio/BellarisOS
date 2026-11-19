import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { seedDefaultFunnel } from '@/lib/crm/funis'
import { funilDoDashboard } from '@/lib/crm/funil-do-dashboard'
import { getLeadFunnel, getMotivosDePerda, getConversaoPorOrigem, getPainelComercial } from './queries'
import { percent } from './period'
import { resumoDoFunil } from './resultado'

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
  /** Realizados ÷ os que já deviam ter acontecido; nulo sem nenhum ("—", A29 da 23ª). */
  comparecimento:         number | null
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
 * (`leads.branch_id` é nulo — é assim que o inbox os cria, e filtrar por unidade
 * esvaziava o painel inteiro), enquanto os **atendimentos respeitam o recorte**
 * de unidade escolhido no topo da tela.
 */
export async function painelComercial({
  tenantId, branchIds, from, to, rawFunil, funilLembrado, ownerId, tags,
}: {
  tenantId:  string
  branchIds: string[]
  from:      Date
  /** Fim natural do período, não "agora": avaliação marcada para amanhã conta. */
  to:        Date
  rawFunil?: string
  /** O último funil escolhido no seletor (A34 da 23ª), quando não há `rawFunil`. */
  funilLembrado?: string | null
  /** CRM "só os meus": os leads dela e os sem dono (o recorte do quadro). */
  ownerId?:  string | null
  /**
   * O filtro de Tags dos Relatórios: as oportunidades cuja PESSOA (a cliente;
   * sem ela, o contato) tem todas as tags — o Heitor, 18/11: "a tag é da
   * pessoa"; os atendimentos comerciais, os de cliente com todas.
   */
  tags?:     string[] | null
}): Promise<DadosComerciais> {
  const admin    = createAdminClient()

  // A rede pode ter vários funis; o painel mostra um. Empilhar todos somaria
  // etapas que não se sucedem.
  const funis       = await seedDefaultFunnel(tenantId)
  const funisAtivos = funis.filter(f => f.archived_at === null)
  // A28 da 23ª: sem `?funil=`, o último escolhido e, sem ele, o padrão — que,
  // vazio no período, cede ao primeiro funil com oportunidade (a regra do
  // Dashboard, A30 da 20ª).
  const lerFunil = (funnelId: string | null) => getLeadFunnel({ tenantId, branchIds: null, from, to, funnelId, ownerId, tags })

  // Os números vêm agregados do banco (getPainelComercial, 2026-10-22): a tela
  // contava sobre as listas de leads e de atendimentos, e o PostgREST cortava
  // cada uma em 1000.
  const [{ funil: funilAtivo, etapas }, painel, usersRaw, motivosDePerda] = await Promise.all([
    funilDoDashboard({ funis: funisAtivos, pedido: rawFunil, lembrado: funilLembrado, lerFunil, total: e => resumoDoFunil(e).total }),

    getPainelComercial({ tenantId, branchIds, from, to, ownerId, tags }),

    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId), 'carregar a equipe'),

    getMotivosDePerda({ tenantId, from, to, ownerId, tags }),
  ])

  // A20 da 7ª simulação: a conversão por origem, a mesma conta, sobre as mesmas oportunidades.
  const conversaoPorOrigem = await getConversaoPorOrigem({ tenantId, from, to, ownerId, temGanho: painel.temGanho, tags })

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
    etapas:     (etapas ?? await lerFunil(null)).map(s => ({ name: s.name, count: s.leads })),
    // A conversão é da OPORTUNIDADE, somando os funis (2026-10-29): ganhas ÷ todas.
    totalLeads: painel.totalLeads,
    ganhos:     painel.ganhos,
    temGanho:   painel.temGanho,
    conversao:  painel.conversaoPct,
    comerciaisAgendados: painel.agendados,
    comerciaisConsiderados,
    comerciaisRealizados,
    // A29 da 23ª (princípio 4): sem nenhum que já devia ter acontecido, "—" — era 0%.
    comparecimento: percent(comerciaisRealizados, comerciaisConsiderados),
    ranking: ranking.sort((a, b) => (b.leads + b.agendamentos) - (a.leads + a.agendamentos)),
    motivosDePerda,
    conversaoPorOrigem,
  }
}
