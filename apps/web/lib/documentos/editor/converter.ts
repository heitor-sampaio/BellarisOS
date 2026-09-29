/**
 * Do JSON do editor (Tiptap/ProseMirror) para a árvore do modelo (`arvore.ts`).
 *
 * É a PORTA de entrada do que vai ser assinado, e roda nos dois lados: no
 * navegador (a prévia) e no servidor (ao salvar e ao montar o documento).
 * Só passa o que a árvore conhece — nó, marca e atributo de fora da lista é
 * erro, porque o JSON vem do navegador e o servidor não confia nele.
 *
 * O que um texto colado do Word traz é NORMALIZADO, não recusado: fonte fora
 * do catálogo vira a base (as do Office viram a equivalente livre), tamanho
 * vai para o mais próximo da lista, cor só em `#rrggbb`.
 */

import {
  FONTE_BASE, TAMANHO_BASE, fonteDoCss, tamanhoMaisProximo,
} from '../fontes'
import {
  ENTRELINHAS, ENTRELINHAS_BASE, soEstilo,
  type Alinhamento, type Bloco, type Celula, type DocumentoDoModelo, type Estilo, type TrechoDeModelo,
} from '../arvore'

/** O que o editor grava: o corpo e, se houver, o cabeçalho e o rodapé. */
export interface DocumentoDoEditor {
  corpo:      NoPM
  cabecalho?: NoPM | null
  rodape?:    NoPM | null
}

export interface NoPM {
  type:     string
  attrs?:   Record<string, unknown>
  content?: NoPM[]
  marks?:   { type: string; attrs?: Record<string, unknown> }[]
  text?:    string
}

export const LIMITES = {
  bytes:      500_000,
  caracteres: 60_000,
  imagens:    10,
  linhas:     40,
  colunas:    10,
} as const

const RE_VARIAVEL = /^[a-z_]+(?:\.[a-z_]+)+$/
const RE_SHA256 = /^[0-9a-f]{64}$/

class ErroDoDocumento extends Error {}

// ─── Estilo ──────────────────────────────────────────────────────────────────

export function corHex(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  const v = valor.trim().toLowerCase()
  let m = /^#([0-9a-f]{6})$/.exec(v)
  if (m) return `#${m[1]}`
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v)
  if (m) {
    if (m[4] !== undefined && Number(m[4]) === 0) return undefined
    const hex = [m[1], m[2], m[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
    return `#${hex}`
  }
  return undefined
}

/** `12pt`, `16px`, `12` → pontos, no tamanho mais próximo da lista. */
export function tamanhoEmPontos(valor: unknown): number | undefined {
  if (typeof valor === 'number') return tamanhoMaisProximo(valor)
  if (typeof valor !== 'string') return undefined
  const m = /^([\d.]+)\s*(pt|px)?$/.exec(valor.trim().toLowerCase())
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return undefined
  return tamanhoMaisProximo(m[2] === 'px' ? n * 0.75 : n)
}

function estiloDasMarcas(marcas: NoPM['marks']): Estilo {
  const e: Estilo = {}
  for (const m of marcas ?? []) {
    switch (m.type) {
      case 'bold':      e.negrito = true; break
      case 'italic':    e.italico = true; break
      case 'underline': e.sublinhado = true; break
      case 'strike':    e.tachado = true; break
      case 'textStyle': {
        const fonte = fonteDoCss(m.attrs?.fontFamily)
        if (fonte && fonte !== FONTE_BASE) e.fonte = fonte
        const tamanho = tamanhoEmPontos(m.attrs?.fontSize)
        if (tamanho && tamanho !== TAMANHO_BASE) e.tamanho = tamanho
        const cor = corHex(m.attrs?.color)
        if (cor) e.cor = cor
        break
      }
      case 'highlight': {
        e.realce = corHex(m.attrs?.color) ?? '#fff3a3'
        break
      }
      // O editor não produz link, código nem outras marcas; um colado que as
      // traga perde a marca e fica o texto.
      default: break
    }
  }
  return soEstilo(e)
}

function alinhamento(v: unknown): Alinhamento | undefined {
  switch (v) {
    case 'center':  return 'centro'
    case 'right':   return 'direita'
    case 'justify': return 'justificado'
    default:        return undefined
  }
}

function entrelinhas(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  const mais = ENTRELINHAS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), ENTRELINHAS_BASE as number)
  return mais === ENTRELINHAS_BASE ? undefined : mais
}

// ─── Conversão ───────────────────────────────────────────────────────────────

type Onde = 'corpo' | 'cabecalho' | 'rodape' | 'lista' | 'celula'

interface Contexto {
  caracteres: number
  imagens:    number
  tenantId:   string | null
}

