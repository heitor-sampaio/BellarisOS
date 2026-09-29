/**
 * A árvore de um documento (termo ou contrato) — versão 2, a do editor rico.
 *
 * É o que se ASSINA: a tela (`DocumentoRenderizado`) e o PDF
 * (`pdf/diagramacao.ts`) desenham esta árvore, e o SHA-256 que a assinatura
 * prova é calculado sobre a forma canônica dela (`formaCanonica`). O editor
 * (Tiptap) é só o jeito de escrever: o JSON dele passa pelo conversor
 * (`editor/converter.ts`), que aceita apenas o que está aqui — nunca vai para a
 * tela como HTML.
 *
 * Duas fases, o mesmo formato: o MODELO tem variáveis (`{ variavel }`); o
 * documento EMITIDO só tem texto (`interpolar`). A v1 (a da marcação leve, um
 * array de blocos só com negrito) ainda se desenha, convertida por `deV1`.
 *
 * Puro: roda no navegador e no servidor.
 */

import {
  FONTE_BASE, TAMANHO_BASE, ehFonte, type FonteDeDocumento,
} from './fontes'
import type { ArvoreResolvida as ArvoreV1, TrechoResolvido as TrechoV1 } from './marcacao'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type Alinhamento = 'esquerda' | 'centro' | 'direita' | 'justificado'

/** O estilo de um pedaço de texto. Ausente = o da base do documento. */
export interface Estilo {
  negrito?:    true
  italico?:    true
  sublinhado?: true
  tachado?:    true
  fonte?:      FonteDeDocumento
  tamanho?:    number
  /** `#rrggbb` */
  cor?:        string
  /** `#rrggbb` — o marca-texto. */
  realce?:     string
}

export type TrechoDeModelo = ({ texto: string } | { variavel: string }) & Estilo
export type Trecho = { texto: string } & Estilo

export interface Celula<T> { cabecalho?: true; colspan?: number; blocos: Bloco<T>[] }

export type Bloco<T> =
  | { tipo: 'paragrafo'; alinhar?: Alinhamento; entrelinhas?: number; trechos: T[] }
  | { tipo: 'titulo'; nivel: 1 | 2 | 3; alinhar?: Alinhamento; entrelinhas?: number; trechos: T[] }
  | { tipo: 'lista'; ordenada: boolean; inicio?: number; itens: Bloco<T>[][] }
  | { tipo: 'tabela'; larguras: number[]; linhas: { celulas: Celula<T>[] }[] }
  /** `largura`/`altura` em pontos; `sha256` do arquivo — o hash do documento cobre a imagem. */
  | { tipo: 'imagem'; caminho: string; sha256: string; largura: number; altura: number; alinhar?: Alinhamento }
  | { tipo: 'divisoria' }
  | { tipo: 'quebra' }
  | { tipo: 'assinatura' }

export interface Documento<T> {
  versao:    2
  base:      { fonte: FonteDeDocumento; tamanho: number }
  cabecalho: Bloco<T>[]
  rodape:    Bloco<T>[]
  blocos:    Bloco<T>[]
}

export type DocumentoDoModelo  = Documento<TrechoDeModelo>
export type DocumentoResolvido = Documento<Trecho>
export type BlocoResolvido     = Bloco<Trecho>

// ─── A página (a mesma medida na tela e no PDF) ──────────────────────────────

export const PAGINA = {
  largura: 595.28, altura: 841.89, margem: 56,
  /** O cabeçalho e o rodapé da clínica ocupam até isto, cada um. */
  alturaDoCabecalho: 64, alturaDoRodape: 48,
} as const
export const LARGURA_UTIL = PAGINA.largura - 2 * PAGINA.margem

export const TAMANHO_DO_TITULO: Record<1 | 2 | 3, number> = { 1: 18, 2: 14, 3: 12 }
export const ENTRELINHAS_BASE = 1.15
export const ENTRELINHAS = [1, 1.15, 1.5, 2] as const
/** Altura da linha = tamanho × FATOR × entrelinhas (1,15 dá o "simples" do Word). */
export const FATOR_DE_LINHA = 1.2
export const ESPACO_DEPOIS_DO_PARAGRAFO = 6
export const ESPACO_ANTES_DO_TITULO = 10
export const RECUO_DA_LISTA = 18

// ─── Estilo ──────────────────────────────────────────────────────────────────

const ORDEM_DO_ESTILO = ['negrito', 'italico', 'sublinhado', 'tachado', 'fonte', 'tamanho', 'cor', 'realce'] as const

/** Copia só o estilo, na ORDEM fixa das chaves — a forma canônica depende disso. */
export function soEstilo(e: Estilo): Estilo {
  const saida: Estilo = {}
  for (const k of ORDEM_DO_ESTILO) {
    const v = e[k]
    if (v !== undefined) (saida as Record<string, unknown>)[k] = v
  }
  return saida
}

