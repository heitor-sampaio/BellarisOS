// A anamnese geral da cliente no formato da FICHA DE PRÉ-ATENDIMENTO
// (2026-10-20). Módulo neutro (sem 'use server'/'use client').
//
// Até aqui `medical_records.general_anamnesis` tinha oito campos fixos no
// código. Agora as perguntas são as da ficha universal da rede (forms.tipo =
// PRE_ATENDIMENTO), editável, e a resposta guarda o RETRATO das perguntas de
// quando foi respondida — a clínica pode mudar a ficha depois sem tornar a
// resposta ilegível. A ficha padrão nasceu com os mesmos ids dos campos fixos
// (skinType, allergies…), então a anamnese antiga vira resposta dela
// (`paraAnamneseGeral`; no banco, `anamnese_do_legado`).

import { normalizeFormSchema, flattenFields, type AnamnesisRow, type AnamnesisFieldType } from '@/lib/anamnesis'

export type OrigemDaAnamnese = 'EQUIPE' | 'CLIENTE_APP' | 'CLIENTE_LINK' | 'LEGADO'

/** Uma resposta da ficha: texto, ou a lista da múltipla escolha. */
export type RespostaDaAnamnese = string | string[]

export interface FichaDePreAtendimento {
  formId: string | null
  nome:   string
  rows:   AnamnesisRow[]
}

export interface AnamneseGeral {
  versao:        2
  ficha:         FichaDePreAtendimento
  respostas:     Record<string, RespostaDaAnamnese>
  respondidoEm:  string | null
  origem:        OrigemDaAnamnese
  respondidoPor: string | null
}

/**
 * Os tipos de campo que a ficha de pré-atendimento aceita: a cliente responde
 * pelo app ou pelo link, sem a sessão da equipe — foto e planejador de
 * injetáveis ficam de fora (a foto sobe com permissão de prontuário).
 */
export const TIPOS_FORA_DO_PRE_ATENDIMENTO: AnamnesisFieldType[] = ['photo', 'injectable_map']

/** O que a anamnese antiga (campos fixos) dizia, nos mesmos ids da ficha padrão. */
const PELES: Record<string, string> = { normal: 'Normal', seca: 'Seca', oleosa: 'Oleosa', mista: 'Mista', sensivel: 'Sensível' }
const simNao = (v: unknown) => (v === true || v === 'true' ? 'Sim' : 'Não')

/** As respostas, limpas: só os ids da ficha, só texto ou lista de texto, sem vazio. */
export function respostasDaFicha(rows: AnamnesisRow[], bruto: unknown): Record<string, RespostaDaAnamnese> {
  const entrada = (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) ? bruto as Record<string, unknown> : {}
  const saida: Record<string, RespostaDaAnamnese> = {}
  for (const f of flattenFields({ rows })) {
    if (f.type === 'section' || TIPOS_FORA_DO_PRE_ATENDIMENTO.includes(f.type)) continue
    const v = entrada[f.id]
    if (Array.isArray(v)) {
      const lista = v.map(x => String(x).trim()).filter(Boolean).slice(0, 50)
      if (lista.length) saida[f.id] = lista
    } else if (typeof v === 'string' || typeof v === 'number') {
      const t = String(v).trim().slice(0, 4000)
      if (t) saida[f.id] = t
    }
  }
  return saida
}

/**
 * A anamnese conta como RESPONDIDA? Só com ao menos uma resposta (D2 da
 * simulação de 2026-10-28): a cliente enviava a ficha vazia pelo app, e a
 * tela do atendimento dizia "Anamnese revisada" e "Respondida pela cliente"
 * com os campos em branco. A ficha gravada vazia não é respondida em lugar
 * nenhum — nem selo, nem "algo mudou?", nem a janela de 30 dias.
 */
export function anamneseRespondida(a: AnamneseGeral | null | undefined): a is AnamneseGeral {
  return !!a && Object.keys(a.respostas ?? {}).length > 0
}

/**
 * O que falta para a CLIENTE enviar a ficha (app e link; D2): nenhuma
 * resposta, ou a primeira pergunta obrigatória vazia, na ordem da ficha — a
 * mesma mensagem que a tela escreve junto do campo. Nulo quando pode enviar.
 * O servidor confere com isto: a tela sozinha não segura um envio direto.
 * `respostas` já limpas (`respostasDaFicha`).
 */
export function oQueFaltaNaFicha(rows: AnamnesisRow[], respostas: Record<string, RespostaDaAnamnese>): string | null {
  const vazia = (v: RespostaDaAnamnese | undefined) => v === undefined || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '')
  if (Object.values(respostas).every(vazia)) return 'Responda a ficha antes de enviar.'
  const falta = flattenFields({ rows }).find(f =>
    f.required && f.type !== 'section' && !TIPOS_FORA_DO_PRE_ATENDIMENTO.includes(f.type) && vazia(respostas[f.id]))
  return falta ? `Preencha "${falta.label}".` : null
}

/**
 * O que está gravado → a anamnese no formato novo (ou null, se não há).
 * O formato novo passa como está; o antigo (campos fixos) é convertido para a
 * ficha atual da rede, como `anamnese_do_legado` faz no banco.
 */
