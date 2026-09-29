import 'server-only'
import { rgb, type PDFDocument, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import {
  estiloEfetivo, todosOsBlocos, ENTRELINHAS_BASE, FATOR_DE_LINHA, ESPACO_DEPOIS_DO_PARAGRAFO,
  ESPACO_ANTES_DO_TITULO, RECUO_DA_LISTA, TAMANHO_DO_TITULO, PAGINA,
  type Alinhamento, type BlocoResolvido, type DocumentoResolvido, type Trecho,
} from '../arvore'
import { estiloDe, type EstiloDeFonte, type FonteDeDocumento } from '../fontes'
import { soQueAFonteDesenha, type FontesDoPdf, type FonteEmbutida } from './fontes'

/**
 * A diagramação do documento no PDF — a MESMA árvore que a tela desenha
 * (`components/shared/documento-renderizado.tsx`), com as mesmas fontes e
 * medidas (`arvore.ts`: página, entrelinhas, recuos, tamanhos de título).
 *
 * Duas etapas: os blocos viram ITENS com altura (linhas de texto, espaços,
 * imagens, linhas de tabela), e o paginador põe os itens nas páginas —
 * quebra de página onde não cabe, cabeçalho e rodapé em toda página. Linha de
 * tabela que não cabe vai para a página seguinte; maior que uma página, é
 * dividida célula a célula, sem cortar conteúdo.
 */

export const SELO = 26 // o rodapé "Assinado eletronicamente" (desenhado em pdf.ts)
const PAD_H = 5
const PAD_V = 4
const BORDA = rgb(0.6, 0.6, 0.6)
const FUNDO_DO_CABECALHO = rgb(0.949, 0.949, 0.949)
const CINZA = rgb(0.42, 0.42, 0.42)

export function corPdf(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// ─── Itens ───────────────────────────────────────────────────────────────────

type Desenho = (p: PDFPage, x: number, yTopo: number) => void

export type Item =
  | { tipo: 'linha'; altura: number; dx: number; desenhar: Desenho; marcador?: { base: number; tamanho: number } }
  | { tipo: 'espaco'; altura: number }
  | { tipo: 'quebra' }
  | { tipo: 'tabela'; dx: number; linhas: { celulas: CelulaPronta[] }[] }

interface CelulaPronta { x: number; largura: number; itens: Item[]; fundo: RGB | null }

export interface Contexto {
  fontes:     FontesDoPdf
  base:       DocumentoResolvido['base']
  imagens:    Map<string, PDFImage>
  assinatura: { imagem: PDFImage | null; nome: string }
}

// ─── Texto: palavras, linhas ─────────────────────────────────────────────────

interface Palavra {
  texto: string; fonte: FonteEmbutida; tamanho: number; cor: RGB
  sublinhado: boolean; tachado: boolean; realce: RGB | null
  largura: number; espaco: boolean
}
interface Linha { palavras: Palavra[]; forcada: boolean }

export interface OpcoesDeTexto {
  alinhar?:     Alinhamento
  entrelinhas?: number
  /** Nível do título (negrito e tamanho padrão do título). */
  titulo?:      1 | 2 | 3 | null
  /** Para a página de evidências: força tamanho/cor de tudo. */
  tamanho?:     number
  cor?:         RGB
}

function palavrasDe(trechos: Trecho[], ctx: Contexto, o: OpcoesDeTexto): (Palavra | 'quebra')[] {
  const saida: (Palavra | 'quebra')[] = []
  for (const t of trechos) {
    const e = estiloEfetivo(t, ctx.base, !!o.titulo)
    const tamanho = o.tamanho ?? t.tamanho ?? (o.titulo ? TAMANHO_DO_TITULO[o.titulo] : ctx.base.tamanho)
    const fonte = ctx.fontes.obter(e.fonte, estiloDe(e.negrito, e.italico))
    const cor = o.cor ?? corPdf(e.cor)
    const texto = soQueAFonteDesenha(t.texto.replace(/\t/g, ' '), fonte.caracteres)
    for (const parte of texto.split(/(\n| +)/)) {
      if (!parte) continue
      if (parte === '\n') { saida.push('quebra'); continue }
      saida.push({
        texto: parte, fonte, tamanho, cor, sublinhado: e.sublinhado, tachado: e.tachado,
        realce: e.realce ? corPdf(e.realce) : null,
        largura: fonte.pdf.widthOfTextAtSize(parte, tamanho), espaco: parte.trim() === '',
      })
    }
  }
  return saida
}

/** Palavra maior que a linha (um endereço, um código) é partida por letra. */
function partir(p: Palavra, max: number): Palavra[] {
  const pedacos: Palavra[] = []
  let atual = ''
  for (const ch of p.texto) {
    const tentativa = atual + ch
    if (atual && p.fonte.pdf.widthOfTextAtSize(tentativa, p.tamanho) > max) {
      pedacos.push({ ...p, texto: atual, largura: p.fonte.pdf.widthOfTextAtSize(atual, p.tamanho) })
      atual = ch
    } else atual = tentativa
  }
  if (atual) pedacos.push({ ...p, texto: atual, largura: p.fonte.pdf.widthOfTextAtSize(atual, p.tamanho) })
  return pedacos
}

function quebrarEmLinhas(tokens: (Palavra | 'quebra')[], max: number): Linha[] {
  const linhas: Linha[] = []
  let atual: Palavra[] = []
  let largura = 0
  const fechar = (forcada: boolean) => {
    while (atual.length && atual[atual.length - 1]!.espaco) atual.pop()
    linhas.push({ palavras: atual, forcada })
    atual = []; largura = 0
  }
  for (const tok of tokens) {
    if (tok === 'quebra') { fechar(true); continue }
    if (tok.espaco) {
      if (!atual.length && linhas.length) continue // espaço no começo de linha quebrada
      atual.push(tok); largura += tok.largura
      continue
    }
    const pedacos = tok.largura > max ? partir(tok, max) : [tok]
    for (const pd of pedacos) {
      const temConteudo = atual.some(p => !p.espaco)
      if (temConteudo && largura + pd.largura > max) fechar(false)
      atual.push(pd); largura += pd.largura
    }
  }
  fechar(true)
  return linhas
}

function larguraDe(ps: Palavra[]) { return ps.reduce((s, p) => s + p.largura, 0) }

/** Um parágrafo em itens de linha (e o espaço depois, se pedido). */
export function itensDeTexto(trechos: Trecho[], largura: number, ctx: Contexto, o: OpcoesDeTexto = {}): Item[] {
  const entre = o.entrelinhas ?? ENTRELINHAS_BASE
  const linhas = quebrarEmLinhas(palavrasDe(trechos, ctx, o), largura)
  const tamanhoVazio = o.tamanho ?? (o.titulo ? TAMANHO_DO_TITULO[o.titulo] : ctx.base.tamanho)
  return linhas.map((linha, i): Item => {
    const tamanho = Math.max(0, ...linha.palavras.map(p => p.tamanho)) || tamanhoVazio
    const altura = tamanho * FATOR_DE_LINHA * entre
    const base = (altura - tamanho) / 2 + tamanho * 0.8
    const ultima = i === linhas.length - 1
    return {
      tipo: 'linha', altura, dx: 0, marcador: { base, tamanho },
      desenhar: (p, x, yTopo) => {
        const ocupada = larguraDe(linha.palavras)
        const sobra = Math.max(0, largura - ocupada)
        const espacos = linha.palavras.filter(w => w.espaco).length
        const justificar = o.alinhar === 'justificado' && !ultima && !linha.forcada && espacos > 0
        let cx = x + (o.alinhar === 'centro' ? sobra / 2 : o.alinhar === 'direita' ? sobra : 0)
        const extra = justificar ? sobra / espacos : 0
        const y = yTopo - base
        for (const w of linha.palavras) {
          const larg = w.largura + (w.espaco ? extra : 0)
          if (w.realce) p.drawRectangle({ x: cx, y: y - w.tamanho * 0.22, width: larg, height: w.tamanho * 1.05, color: w.realce })
          if (!w.espaco) p.drawText(w.texto, { x: cx, y, size: w.tamanho, font: w.fonte.pdf, color: w.cor })
          if (w.sublinhado) p.drawLine({ start: { x: cx, y: y - w.tamanho * 0.12 }, end: { x: cx + larg, y: y - w.tamanho * 0.12 }, thickness: Math.max(0.5, w.tamanho * 0.06), color: w.cor })
          if (w.tachado) p.drawLine({ start: { x: cx, y: y + w.tamanho * 0.28 }, end: { x: cx + larg, y: y + w.tamanho * 0.28 }, thickness: Math.max(0.5, w.tamanho * 0.06), color: w.cor })
          cx += larg
        }
      },
    }
  })
}

// ─── Blocos → itens ──────────────────────────────────────────────────────────

function deslocar(itens: Item[], dx: number): Item[] {
  return itens.map(it => (it.tipo === 'linha' || it.tipo === 'tabela' ? { ...it, dx: it.dx + dx } : it))
}

function itemDeImagem(img: PDFImage | undefined, largura: number, altura: number, disponivel: number, alinhar: Alinhamento | undefined): Item {
  const escala = Math.min(1, disponivel / largura)
  const w = largura * escala, h = altura * escala
  return {
    tipo: 'linha', altura: h, dx: 0,
    desenhar: (p, x, yTopo) => {
      const ix = x + (alinhar === 'centro' ? (disponivel - w) / 2 : alinhar === 'direita' ? disponivel - w : 0)
      if (img) p.drawImage(img, { x: ix, y: yTopo - h, width: w, height: h })
      else p.drawRectangle({ x: ix, y: yTopo - h, width: w, height: h, borderColor: BORDA, borderWidth: 0.5 })
    },
  }
}

function itemDeAssinatura(ctx: Contexto, disponivel: number): Item {
  const nome = ctx.assinatura.nome
  const fonte = ctx.fontes.obter(ctx.base.fonte, 'regular')
  const texto = soQueAFonteDesenha(nome, fonte.caracteres)
  return {
    tipo: 'linha', altura: 108, dx: 0,
    desenhar: (p, x, yTopo) => {
      const centro = x + disponivel / 2
      const img = ctx.assinatura.imagem
      if (img) {
        const escala = Math.min(Math.min(200, disponivel) / img.width, 70 / img.height)
        const w = img.width * escala, h = img.height * escala
        p.drawImage(img, { x: centro - w / 2, y: yTopo - 14 - 70 + (70 - h) / 2, width: w, height: h })
      }
      const meia = Math.min(130, disponivel / 2)
      p.drawLine({ start: { x: centro - meia, y: yTopo - 88 }, end: { x: centro + meia, y: yTopo - 88 }, thickness: 0.8, color: CINZA })
      const w = fonte.pdf.widthOfTextAtSize(texto, 9)
      p.drawText(texto, { x: centro - w / 2, y: yTopo - 100, size: 9, font: fonte.pdf, color: CINZA })
    },
  }
}

export function itensDosBlocos(blocos: BlocoResolvido[], largura: number, ctx: Contexto): Item[] {
  const itens: Item[] = []
  for (const b of blocos) {
    switch (b.tipo) {
      case 'paragrafo':
        itens.push(...itensDeTexto(b.trechos, largura, ctx, { alinhar: b.alinhar, entrelinhas: b.entrelinhas }))
        itens.push({ tipo: 'espaco', altura: ESPACO_DEPOIS_DO_PARAGRAFO })
        break
      case 'titulo':
        if (itens.length) itens.push({ tipo: 'espaco', altura: ESPACO_ANTES_DO_TITULO })
        itens.push(...itensDeTexto(b.trechos, largura, ctx, { alinhar: b.alinhar, entrelinhas: b.entrelinhas, titulo: b.nivel }))
        itens.push({ tipo: 'espaco', altura: ESPACO_DEPOIS_DO_PARAGRAFO })
        break
      case 'lista': {
        const fonte = ctx.fontes.obter(ctx.base.fonte, 'regular')
        b.itens.forEach((it, i) => {
          const internos = deslocar(itensDosBlocos(it, largura - RECUO_DA_LISTA, ctx), RECUO_DA_LISTA)
          // O espaço depois do último parágrafo do item fica menor, como na tela.
          const primeira = internos.findIndex(x => x.tipo === 'linha')
          if (primeira >= 0) {
            const alvo = internos[primeira] as Extract<Item, { tipo: 'linha' }>
            const marca = b.ordenada ? `${(b.inicio ?? 1) + i}.` : '•'
            const { base, tamanho } = alvo.marcador ?? { base: ctx.base.tamanho * 0.9, tamanho: ctx.base.tamanho }
            const original = alvo.desenhar
            internos[primeira] = {
              ...alvo,
              desenhar: (p, x, yTopo) => {
                original(p, x, yTopo)
                const w = fonte.pdf.widthOfTextAtSize(marca, tamanho)
                p.drawText(marca, { x: x - 4 - w, y: yTopo - base, size: tamanho, font: fonte.pdf, color: corPdf('#1f1f1f') })
              },
            }
          }
          itens.push(...internos)
        })
        break
      }
      case 'tabela': {
        const colunas = b.larguras.map(f => f * largura)
        const inicioDa = (i: number) => colunas.slice(0, i).reduce((s, w) => s + w, 0)
        itens.push({
          tipo: 'tabela', dx: 0,
          linhas: b.linhas.map(l => {
            let col = 0
            return {
              celulas: l.celulas.map(c => {
                const span = c.colspan ?? 1
                const x = inicioDa(col)
                const w = colunas.slice(col, col + span).reduce((s, v) => s + v, 0) || colunas[colunas.length - 1] || largura
                col += span
                const internos = itensDosBlocos(c.blocos, Math.max(10, w - 2 * PAD_H), ctx)
                // O espaço depois do último parágrafo da célula sobra: tira.
                while (internos.length && internos[internos.length - 1]!.tipo === 'espaco') internos.pop()
                return { x, largura: w, itens: internos, fundo: c.cabecalho ? FUNDO_DO_CABECALHO : null }
              }),
            }
          }),
        })
        itens.push({ tipo: 'espaco', altura: ESPACO_DEPOIS_DO_PARAGRAFO })
        break
      }
      case 'imagem':
        itens.push(itemDeImagem(ctx.imagens.get(b.caminho), b.largura, b.altura, largura, b.alinhar))
        itens.push({ tipo: 'espaco', altura: ESPACO_DEPOIS_DO_PARAGRAFO })
        break
      case 'divisoria':
        itens.push({
          tipo: 'linha', altura: 12, dx: 0,
          desenhar: (p, x, yTopo) => p.drawLine({ start: { x, y: yTopo - 5 }, end: { x: x + largura, y: yTopo - 5 }, thickness: 0.6, color: rgb(0.78, 0.78, 0.78) }),
        })
        break
      case 'quebra':
        itens.push({ tipo: 'quebra' })
        break
      case 'assinatura':
        itens.push(itemDeAssinatura(ctx, largura))
        break
    }
  }
  return itens
}

function alturaDe(itens: Item[]): number {
  let h = 0
  for (const it of itens) {
    if (it.tipo === 'linha' || it.tipo === 'espaco') h += it.altura
    else if (it.tipo === 'tabela') h += it.linhas.reduce((s, l) => s + alturaDaLinha(l.celulas), 0)
  }
  return h
}
const alturaDaLinha = (cs: CelulaPronta[]) => Math.max(0, ...cs.map(c => alturaDe(c.itens))) + 2 * PAD_V

// ─── Fontes que o documento usa ──────────────────────────────────────────────

export function fontesDoDocumento(doc: DocumentoResolvido): [FonteDeDocumento, EstiloDeFonte][] {
  const pares = new Map<string, [FonteDeDocumento, EstiloDeFonte]>()
  const add = (f: FonteDeDocumento, e: EstiloDeFonte) => pares.set(`${f}/${e}`, [f, e])
  add(doc.base.fonte, 'regular')
  add(doc.base.fonte, 'negrito')
  for (const b of todosOsBlocos(doc)) {
    if (b.tipo !== 'paragrafo' && b.tipo !== 'titulo') continue
    for (const t of b.trechos) {
      const e = estiloEfetivo(t, doc.base, b.tipo === 'titulo')
      add(e.fonte, estiloDe(e.negrito, e.italico))
    }
  }
  return [...pares.values()]
}

// ─── Paginação ───────────────────────────────────────────────────────────────

export class Paginador {
  pagina!: PDFPage
  y = 0
  private topo = 0
  private limite = 0
  private readonly largura = PAGINA.largura - 2 * PAGINA.margem

  /** Quando cabeçalho/rodapé não cabem em toda página: vão no fluxo, uma vez. */
  readonly noFluxo: { cabecalho: Item[]; rodape: Item[] } | null = null
  private readonly cabecalho: Item[]
  private readonly rodape: Item[]

  constructor(private readonly pdf: PDFDocument, cabecalho: Item[] = [], rodape: Item[] = []) {
    const hCab = alturaDe(cabecalho), hRod = alturaDe(rodape)
    const util = PAGINA.altura - 2 * PAGINA.margem - SELO - (hCab ? hCab + 12 : 0) - (hRod ? hRod + 12 : 0)
    // Cabeçalho e rodapé grandes demais deixariam a página sem corpo: aí eles
    // entram no fluxo, uma vez só (no começo e no fim), em vez de repetir.
    if (util < 160) {
      this.noFluxo = { cabecalho, rodape }
      this.cabecalho = []; this.rodape = []
    } else {
      this.cabecalho = cabecalho; this.rodape = rodape
    }
  }

  get larguraUtil() { return this.largura }

  novaPagina() {
    this.pagina = this.pdf.addPage([PAGINA.largura, PAGINA.altura])
    let y = PAGINA.altura - PAGINA.margem
    if (this.cabecalho.length) {
      y = this.desenharSolto(this.cabecalho, y)
      y -= 12
    }
    this.topo = y
    this.y = y
    let baixo = PAGINA.margem + SELO
    if (this.rodape.length) {
      const h = alturaDe(this.rodape)
      this.desenharSolto(this.rodape, baixo + h)
      baixo += h + 12
    }
    this.limite = baixo
  }

  /** Desenha itens sem paginar (cabeçalho e rodapé). Devolve o y final. */
  private desenharSolto(itens: Item[], yTopo: number): number {
    let y = yTopo
    for (const it of itens) {
      if (it.tipo === 'linha') { it.desenhar(this.pagina, PAGINA.margem + it.dx, y); y -= it.altura }
      else if (it.tipo === 'espaco') y -= it.altura
      else if (it.tipo === 'tabela') {
        for (const l of it.linhas) { this.desenharLinhaDaTabela(l.celulas, it.dx, y, l.celulas.map(c => c.itens)); y -= alturaDaLinha(l.celulas) }
      }
    }
    return y
  }

  colocar(itens: Item[]) {
    if (!this.pagina) this.novaPagina()
    for (const it of itens) {
      switch (it.tipo) {
        case 'quebra':
          if (this.y !== this.topo) this.novaPagina()
          break
        case 'espaco':
          if (this.y === this.topo) break
          if (this.y - it.altura < this.limite) this.novaPagina()
          else this.y -= it.altura
          break
        case 'linha':
          if (this.y - it.altura < this.limite && this.y !== this.topo) this.novaPagina()
          it.desenhar(this.pagina, PAGINA.margem + it.dx, this.y)
          this.y -= it.altura
          break
        case 'tabela':
          for (const l of it.linhas) this.colocarLinhaDaTabela(l.celulas, it.dx)
          break
      }
    }
  }

  private colocarLinhaDaTabela(celulas: CelulaPronta[], dx: number) {
    const h = alturaDaLinha(celulas)
    const cabeInteira = this.topo - this.limite
    if (this.y - h < this.limite && this.y !== this.topo && h <= cabeInteira) this.novaPagina()
    if (this.y - h >= this.limite || h <= cabeInteira) {
      this.desenharLinhaDaTabela(celulas, dx, this.y, celulas.map(c => c.itens))
      this.y -= h
      return
    }
    // Maior que uma página: vai em pedaços, cada célula até onde cabe.
    const filas = celulas.map(c => [...c.itens])
    while (filas.some(f => f.length)) {
      const disponivel = this.y - this.limite - 2 * PAD_V
      const pedaco = filas.map(f => {
        const tomados: Item[] = []
        let usado = 0
        while (f.length) {
          const prox = f[0]!
          const alt = prox.tipo === 'linha' || prox.tipo === 'espaco' ? prox.altura : 0
          if (usado + alt > disponivel && (tomados.length || this.y !== this.topo)) break
          tomados.push(f.shift()!); usado += alt
        }
        return tomados
      })
      if (pedaco.every(p => !p.length)) { this.novaPagina(); continue }
      const alturaDoPedaco = Math.max(...pedaco.map(p => alturaDe(p))) + 2 * PAD_V
      this.desenharLinhaDaTabela(celulas, dx, this.y, pedaco, alturaDoPedaco)
      this.y -= alturaDoPedaco
      if (filas.some(f => f.length)) this.novaPagina()
    }
  }

  private desenharLinhaDaTabela(celulas: CelulaPronta[], dx: number, yTopo: number, conteudo: Item[][], altura?: number) {
    const h = altura ?? alturaDaLinha(celulas)
    const x0 = PAGINA.margem + dx
    celulas.forEach((c, i) => {
      const x = x0 + c.x
      if (c.fundo) this.pagina.drawRectangle({ x, y: yTopo - h, width: c.largura, height: h, color: c.fundo })
      let y = yTopo - PAD_V
      for (const it of conteudo[i] ?? []) {
        if (it.tipo === 'linha') { it.desenhar(this.pagina, x + PAD_H + it.dx, y); y -= it.altura }
        else if (it.tipo === 'espaco') y -= it.altura
      }
      this.pagina.drawRectangle({ x, y: yTopo - h, width: c.largura, height: h, borderColor: BORDA, borderWidth: 0.6 })
    })
  }
}

/**
 * Desenha o documento inteiro, a partir de uma página nova. Cabeçalho e
 * rodapé repetem em toda página (ou entram no fluxo, se não couberem).
 */
export function diagramarDocumento(pdf: PDFDocument, doc: DocumentoResolvido, ctx: Contexto) {
  const largura = PAGINA.largura - 2 * PAGINA.margem
  const semEspacoFinal = (itens: Item[]) => {
    while (itens.length && itens[itens.length - 1]!.tipo === 'espaco') itens.pop()
    return itens
  }
  const cab = semEspacoFinal(itensDosBlocos(doc.cabecalho, largura, ctx))
  const rod = semEspacoFinal(itensDosBlocos(doc.rodape, largura, ctx))
  const p = new Paginador(pdf, cab, rod)
  if (p.noFluxo) p.colocar([...p.noFluxo.cabecalho, { tipo: 'espaco', altura: 12 }])
  p.colocar(itensDosBlocos(doc.blocos, largura, ctx))
  const temLugar = [...todosOsBlocos({ ...doc, cabecalho: [], rodape: [] })].some(b => b.tipo === 'assinatura')
  if (!temLugar) p.colocar([itemDeAssinatura(ctx, largura)])
  if (p.noFluxo) p.colocar([{ tipo: 'espaco', altura: 12 }, ...p.noFluxo.rodape])
}