export function mesmoEstilo(a: Estilo, b: Estilo): boolean {
  return ORDEM_DO_ESTILO.every(k => a[k] === b[k])
}

/** O estilo EFETIVO de um trecho, com a base do documento preenchida. */
export function estiloEfetivo(t: Estilo, base: Documento<unknown>['base'], negritoDoBloco = false) {
  return {
    negrito:    !!t.negrito || negritoDoBloco,
    italico:    !!t.italico,
    sublinhado: !!t.sublinhado,
    tachado:    !!t.tachado,
    fonte:      t.fonte && ehFonte(t.fonte) ? t.fonte : base.fonte,
    tamanho:    t.tamanho ?? base.tamanho,
    cor:        t.cor ?? '#1f1f1f',
    realce:     t.realce ?? null,
  }
}

// ─── Percorrer ───────────────────────────────────────────────────────────────

/** Todos os blocos, de todas as partes, em profundidade (listas e células incluídas). */
export function* todosOsBlocos<T>(doc: Documento<T>): Generator<Bloco<T>> {
  function* de(blocos: Bloco<T>[]): Generator<Bloco<T>> {
    for (const b of blocos) {
      yield b
      if (b.tipo === 'lista') for (const it of b.itens) yield* de(it)
      if (b.tipo === 'tabela') for (const l of b.linhas) for (const c of l.celulas) yield* de(c.blocos)
    }
  }
  yield* de(doc.cabecalho)
  yield* de(doc.blocos)
  yield* de(doc.rodape)
}

/** As variáveis citadas, na ordem em que aparecem, sem repetir. */
export function variaveisDoDocumento(doc: DocumentoDoModelo): string[] {
  const vistas = new Set<string>()
  for (const b of todosOsBlocos(doc)) {
    if (b.tipo === 'paragrafo' || b.tipo === 'titulo') {
      for (const t of b.trechos) if ('variavel' in t) vistas.add(t.variavel)
    }
  }
  return [...vistas]
}

/** As imagens citadas (caminho e hash), sem repetir. */
export function imagensDoDocumento<T>(doc: Documento<T>): { caminho: string; sha256: string }[] {
  const vistas = new Map<string, string>()
  for (const b of todosOsBlocos(doc)) if (b.tipo === 'imagem') vistas.set(b.caminho, b.sha256)
  return [...vistas].map(([caminho, sha256]) => ({ caminho, sha256 }))
}

// ─── Interpolação ────────────────────────────────────────────────────────────

/**
 * Troca cada variável pelo seu valor, SOBRE A ÁRVORE — o valor vira texto
 * puro, com o estilo que a variável tinha no modelo (negrito, fonte…). O
 * contrato é o da v1: `resolver` devolve null quando o dado falta; a
 * obrigatória que faltar vai para `faltando` (e o documento não pode ser
 * assinado), a opcional sai vazia.
 */
export function interpolar(
  doc: DocumentoDoModelo,
  resolver: (variavel: string) => string | null,
  ehOpcional: (variavel: string) => boolean,
): { documento: DocumentoResolvido; faltando: string[] } {
  const faltando = new Set<string>()

  const trechos = (ts: TrechoDeModelo[]): Trecho[] => {
    const saida: Trecho[] = []
    for (const t of ts) {
      let texto: string
      if ('variavel' in t) {
        const valor = resolver(t.variavel)
        if (valor == null || valor === '') {
          if (!ehOpcional(t.variavel)) faltando.add(t.variavel)
          texto = ''
        } else texto = valor
      } else texto = t.texto
      if (!texto) continue
      juntarTrecho(saida, { texto, ...soEstilo(t) })
    }
    return saida
  }

  const blocos = (bs: Bloco<TrechoDeModelo>[]): Bloco<Trecho>[] => bs.map((b): Bloco<Trecho> => {
    switch (b.tipo) {
      case 'paragrafo': return comAlinhamento({ tipo: 'paragrafo' }, b, trechos(b.trechos))
      case 'titulo':    return comAlinhamento({ tipo: 'titulo', nivel: b.nivel }, b, trechos(b.trechos))
      case 'lista':     return { tipo: 'lista', ordenada: b.ordenada, ...(b.inicio && b.inicio !== 1 ? { inicio: b.inicio } : {}), itens: b.itens.map(blocos) }
      case 'tabela':    return {
        tipo: 'tabela', larguras: b.larguras,
        linhas: b.linhas.map(l => ({ celulas: l.celulas.map(c => ({
          ...(c.cabecalho ? { cabecalho: true as const } : {}),
          ...(c.colspan && c.colspan > 1 ? { colspan: c.colspan } : {}),
          blocos: blocos(c.blocos),
        })) })),
      }
      case 'imagem':    return {
        tipo: 'imagem', caminho: b.caminho, sha256: b.sha256, largura: b.largura, altura: b.altura,
        ...(b.alinhar && b.alinhar !== 'esquerda' ? { alinhar: b.alinhar } : {}),
      }
      default:          return { tipo: b.tipo }
    }
  })

  return {
    documento: { versao: 2, base: { fonte: doc.base.fonte, tamanho: doc.base.tamanho }, cabecalho: blocos(doc.cabecalho), rodape: blocos(doc.rodape), blocos: blocos(doc.blocos) },
    faltando:  [...faltando],
  }
}

