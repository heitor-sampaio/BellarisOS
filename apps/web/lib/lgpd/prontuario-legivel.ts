import { isInjectableMap, planejamentoDoValor, injectableTotals, type AnamnesisField } from '@/lib/anamnesis'
import { formatarDose } from '@/lib/injetaveis/dose'

/**
 * O prontuário do pacote da LGPD, legível para o titular (J-65; PR2c: "o
 * titular tem direito ao registro inteiro"). Módulo puro: o JSON e o PDF de
 * `lib/lgpd/export.ts` leem a ficha por aqui.
 *
 * D1 da 26ª: a ficha do procedimento é gravada como `{ formId, name, rows,
 * answers }` — a conclusão (`fichaParaConcluir`), o "Salvar ficha" e a
 * correção (`prontuario_versoes.ficha`) —, e o pacote lia `nome`/`respostas`:
 * o registro saía sem as respostas. Aqui valem os dois (o português fica pela
 * ficha de saúde, que grava `{ nome, rows }`/`respostas`). E o planejador de
 * injetáveis, que é um objeto, saía "[object Object]": vira o texto do retrato
 * (o nome, os pontos, o produto e a quantidade), como a tela do prontuário.
 */

export interface PontoLegivel {
  regiao:   string | null
  produto:  string
  dose:     number
  unidade:  string
  aplicada: number | null
}

export interface RespostaLegivel {
  pergunta: string
  resposta: string
  /** Só no planejador de injetáveis: cada ponto do retrato. */
  pontos?:  PontoLegivel[]
}

export interface FichaLegivel { ficha: string; respostas: RespostaLegivel[] }

/** Os campos das linhas gravadas no retrato — o que não tem forma de campo fica de fora. */
function camposDoRetrato(rows: unknown): AnamnesisField[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(r => {
    const fields = (r as { fields?: unknown } | null)?.fields
    return Array.isArray(fields)
      ? fields.filter((f): f is AnamnesisField => !!f && typeof f === 'object' && typeof (f as AnamnesisField).id === 'string')
      : []
  })
}

/** O planejador de injetáveis em palavras: "Toxina testa: 2 pontos — Toxina 6 U (planejado)". */
function mapaLegivel(valor: unknown): { resposta: string; pontos: PontoLegivel[] } | null {
  if (!isInjectableMap(valor)) return null
  const plano = planejamentoDoValor(valor)
  const nome = plano ? (plano.nome.trim() || 'Planejamento sem nome') : 'Mapa de aplicação'
  const pontos: PontoLegivel[] = valor.points.map(p => ({
    regiao:   typeof p.regiao === 'string' && p.regiao.trim() ? p.regiao.trim() : null,
    produto:  (p.product ?? '').trim() || 'Sem produto',
    dose:     Number(p.dose) || 0,
    unidade:  String(p.unit ?? ''),
    aplicada: p.applied === null || p.applied === undefined ? null : Number(p.applied),
  }))
  if (pontos.length === 0) return { resposta: `${nome}: nenhum ponto marcado`, pontos }
  const totais = injectableTotals(valor).map(t => t.applied > 0
    ? `${t.product} ${formatarDose(t.applied)} ${t.unit} (aplicado)`
    : `${t.product} ${formatarDose(t.planned)} ${t.unit} (planejado)`)
  return { resposta: `${nome}: ${pontos.length === 1 ? '1 ponto' : `${pontos.length} pontos`} — ${totais.join(', ')}`, pontos }
}

/** Um valor simples em texto; o objeto que não se conhece não vira "[object Object]". */
function textoDoValor(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    const partes = v.filter(x => typeof x === 'string' || typeof x === 'number').map(String)
    return partes.length ? partes.join(', ') : null
  }
  return null
}

/** As respostas da ficha, pergunta a pergunta, com o rótulo do retrato gravado. */
export function respostasLegiveis(ficha: unknown, respostas: unknown): RespostaLegivel[] {
  const r = (respostas && typeof respostas === 'object' && !Array.isArray(respostas) ? respostas : {}) as Record<string, unknown>
  const saida: RespostaLegivel[] = []
  for (const c of camposDoRetrato((ficha as { rows?: unknown } | null)?.rows)) {
    if (c.type === 'section') continue
    const v = r[c.id]
    if (v === undefined || v === null || v === '') continue
    const pergunta = String(c.label ?? '').trim() || 'Pergunta'
    if (c.type === 'injectable_map' || isInjectableMap(v)) {
      const m = mapaLegivel(v)
      if (m) saida.push({ pergunta, resposta: m.resposta, pontos: m.pontos })
      continue
    }
    // A foto guarda o caminho do arquivo no armazenamento (com ids): não vai.
    if (c.type === 'photo') { saida.push({ pergunta, resposta: 'Foto anexada' }); continue }
    const texto = textoDoValor(v)
    if (texto !== null && texto !== '') saida.push({ pergunta, resposta: texto })
  }
  return saida
}