function trechosDe(nos: NoPM[] | undefined, ctx: Contexto): TrechoDeModelo[] {
  const saida: TrechoDeModelo[] = []
  const pushTexto = (texto: string, estilo: Estilo) => {
    if (!texto) return
    ctx.caracteres += texto.length
    const anterior = saida[saida.length - 1]
    if (anterior && 'texto' in anterior && JSON.stringify(soEstilo(anterior)) === JSON.stringify(estilo)) anterior.texto += texto
    else saida.push({ texto, ...estilo })
  }
  for (const n of nos ?? []) {
    switch (n.type) {
      case 'text':
        pushTexto(typeof n.text === 'string' ? n.text : '', estiloDasMarcas(n.marks))
        break
      case 'hardBreak':
        pushTexto('\n', estiloDasMarcas(n.marks))
        break
      case 'variavel': {
        const nome = n.attrs?.nome
        if (typeof nome !== 'string' || !RE_VARIAVEL.test(nome)) throw new ErroDoDocumento('Há uma variável com nome inválido no texto.')
        saida.push({ variavel: nome, ...estiloDasMarcas(n.marks) })
        break
      }
      default:
        throw new ErroDoDocumento(`O texto tem um elemento que o documento não aceita (${String(n.type).slice(0, 40)}).`)
    }
  }
  return saida
}

function blocoDeTexto(n: NoPM, ctx: Contexto): Bloco<TrechoDeModelo> {
  const alinhar = alinhamento(n.attrs?.textAlign)
  const entre = entrelinhas(n.attrs?.entrelinhas)
  const trechos = trechosDe(n.content, ctx)
  if (n.type === 'heading') {
    const bruto = Number(n.attrs?.level)
    const nivel = (bruto <= 1 ? 1 : bruto === 2 ? 2 : 3) as 1 | 2 | 3
    return { tipo: 'titulo', nivel, ...(alinhar ? { alinhar } : {}), ...(entre ? { entrelinhas: entre } : {}), trechos }
  }
  return { tipo: 'paragrafo', ...(alinhar ? { alinhar } : {}), ...(entre ? { entrelinhas: entre } : {}), trechos }
}

function imagem(n: NoPM, ctx: Contexto): Bloco<TrechoDeModelo> {
  const a = n.attrs ?? {}
  const caminho = a.caminho, sha256 = a.sha256
  if (typeof caminho !== 'string' || typeof sha256 !== 'string' || !RE_SHA256.test(sha256)
      || !/^[0-9a-f-]{36}\/imagens\/[0-9a-f]{64}\.(png|jpg)$/.test(caminho)) {
    throw new ErroDoDocumento('Uma imagem do documento está com a referência inválida. Remova e envie de novo.')
  }
  if (ctx.tenantId && !caminho.startsWith(`${ctx.tenantId}/`)) {
    throw new ErroDoDocumento('Uma imagem do documento não é desta rede. Remova e envie de novo.')
  }
  if (!caminho.includes(sha256)) throw new ErroDoDocumento('Uma imagem do documento está com a referência inválida.')
  if (++ctx.imagens > LIMITES.imagens) throw new ErroDoDocumento(`O documento passou de ${LIMITES.imagens} imagens.`)
  const num = (v: unknown, min: number, max: number) => {
    const x = Number(v)
    return Number.isFinite(x) ? Math.round(Math.min(max, Math.max(min, x)) * 100) / 100 : null
  }
  const largura = num(a.largura, 8, 483), altura = num(a.altura, 8, 700)
  if (largura == null || altura == null) throw new ErroDoDocumento('Uma imagem do documento está sem tamanho.')
  const alinhar = a.alinhar === 'centro' || a.alinhar === 'direita' ? a.alinhar : undefined
  return { tipo: 'imagem', caminho, sha256, largura, altura, ...(alinhar ? { alinhar } : {}) }
}

function tabela(n: NoPM, ctx: Contexto): Bloco<TrechoDeModelo> {
  const linhas = (n.content ?? []).filter(l => l.type === 'tableRow')
  if (!linhas.length) throw new ErroDoDocumento('Há uma tabela vazia no documento.')
  if (linhas.length > LIMITES.linhas) throw new ErroDoDocumento(`Uma tabela passou de ${LIMITES.linhas} linhas.`)

  let colunas = 0
  const saida = linhas.map(l => {
    let soma = 0
    const celulas = (l.content ?? []).map((c): Celula<TrechoDeModelo> => {
      if (c.type !== 'tableCell' && c.type !== 'tableHeader') throw new ErroDoDocumento('Há um elemento inválido numa tabela.')
      const rowspan = Number(c.attrs?.rowspan ?? 1)
      if (rowspan > 1) throw new ErroDoDocumento('A tabela tem células mescladas na vertical, que o documento não suporta. Desfaça a mesclagem.')
      const colspan = Math.max(1, Math.min(LIMITES.colunas, Number(c.attrs?.colspan ?? 1) || 1))
      soma += colspan
      return {
        ...(c.type === 'tableHeader' ? { cabecalho: true as const } : {}),
        ...(colspan > 1 ? { colspan } : {}),
        blocos: blocos(c.content, 'celula', ctx),
      }
    })
    colunas = Math.max(colunas, soma)
    return { celulas, larguras: (l.content ?? []).flatMap(c => {
      const w = c.attrs?.colwidth
      const span = Math.max(1, Number(c.attrs?.colspan ?? 1) || 1)
      return Array.isArray(w) && w.length === span && w.every(x => typeof x === 'number' && x > 0) ? (w as number[]) : Array(span).fill(null)
    }) }
  })
  if (colunas > LIMITES.colunas) throw new ErroDoDocumento(`Uma tabela passou de ${LIMITES.colunas} colunas.`)

  // As larguras vêm da primeira linha com todas as colunas medidas (a que o
  // editor redimensionou); sem nenhuma, colunas iguais. Guardadas em fração.
  const medida = saida.find(l => l.larguras.length === colunas && l.larguras.every(x => x != null))?.larguras as number[] | undefined
  const brutas = medida ?? Array(colunas).fill(1)
  const total = brutas.reduce((s, x) => s + x, 0)
  const larguras = brutas.map(x => Math.round((x / total) * 10_000) / 10_000)

  return { tipo: 'tabela', larguras, linhas: saida.map(l => ({ celulas: l.celulas })) }
}