/** Acrescenta um trecho, juntando com o anterior se o estilo for o mesmo. */
export function juntarTrecho(saida: Trecho[], t: Trecho) {
  const anterior = saida[saida.length - 1]
  if (anterior && mesmoEstilo(anterior, t)) anterior.texto += t.texto
  else saida.push({ texto: t.texto, ...soEstilo(t) })
}

/** Monta parágrafo/título com as chaves SEMPRE na mesma ordem. */
function comAlinhamento<T, B extends { tipo: 'paragrafo' } | { tipo: 'titulo'; nivel: 1 | 2 | 3 }>(
  cabeca: B, origem: { alinhar?: Alinhamento; entrelinhas?: number }, ts: T[],
) {
  return {
    ...cabeca,
    ...(origem.alinhar && origem.alinhar !== 'esquerda' ? { alinhar: origem.alinhar } : {}),
    ...(origem.entrelinhas && origem.entrelinhas !== ENTRELINHAS_BASE ? { entrelinhas: origem.entrelinhas } : {}),
    trechos: ts,
  } as Bloco<T>
}

// ─── Forma canônica e texto ──────────────────────────────────────────────────

/**
 * Os bytes do hash. Os objetos da árvore são sempre montados na mesma ordem
 * de chaves (conversor e `interpolar`), então o JSON é estável. Quem exibe
 * calcula o hash dos bytes que RECEBEU — nunca reserializa.
 */
export function formaCanonica(doc: DocumentoResolvido): string {
  return JSON.stringify(doc)
}

/** Texto corrido — busca, export LGPD e a leitura sem tela. */
export function textoDoDocumento(doc: DocumentoResolvido): string {
  const junta = (ts: Trecho[]) => ts.map(t => t.texto).join('')
  const dos = (bs: Bloco<Trecho>[], prefixo = ''): string[] => {
    const partes: string[] = []
    for (const b of bs) {
      switch (b.tipo) {
        case 'paragrafo':
        case 'titulo':    partes.push(prefixo + junta(b.trechos)); break
        case 'lista':     b.itens.forEach((it, i) => {
          const marca = b.ordenada ? `${(b.inicio ?? 1) + i}.` : '•'
          const [primeiro, ...resto] = dos(it, prefixo + '   ')
          partes.push(`${prefixo}${marca} ${(primeiro ?? '').trimStart()}`, ...resto)
        }); break
        case 'tabela':    for (const l of b.linhas) partes.push(prefixo + l.celulas.map(c => dos(c.blocos).join(' ')).join(' | ')); break
        case 'imagem':    partes.push('[imagem]'); break
        case 'divisoria': partes.push('—'); break
        case 'quebra':    break
        case 'assinatura': partes.push('[assinatura]'); break
      }
    }
    return partes
  }
  return [...dos(doc.cabecalho), ...dos(doc.blocos), ...dos(doc.rodape)].join('\n\n')
}

// ─── A v1 (marcação leve), para desenhar o que já foi emitido nela ───────────

export function deV1(v1: ArvoreV1): DocumentoResolvido {
  const trechos = (ts: TrechoV1[]): Trecho[] => ts.map(t => (t.negrito ? { texto: t.texto, negrito: true as const } : { texto: t.texto }))
  const blocos: Bloco<Trecho>[] = v1.map((b): Bloco<Trecho> => {
    switch (b.tipo) {
      case 'titulo':    return b.nivel === 1
        ? { tipo: 'titulo', nivel: 1, alinhar: 'centro', trechos: trechos(b.trechos) }
        : { tipo: 'titulo', nivel: 2, trechos: trechos(b.trechos) }
      case 'paragrafo': return { tipo: 'paragrafo', trechos: trechos(b.linhas.flatMap((l, i) => (i ? [{ texto: '\n' }, ...l] : l))) }
      case 'lista':     return { tipo: 'lista', ordenada: b.ordenada, itens: b.itens.map(it => [{ tipo: 'paragrafo', trechos: trechos(it) }]) }
      default:          return b
    }
  })
  return { versao: 2, base: { fonte: FONTE_BASE, tamanho: TAMANHO_BASE }, cabecalho: [], rodape: [], blocos }
}

/** Lê o conteúdo gravado (a forma canônica, v1 ou v2) para desenhar. */
export function lerConteudo(conteudo: string): DocumentoResolvido | null {
  try {
    const bruto = JSON.parse(conteudo) as unknown
    if (Array.isArray(bruto)) return deV1(bruto as ArvoreV1)
    if (bruto && typeof bruto === 'object' && (bruto as { versao?: unknown }).versao === 2) return bruto as DocumentoResolvido
    return null
  } catch {
    return null
  }
}