/** A ficha do procedimento gravada (`form_data.ficha` ou a de uma versão), legível. */
export function fichaDoProcedimentoLegivel(f: unknown): FichaLegivel | null {
  if (!f || typeof f !== 'object') return null
  const blob = f as { name?: unknown; nome?: unknown; answers?: unknown; respostas?: unknown }
  const nome = typeof blob.name === 'string' && blob.name.trim() ? blob.name.trim()
    : typeof blob.nome === 'string' && blob.nome.trim() ? blob.nome.trim() : 'Ficha de atendimento'
  return { ficha: nome, respostas: respostasLegiveis(f, blob.answers ?? blob.respostas) }
}

const umaLinha = (s: string) => s.replace(/\s+/g, ' ').trim()

/** As linhas da ficha sob o atendimento no PDF (vazio sem ficha ou sem resposta). */
export function linhasDaFichaNoPdf(f: FichaLegivel | null): string[] {
  if (!f || f.respostas.length === 0) return []
  return [
    `   ${f.ficha}:`,
    ...f.respostas.flatMap(r => [
      `      ${r.pergunta}: ${umaLinha(r.resposta)}`,
      ...(r.pontos ?? []).map((p, i) => `         ${p.regiao ?? `ponto ${i + 1}`}: ${p.produto} ${formatarDose(p.aplicada ?? p.dose)} ${p.unidade}`),
    ]),
  ]
}

export interface VersaoParaOPdf {
  evolucao: string | null
  intercorrencias: string | null
  ficha: unknown
  editada_por_nome: string
  substituida_em: string
}

const respostasEmTexto = (f: unknown) => (fichaDoProcedimentoLegivel(f)?.respostas ?? [])
  .map(r => `${r.pergunta}: ${umaLinha(r.resposta)}`).join('; ')

/**
 * As versões de antes no PDF (PR2c), cada uma dizendo o que AQUELA correção
 * trocou (A33 da 26ª): o "Editar registro" grava a ficha e a evolução em dois
 * passos, e as duas linhas diziam a mesma evolução, como repetidas. O "depois"
 * de cada versão é a seguinte (ou o registro de agora). Em ordem de troca.
 */
export function linhasDasVersoesNoPdf(
  versoes: VersaoParaOPdf[],
  atual: { evolucao: string | null; intercorrencias: string | null; ficha: unknown },
  quando: (v: string | null | undefined) => string,
): string[] {
  return versoes.map((v, i) => {
    const depois = versoes[i + 1] ?? atual
    const ev = umaLinha(v.evolucao ?? ''), evDepois = umaLinha(depois.evolucao ?? '')
    const it = umaLinha(v.intercorrencias ?? ''), itDepois = umaLinha(depois.intercorrencias ?? '')
    const fi = respostasEmTexto(v.ficha), fiDepois = respostasEmTexto(depois.ficha)
    const partes: string[] = []
    if (ev !== evDepois) partes.push(`a evolução dizia: ${ev || '(em branco)'}`)
    if (it !== itDepois) partes.push(`as intercorrências diziam: ${it || '(em branco)'}`)
    if (fi !== fiDepois) partes.push(`a ficha de atendimento dizia: ${fi || '(em branco)'}`)
    if (partes.length === 0) partes.push(`a evolução dizia: ${ev || '(em branco)'}`)
    return `   Versão anterior: corrigido por ${v.editada_por_nome} em ${quando(v.substituida_em)}; ${partes.join(' — ')}`
  })
}

/** Uma ficha de saúde respondida, no prontuário do pacote. */
export interface FichaDeSaudeDoPacote {
  respondidaEm:  string | null
  respondidaPor: string | null
  ficha:         string
  respostas:     RespostaLegivel[]
}

const instante = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.NaN)
const mesmasRespostas = (a: RespostaLegivel[], b: RespostaLegivel[]) =>
  JSON.stringify(a.map(r => [r.pergunta, umaLinha(r.resposta)])) === JSON.stringify(b.map(r => [r.pergunta, umaLinha(r.resposta)]))

/**
 * As fichas de saúde do prontuário no PDF (D3 da 33ª; LG-12): os pedidos da
 * ficha respondidos e a ficha do prontuário (`general_anamnesis`) — a que a
 * equipe preenche no atendimento ia só ao JSON, e o PDF dizia "Nenhuma ficha
 * de saúde respondida". A do prontuário que já veio por um pedido respondido (a
 * mesma hora, ou as mesmas respostas: a equipe regravando o mesmo não troca a
 * hora) não se repete; sem resposta, não entra. Da mais nova para a mais velha.
 */
export function fichasDeSaudeDoProntuario(
  respondidas: FichaDeSaudeDoPacote[],
  doProntuario: FichaDeSaudeDoPacote | null,
): FichaDeSaudeDoPacote[] {
  if (!doProntuario || doProntuario.respostas.length === 0) return respondidas
  const jaVeio = respondidas.some(r =>
    (r.respondidaEm !== null && instante(r.respondidaEm) === instante(doProntuario.respondidaEm))
    || mesmasRespostas(r.respostas, doProntuario.respostas))
  if (jaVeio) return respondidas
  const t = (f: FichaDeSaudeDoPacote) => { const v = instante(f.respondidaEm); return Number.isNaN(v) ? -Infinity : v }
  return [...respondidas, doProntuario].sort((a, b) => t(b) - t(a))
}
