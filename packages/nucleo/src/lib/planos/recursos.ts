import type { AppModule, ReportTab } from '@estetica-os/types'

/**
 * O que um PLANO da plataforma inclui (2026-10-06, decisão do Heitor): as
 * funcionalidades que a rede pode usar e os limites de quantidade.
 *
 * - O catálogo é FECHADO aqui: o plano guarda as chaves, e o que vem do
 *   navegador passa por `normalizarRecursos` (chave desconhecida é recusada).
 * - Cada rede guarda um RETRATO (`tenant_subscriptions.recursos`): mudar o
 *   plano no catálogo vale para as próximas atribuições, não corta ninguém.
 * - Rede sem retrato (nenhuma rede antiga tem plano) = TUDO LIBERADO. É o
 *   `null` que atravessa `temFuncionalidade`, `limiteDe` e `modulosForaDoPlano`.
 * - Clientes, procedimentos, equipe, configurações, recebimentos e modelos
 *   (`forms`) não estão no catálogo: são o mínimo para a clínica funcionar.
 */

export interface Funcionalidade {
  chave: string
  rotulo: string
  grupo: 'Atendimento' | 'Clientes' | 'Vendas' | 'Comercial' | 'Marketing' | 'Gestão' | 'Novidades'
  /**
   * Os módulos de permissão que esta funcionalidade COBRE. O módulo sai das
   * permissões da rede quando TODAS as funcionalidades que o cobrem estão fora
   * do plano (o `crm` é do inbox e das oportunidades).
   */
  modulos: AppModule[]
  /** Ainda não existe no sistema: o plano já pode prometer. */
  emBreve?: boolean
}

export const FUNCIONALIDADES = [
  { chave: 'agenda',               rotulo: 'Agenda',                                   grupo: 'Atendimento', modulos: ['agenda'] },
  { chave: 'prontuario',           rotulo: 'Prontuário e fichas',                      grupo: 'Atendimento', modulos: ['medical_records'] },
  { chave: 'documentos',           rotulo: 'Termos e contratos (assinatura eletrônica)', grupo: 'Atendimento', modulos: ['documents'] },
  { chave: 'estoque',              rotulo: 'Estoque e lotes',                          grupo: 'Atendimento', modulos: ['stock'] },
  { chave: 'portal',               rotulo: 'Portal e app do cliente',                  grupo: 'Clientes',    modulos: [] },
  { chave: 'fidelidade',           rotulo: 'Fidelidade',                               grupo: 'Clientes',    modulos: ['loyalty'] },
  { chave: 'pacotes',              rotulo: 'Pacotes',                                  grupo: 'Vendas',      modulos: [] },
  { chave: 'pre_pago',             rotulo: 'Procedimento pré-pago',                    grupo: 'Vendas',      modulos: [] },
  { chave: 'planos_de_tratamento', rotulo: 'Planos de tratamento',                     grupo: 'Vendas',      modulos: [] },
  { chave: 'inbox',                rotulo: 'Inbox (WhatsApp, Instagram e Messenger)',  grupo: 'Comercial',   modulos: ['crm'] },
  { chave: 'oportunidades',        rotulo: 'Oportunidades (funil)',                    grupo: 'Comercial',   modulos: ['crm'] },
  { chave: 'campanhas',            rotulo: 'Campanhas e notificações',                 grupo: 'Marketing',   modulos: ['marketing'] },
  { chave: 'templates',            rotulo: 'Templates de WhatsApp',                    grupo: 'Marketing',   modulos: ['marketing'] },
  { chave: 'anuncios',             rotulo: 'Anúncios (Meta e Google)',                 grupo: 'Marketing',   modulos: ['marketing'] },
  { chave: 'automacoes',           rotulo: 'Automações',                               grupo: 'Marketing',   modulos: ['automations'] },
  { chave: 'financeiro',           rotulo: 'Financeiro',                               grupo: 'Gestão',      modulos: ['financial'] },
  { chave: 'comissoes',            rotulo: 'Comissões',                                grupo: 'Gestão',      modulos: [] },
  { chave: 'relatorios',           rotulo: 'Relatórios',                               grupo: 'Gestão',      modulos: ['reports'] },
  { chave: 'cargos',               rotulo: 'Cargos personalizados',                    grupo: 'Gestão',      modulos: ['roles'] },
  { chave: 'copilot',              rotulo: 'Copilot (IA secretária)',                  grupo: 'Novidades',   modulos: [], emBreve: true },
] as const satisfies readonly Funcionalidade[]

export type ChaveDeFuncionalidade = (typeof FUNCIONALIDADES)[number]['chave']

export const LIMITES = [
  { chave: 'unidades', rotulo: 'Unidades' },
  { chave: 'membros',  rotulo: 'Membros da equipe' },
  { chave: 'whatsapp', rotulo: 'Números de WhatsApp' },
] as const

export type ChaveDeLimite = (typeof LIMITES)[number]['chave']

/** O teto do slider; acima disso, "ilimitado" (null). */
export const LIMITE_MAXIMO = 10

export interface RecursosDoPlano {
  funcionalidades: ChaveDeFuncionalidade[]
  /** null = ilimitado. */
  limites: Record<ChaveDeLimite, number | null>
}

const CHAVES = new Set<string>(FUNCIONALIDADES.map(f => f.chave))

/** Tudo ligado e sem limite — o padrão de um plano novo. */
export const TUDO_LIBERADO: RecursosDoPlano = {
  funcionalidades: FUNCIONALIDADES.map(f => f.chave),
  limites: { unidades: null, membros: null, whatsapp: null },
}

