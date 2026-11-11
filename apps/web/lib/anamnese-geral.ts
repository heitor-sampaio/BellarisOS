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

import { normalizeFormSchema, flattenFields, campoVisivel, type AnamnesisRow, type AnamnesisFieldType } from '@/lib/anamnesis'

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
/**
 * O booleano do legado em palavras: só o verdadeiro é "Sim". Um TEXTO que não
 * é booleano passa como está — a gestação tem "Não se aplica" desde
 * 2026-10-29, e nada aqui pode trocá-lo por "Sim" nem por "Não".
 */
const simNao = (v: unknown) => {
  if (v === true || v === 'true') return 'Sim'
  if (typeof v === 'string' && v !== 'false' && v.trim()) return v
  return 'Não'
}

/** As respostas, limpas: só os ids da ficha, só texto ou lista de texto, sem vazio. */
export function respostasDaFicha(rows: AnamnesisRow[], bruto: unknown): Record<string, RespostaDaAnamnese> {
  const entrada = (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) ? bruto as Record<string, unknown> : {}
  const saida: Record<string, RespostaDaAnamnese> = {}
  const campos = flattenFields({ rows })
  for (const f of campos) {
    if (f.type === 'section' || TIPOS_FORA_DO_PRE_ATENDIMENTO.includes(f.type)) continue
    // O campo escondido pela resposta de outro (o detalhe da alergia no "Não") não se grava.
    if (!campoVisivel(f, entrada, campos)) continue
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
  const campos = flattenFields({ rows })
  const falta = campos.find(f =>
    f.required && f.type !== 'section' && !TIPOS_FORA_DO_PRE_ATENDIMENTO.includes(f.type)
    && campoVisivel(f, respostas, campos) && vazia(respostas[f.id]))
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
export function quemRespondeu(a: AnamneseGeral, fuso = 'America/Sao_Paulo'): string {
  const quando = a.respondidoEm ? ` em ${new Date(a.respondidoEm).toLocaleDateString('pt-BR', { timeZone: fuso })}` : ''
  return `Respondida ${ORIGEM[a.origem]}${quando}`
}

const semAcento = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!]+$/, '').trim()
const comoTexto = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '').trim()

/**
 * As alergias que a anamnese registra, para o ALERTA na ficha e no
 * atendimento (2026-10-21; a simulação viu a alergia da cliente sem destaque
 * nenhum).
 *
 * Desde o atend-15 (revisão do Heitor, 2026-11-02: "vamos precisar de uma
 * avaliação de uma IA para entender o que foi escrito e isso não está no
 * escopo; alergia: opção de sim ou não; se sim, campo texto livre para
 * detalhamento e alerta") a pergunta é Sim/Não, e NADA interpreta texto:
 * - "Sim" avisa, com o detalhe ("Quais alergias?", o campo que só aparece no
 *   Sim) — ou "Sim (sem detalhe)";
 * - "Não" não avisa (o detalhe esquecido de antes não conta);
 * - uma resposta em TEXTO (a ficha de antes, de texto livre, ou uma ficha da
 *   clínica com a pergunta aberta) avisa como está escrita.
 * A pergunta é a `allergies`, senão a primeira cujo rótulo fala de alergia; o
 * detalhe, o campo que aparece só com ela em "Sim". Nulo quando não há o que
 * avisar.
 */
export function alergiasDaAnamnese(a: AnamneseGeral | null): string | null {
  if (!a) return null
  const respostas = a.respostas ?? {}
  const campos = flattenFields({ rows: a.ficha?.rows ?? [] })
  const pergunta = campos.find(f => f.id === 'allergies')?.id
    ?? campos.find(f => !f.mostrarSe && f.type !== 'section' && /alerg/i.test(f.label ?? ''))?.id
    ?? 'allergies'
  const resposta = comoTexto(respostas[pergunta])
  if (!resposta) return null
  const r = semAcento(resposta)
  if (r === 'nao') return null
  if (r === 'sim') {
    const detalhe = campos.find(f => f.mostrarSe?.campo === pergunta)?.id ?? 'allergiesDetalhe'
    return comoTexto(respostas[detalhe]) || 'Sim (sem detalhe)'
  }
  return resposta
}

/** O trecho do aviso à profissional: a alergia sem pontuação sobrando no fim (o texto da cliente já pode trazer o ponto). */
export function avisoDeAlergia(alergia: string | null): string {
  if (!alergia) return ''
  return ` Atenção — alergia: ${alergia.replace(/[\s.;,!]+$/, '')}.`
}
