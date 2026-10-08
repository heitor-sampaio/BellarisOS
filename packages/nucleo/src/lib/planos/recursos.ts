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
 * - Clientes, procedimentos, equipe, configurações e recebimentos não estão no
 *   catálogo: são o mínimo para a clínica funcionar. Do módulo `forms`, só a
 *   PERSONALIZAÇÃO de fichas (`fichas`, 2026-10-07) é do plano — as fichas que
 *   existem seguem no atendimento, e os modelos de documento são `documentos`.
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
  // 2026-10-07: partes de módulo — sem elas, o prontuário e os modelos de
  // documento (que também são do módulo forms) seguem valendo.
  { chave: 'injetaveis',           rotulo: 'Planejador de injetáveis',                 grupo: 'Atendimento', modulos: [] },
  { chave: 'fichas',               rotulo: 'Personalização de fichas de atendimento',  grupo: 'Atendimento', modulos: [] },
  { chave: 'documentos',           rotulo: 'Termos e contratos (assinatura eletrônica)', grupo: 'Atendimento', modulos: ['documents'] },
  { chave: 'estoque',              rotulo: 'Estoque e lotes',                          grupo: 'Atendimento', modulos: ['stock'] },
  { chave: 'portal',               rotulo: 'Portal e app do cliente',                  grupo: 'Clientes',    modulos: [] },
  { chave: 'fidelidade',           rotulo: 'Fidelidade',                               grupo: 'Clientes',    modulos: ['loyalty'] },
  { chave: 'pacotes',              rotulo: 'Pacotes',                                  grupo: 'Vendas',      modulos: [] },
  { chave: 'pre_pago',             rotulo: 'Procedimento pré-pago',                    grupo: 'Vendas',      modulos: [] },
  { chave: 'planos_de_tratamento', rotulo: 'Planos de tratamento',                     grupo: 'Vendas',      modulos: [] },
  { chave: 'inbox',                rotulo: 'Inbox omnichannel',                        grupo: 'Comercial',   modulos: ['crm'] },
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

/**
 * Os ADICIONAIS (2026-10-07): o que a rede contrata além do plano, somado à
 * mensalidade. O plano OFERECE (e diz o preço, em `adicionais`); o que a rede
 * contratou mora em `tenant_subscriptions.adicionais` (`lib/planos/adicionais.ts`).
 *  - `whatsapp`: conexões além do limite do plano (só em plano COM limite);
 *  - `copilot`: o Copilot avulso (só em plano que não o inclui).
 * Chave nova aqui exige migration: a coluna `valor_total_centavos` e as
 * funções do banco conhecem as duas pelo nome.
 */
export const ADICIONAIS = [
  { chave: 'whatsapp', rotulo: 'Conexão de WhatsApp adicional', maximo: 10 },
  { chave: 'copilot',  rotulo: 'Copilot (IA secretária)',       maximo: 1, emBreve: true },
] as const

export type ChaveDeAdicional = (typeof ADICIONAIS)[number]['chave']

/** O preço que o plano pede por unidade do adicional, em centavos. Ausente = não oferece. */
export type OfertaDosAdicionais = Partial<Record<ChaveDeAdicional, { valor_centavos: number }>>

/** Teto do preço de um adicional (R$ 100.000,00): erro de digitação não vira cobrança. */
export const PRECO_MAXIMO_CENTAVOS = 10_000_000

export interface RecursosDoPlano {
  funcionalidades: ChaveDeFuncionalidade[]
  /** null = ilimitado. */
  limites: Record<ChaveDeLimite, number | null>
  /** Os adicionais que o plano oferece, com o preço. */
  adicionais: OfertaDosAdicionais
  /**
   * As COTAS mensais (2026-10-08): o Copilot, em tokens por mês (null ou
   * ausente = sem limite). Opcional: plano gravado antes dela não tem.
   */
  cotas?: { copilot: number | null }
}

/** Teto da cota do Copilot (1 bilhão de tokens por mês): erro de digitação não vira conta. */
export const COTA_MAXIMA_DO_COPILOT = 1_000_000_000

const cotaValida = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= COTA_MAXIMA_DO_COPILOT)

/** A cota mensal do Copilot da rede, em tokens (null = sem limite; sem retrato, sem limite). */
export function cotaDoCopilot(recursos: { cotas?: { copilot: number | null } } | null): number | null {
  const v = recursos?.cotas?.copilot
  return cotaValida(v) ? v : null
}