const limiteValido = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= LIMITE_MAXIMO)

/** O que vem do navegador (a tela do plano): estrito — desconhecido é recusado. */
export function normalizarRecursos(entrada: unknown):
  { ok: true; recursos: RecursosDoPlano } | { ok: false; error: string } {
  const e = entrada as { funcionalidades?: unknown; limites?: unknown } | null
  if (!e || !Array.isArray(e.funcionalidades)) return { ok: false, error: 'Funcionalidades inválidas.' }
  const desconhecida = e.funcionalidades.find(f => typeof f !== 'string' || !CHAVES.has(f))
  if (desconhecida !== undefined) return { ok: false, error: `Funcionalidade desconhecida: ${String(desconhecida)}.` }
  if (e.limites == null || typeof e.limites !== 'object' || Array.isArray(e.limites)) return { ok: false, error: 'Limites inválidos.' }
  const limites = e.limites as Record<string, unknown>
  const saida = {} as RecursosDoPlano['limites']
  for (const l of LIMITES) {
    if (!(l.chave in limites)) return { ok: false, error: `Falta o limite de ${l.rotulo.toLowerCase()}.` }
    const v = limites[l.chave]
    if (!limiteValido(v)) return { ok: false, error: `${l.rotulo}: de 1 a ${LIMITE_MAXIMO}, ou ilimitado.` }
    saida[l.chave] = v
  }
  // Na ordem do catálogo, sem repetição.
  const marcadas = new Set(e.funcionalidades as string[])
  return {
    ok: true,
    recursos: { funcionalidades: FUNCIONALIDADES.map(f => f.chave).filter(c => marcadas.has(c)), limites: saida },
  }
}

/**
 * O retrato gravado (jsonb do banco): tolerante — chave que saiu do catálogo
 * é ignorada, limite que falta ou inválido é ilimitado. null = sem retrato.
 */
export function lerRecursos(gravado: unknown): RecursosDoPlano | null {
  if (!gravado || typeof gravado !== 'object') return null
  const g = gravado as { funcionalidades?: unknown; limites?: unknown }
  const marcadas = new Set(Array.isArray(g.funcionalidades) ? g.funcionalidades.filter((f): f is string => typeof f === 'string') : [])
  const limites = (g.limites && typeof g.limites === 'object' ? g.limites : {}) as Record<string, unknown>
  return {
    funcionalidades: FUNCIONALIDADES.map(f => f.chave).filter(c => marcadas.has(c)),
    limites: {
      unidades: limiteValido(limites.unidades) ? limites.unidades : null,
      membros:  limiteValido(limites.membros)  ? limites.membros  : null,
      whatsapp: limiteValido(limites.whatsapp) ? limites.whatsapp : null,
    },
  }
}

/** A rede pode usar a funcionalidade? Sem retrato, sim. */
export function temFuncionalidade(recursos: RecursosDoPlano | null, chave: ChaveDeFuncionalidade): boolean {
  return recursos === null || recursos.funcionalidades.includes(chave)
}

/** O limite da rede (null = ilimitado; sem retrato, ilimitado). */
export function limiteDe(recursos: RecursosDoPlano | null, chave: ChaveDeLimite): number | null {
  return recursos === null ? null : recursos.limites[chave]
}

/**
 * Os módulos de permissão que saem para a rede inteira — inclusive para o
 * dono: um módulo cai quando TODAS as funcionalidades que o cobrem estão fora.
 * É o que `buildContext` aplica sobre as permissões do cargo.
 */
export function modulosForaDoPlano(recursos: RecursosDoPlano | null): AppModule[] {
  if (recursos === null) return []
  const ligadas = new Set<string>(recursos.funcionalidades)
  const cobertos = new Map<AppModule, boolean>()
  for (const f of FUNCIONALIDADES as readonly Funcionalidade[]) {
    for (const m of f.modulos) cobertos.set(m, (cobertos.get(m) ?? false) || ligadas.has(f.chave))
  }
  return [...cobertos].filter(([, algumaLigada]) => !algumaLigada).map(([m]) => m)
}

/** "18 de 20 funcionalidades · unidades: 3 · …" — o resumo de uma linha (catálogo, rede). */
export function resumirRecursos(r: RecursosDoPlano | null): string {
  if (r === null) return 'Tudo liberado (sem plano)'
  const limites = LIMITES.map(l => `${l.rotulo.toLowerCase()}: ${r.limites[l.chave] ?? 'ilimitado'}`)
  return [`${r.funcionalidades.length} de ${FUNCIONALIDADES.length} funcionalidades`, ...limites].join(' · ')
}

/**
 * As abas de Relatórios de uma funcionalidade fora do plano (a aba "estoque"
 * sem estoque, a "comercial" sem oportunidades…). Sobram as gerais (visão
 * geral, clientes, procedimentos, profissionais). Sem retrato, nenhuma.
 */
const ABA_DA_FUNCIONALIDADE: Partial<Record<ReportTab, ChaveDeFuncionalidade>> = {
  financeiro: 'financeiro', agenda: 'agenda', estoque: 'estoque', comercial: 'oportunidades',
}
export function abasForaDoPlano(recursos: RecursosDoPlano | null): string[] {
  if (recursos === null) return []
  return Object.entries(ABA_DA_FUNCIONALIDADE).filter(([, f]) => !recursos.funcionalidades.includes(f)).map(([aba]) => aba)
}