function blocos(nos: NoPM[] | undefined, onde: Onde, ctx: Contexto): Bloco<TrechoDeModelo>[] {
  const saida: Bloco<TrechoDeModelo>[] = []
  for (const n of nos ?? []) {
    switch (n.type) {
      case 'paragraph':
      case 'heading':
        saida.push(blocoDeTexto(n, ctx))
        break
      case 'bulletList':
      case 'orderedList': {
        const inicio = Number(n.attrs?.start ?? 1)
        saida.push({
          tipo: 'lista', ordenada: n.type === 'orderedList',
          ...(n.type === 'orderedList' && Number.isInteger(inicio) && inicio > 1 && inicio < 10_000 ? { inicio } : {}),
          itens: (n.content ?? []).map(item => {
            if (item.type !== 'listItem') throw new ErroDoDocumento('Há um elemento inválido numa lista.')
            return blocos(item.content, 'lista', ctx)
          }),
        })
        break
      }
      case 'table':
        if (onde === 'celula') throw new ErroDoDocumento('Tabela dentro de tabela não é suportada.')
        saida.push(tabela(n, ctx))
        break
      case 'imagemDoDocumento':
        saida.push(imagem(n, ctx))
        break
      case 'horizontalRule':
        saida.push({ tipo: 'divisoria' })
        break
      case 'quebraDePagina':
        // Só no corpo: no cabeçalho, numa lista ou numa célula não há o que quebrar.
        if (onde !== 'corpo') throw new ErroDoDocumento('A quebra de página só vale no corpo do documento, fora de listas e tabelas.')
        saida.push({ tipo: 'quebra' })
        break
      case 'assinatura':
        if (onde !== 'corpo' && onde !== 'celula') throw new ErroDoDocumento('O lugar da assinatura vai no corpo do documento (ou numa tabela), não no cabeçalho, no rodapé ou numa lista.')
        saida.push({ tipo: 'assinatura' })
        break
      default:
        throw new ErroDoDocumento(`O documento tem um elemento que não é aceito (${String(n.type).slice(0, 40)}).`)
    }
  }
  return saida
}

function parte(no: NoPM | null | undefined, onde: Onde, ctx: Contexto): Bloco<TrechoDeModelo>[] {
  if (!no) return []
  if (no.type !== 'doc') throw new ErroDoDocumento('O documento enviado não tem a forma esperada.')
  const bs = blocos(no.content, onde, ctx)
  // Cabeçalho ou rodapé só com um parágrafo vazio é "sem cabeçalho".
  const vazio = bs.every(b => b.tipo === 'paragrafo' && b.trechos.length === 0)
  return onde !== 'corpo' && vazio ? [] : bs
}

/**
 * Converte, ou diz por que não. `tenantId` confere que as imagens são da rede
 * (no servidor); a prévia do navegador passa nulo.
 */
export function converterDocumentoDoEditor(
  entrada: unknown, opcoes: { tenantId: string | null },
): { documento: DocumentoDoModelo } | { erro: string } {
  try {
    if (!entrada || typeof entrada !== 'object') throw new ErroDoDocumento('O documento enviado não tem a forma esperada.')
    if (JSON.stringify(entrada).length > LIMITES.bytes) throw new ErroDoDocumento('O documento ficou grande demais para salvar.')
    const e = entrada as DocumentoDoEditor
    const ctx: Contexto = { caracteres: 0, imagens: 0, tenantId: opcoes.tenantId }
    const documento: DocumentoDoModelo = {
      versao: 2,
      base: { fonte: FONTE_BASE, tamanho: TAMANHO_BASE },
      cabecalho: parte(e.cabecalho, 'cabecalho', ctx),
      rodape: parte(e.rodape, 'rodape', ctx),
      blocos: parte(e.corpo, 'corpo', ctx),
    }
    if (ctx.caracteres > LIMITES.caracteres) {
      throw new ErroDoDocumento(`O texto passou de ${LIMITES.caracteres.toLocaleString('pt-BR')} caracteres.`)
    }
    const temConteudo = documento.blocos.some(b => b.tipo !== 'paragrafo' || b.trechos.length > 0)
    if (!temConteudo) throw new ErroDoDocumento('Escreva o texto do documento.')
    return { documento }
  } catch (e) {
    if (e instanceof ErroDoDocumento) return { erro: e.message }
    throw e
  }
}