export function paraAnamneseGeral(gravado: unknown, fichaAtual: FichaDePreAtendimento): AnamneseGeral | null {
  if (!gravado || typeof gravado !== 'object' || Array.isArray(gravado)) return null
  const g = gravado as Record<string, unknown>

  if (g.versao === 2) {
    const ficha = (g.ficha && typeof g.ficha === 'object') ? g.ficha as Partial<FichaDePreAtendimento> : null
    const rows = ficha?.rows ? normalizeFormSchema({ rows: ficha.rows }).rows : fichaAtual.rows
    return {
      versao: 2,
      ficha: { formId: ficha?.formId ?? fichaAtual.formId, nome: ficha?.nome ?? fichaAtual.nome, rows: rows.length ? rows : fichaAtual.rows },
      respostas: respostasDaFicha(rows.length ? rows : fichaAtual.rows, g.respostas),
      respondidoEm: typeof g.respondidoEm === 'string' ? g.respondidoEm : null,
      origem: (['EQUIPE', 'CLIENTE_APP', 'CLIENTE_LINK', 'LEGADO'] as const).find(o => o === g.origem) ?? 'EQUIPE',
      respondidoPor: typeof g.respondidoPor === 'string' ? g.respondidoPor : null,
    }
  }

  const legado: Record<string, unknown> = {
    skinType:                  PELES[String(g.skinType ?? '').toLowerCase()] ?? '',
    allergies:                 g.allergies,
    medications:               g.medications,
    healthConditions:          g.healthConditions,
    previousProcedures:        g.previousProcedures,
    isPregnantOrBreastfeeding: simNao(g.isPregnantOrBreastfeeding),
    useSunscreen:              simNao(g.useSunscreen),
    observations:              g.observations,
  }
  return {
    versao: 2,
    ficha: fichaAtual,
    respostas: respostasDaFicha(fichaAtual.rows, legado),
    respondidoEm: typeof g.updatedAt === 'string' ? g.updatedAt : null,
    origem: 'LEGADO',
    respondidoPor: typeof g.updatedBy === 'string' ? g.updatedBy : null,
  }
}

/** As perguntas da ficha atual, com o que já foi respondido nelas (para editar). */
export function respostasParaEditar(anamnese: AnamneseGeral | null): Record<string, RespostaDaAnamnese> {
  return anamnese?.respostas ?? {}
}

const ORIGEM: Record<OrigemDaAnamnese, string> = {
  EQUIPE: 'pela equipe', CLIENTE_APP: 'pela cliente, no app', CLIENTE_LINK: 'pela cliente, pelo link', LEGADO: 'pela equipe',
}

/** "Respondida pela cliente, no app em 18/10/2026" — para o selo da anamnese. */
export function quemRespondeu(a: AnamneseGeral): string {
  const quando = a.respondidoEm ? ` em ${new Date(a.respondidoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''
  return `Respondida ${ORIGEM[a.origem]}${quando}`
}

/**
 * A resposta diz "não tem alergia"? (2026-10-27, D7) Começa por uma negação
 * ("não", "nenhuma", "sem", "nego", "nunca tive"), com caixa, acento e
 * pontuação ignorados — e não traz ressalva ("não sei", "mas", "só", "exceto")
 * nem nomeia uma alergia ("não tenho alergia a dipirona" fica como alerta: na
 * dúvida, avisa). Vazio também é negativa.
 */
export function respostaDeAlergiaEhNegativa(texto: string): boolean {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/\s,-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || /^(-+|n\/?a|nada)$/.test(t)) return true
  if (!/^(nao|nenhum|nenhuma|sem|nego|nunca)\b/.test(t)) return false
  if (/\b(sei|certeza|lembro|acho|talvez|duvida|mas|porem|so|apenas|exceto|menos|sim)\b/.test(t)) return false
  if (/\balergi\w*\s+(a|ao|aos|as|de|para|com)\s+(?!nada\b|nenhum)/.test(t)) return false
  return true
}

/**
 * As alergias que a anamnese registra, para o ALERTA na ficha e no
 * atendimento (2026-10-21; a simulação viu a alergia da cliente sem destaque
 * nenhum). Os campos da ficha cujo id é `allergies` ou cujo rótulo fala de
 * alergia; "não", "nenhuma" e vazio não contam. Nulo quando não há o que
 * avisar.
 */
export function alergiasDaAnamnese(a: AnamneseGeral | null): string | null {
  if (!a) return null
  const campos = flattenFields({ rows: a.ficha?.rows ?? [] })
    .filter(f => f.id === 'allergies' || /alerg/i.test(f.label ?? ''))
    .map(f => f.id)
  if (!campos.includes('allergies')) campos.push('allergies')
  const partes = [...new Set(campos)].flatMap(id => {
    const r = a.respostas?.[id]
    return Array.isArray(r) ? r : r ? [r] : []
  }).map(t => String(t).trim()).filter(t => t && !respostaDeAlergiaEhNegativa(t))
  return partes.length ? [...new Set(partes)].join('; ') : null
}

/** O trecho do aviso à profissional: a alergia sem pontuação sobrando no fim (o texto da cliente já pode trazer o ponto). */
export function avisoDeAlergia(alergia: string | null): string {
  if (!alergia) return ''
  return ` Atenção — alergia: ${alergia.replace(/[\s.;,!]+$/, '')}.`
}