const CHAVES = new Set<string>(FUNCIONALIDADES.map(f => f.chave))

/** Tudo ligado e sem limite — o padrão de um plano novo. */
export const TUDO_LIBERADO: RecursosDoPlano = {
  funcionalidades: FUNCIONALIDADES.map(f => f.chave),
  limites: { unidades: null, membros: null, whatsapp: null },
  adicionais: {},
}

/**
 * O plano pode oferecer este adicional? O WhatsApp extra só faz sentido com
 * limite de números; o Copilot avulso, só quando o plano não o inclui.
 */
export function adicionalCabeNoPlano(r: Pick<RecursosDoPlano, 'funcionalidades' | 'limites'>, chave: ChaveDeAdicional): boolean {
  return chave === 'whatsapp' ? r.limites.whatsapp !== null : !(r.funcionalidades as string[]).includes('copilot')
}

const precoValido = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= PRECO_MAXIMO_CENTAVOS
const CHAVES_DE_ADICIONAL = new Set<string>(ADICIONAIS.map(a => a.chave))

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
  const funcionalidades = FUNCIONALIDADES.map(f => f.chave).filter(c => marcadas.has(c))

  // A oferta de adicionais: opcional; o que vier, estrito.
  const adicionais: OfertaDosAdicionais = {}
  const pedidos = (e as { adicionais?: unknown }).adicionais
  if (pedidos != null) {
    if (typeof pedidos !== 'object' || Array.isArray(pedidos)) return { ok: false, error: 'Adicionais inválidos.' }
    for (const [chave, oferta] of Object.entries(pedidos as Record<string, unknown>)) {
      if (!CHAVES_DE_ADICIONAL.has(chave)) return { ok: false, error: `Adicional desconhecido: ${chave}.` }
      const a = ADICIONAIS.find(x => x.chave === chave)!
      const valor = (oferta as { valor_centavos?: unknown } | null)?.valor_centavos
      if (!precoValido(valor)) return { ok: false, error: `${a.rotulo}: preço inválido.` }
      if (!adicionalCabeNoPlano({ funcionalidades, limites: saida }, a.chave)) {
        return { ok: false, error: a.chave === 'whatsapp'
          ? 'A conexão de WhatsApp adicional só vale para plano com limite de números.'
          : 'O Copilot avulso só vale para plano que não inclui o Copilot.' }
      }
      adicionais[a.chave] = { valor_centavos: valor }
    }
  }
  // A cota do Copilot: opcional; o que vier, estrito.
  const cotas = (e as { cotas?: unknown }).cotas
  let copilot: number | null = null
  if (cotas != null) {
    const v = (cotas as { copilot?: unknown }).copilot
    if (typeof cotas !== 'object' || Array.isArray(cotas) || !cotaValida(v ?? null)) {
      return { ok: false, error: 'Cota do Copilot inválida.' }
    }
    copilot = (v ?? null) as number | null
  }
  return { ok: true, recursos: { funcionalidades, limites: saida, adicionais, ...(copilot !== null ? { cotas: { copilot } } : {}) } }
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
  const lido: RecursosDoPlano = {
    funcionalidades: FUNCIONALIDADES.map(f => f.chave).filter(c => marcadas.has(c)),
    limites: {
      unidades: limiteValido(limites.unidades) ? limites.unidades : null,
      membros:  limiteValido(limites.membros)  ? limites.membros  : null,
      whatsapp: limiteValido(limites.whatsapp) ? limites.whatsapp : null,
    },
    adicionais: {},
  }
  const copilot = (g as { cotas?: { copilot?: unknown } }).cotas?.copilot
  if (cotaValida(copilot) && copilot !== null) lido.cotas = { copilot }
  // A oferta: só o que é válido E cabe no plano lido.
  const ofertas = ((g as { adicionais?: unknown }).adicionais ?? {}) as Record<string, { valor_centavos?: unknown } | null>
  if (ofertas && typeof ofertas === 'object') {
    for (const a of ADICIONAIS) {
      const v = ofertas[a.chave]?.valor_centavos
      if (precoValido(v) && adicionalCabeNoPlano(lido, a.chave)) lido.adicionais[a.chave] = { valor_centavos: v }
    }
  }
  return lido
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
