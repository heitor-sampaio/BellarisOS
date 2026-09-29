import 'server-only'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'
import { arquivoDaFonte, type EstiloDeFonte, type FonteDeDocumento } from '../fontes'

/**
 * As fontes do documento, embutidas no PDF — os MESMOS arquivos TTF que a tela
 * usa (`public/fontes-documento/`).
 *
 * `subset: false` de propósito: o subset do pdf-lib embaralha glifos em
 * algumas fontes (bugs conhecidos), e num documento assinado uma letra trocada
 * é inaceitável. O PDF fica maior (a fonte inteira por estilo usado).
 */

const bytesEmCache = new Map<string, Uint8Array>()

/** `public/` — no standalone o servidor muda o cwd para `apps/web`. */
function pastaPublica(): string {
  const candidatas = [path.join(process.cwd(), 'public'), path.join(process.cwd(), 'apps', 'web', 'public')]
  return candidatas.find(p => existsSync(path.join(p, 'fontes-documento'))) ?? candidatas[0]!
}

async function bytesDaFonte(fonte: FonteDeDocumento, estilo: EstiloDeFonte): Promise<Uint8Array> {
  const rel = arquivoDaFonte(fonte, estilo)
  const guardado = bytesEmCache.get(rel)
  if (guardado) return guardado
  const bytes = new Uint8Array(await readFile(path.join(pastaPublica(), rel)))
  bytesEmCache.set(rel, bytes)
  return bytes
}

export interface FonteEmbutida {
  pdf:        PDFFont
  /** Os caracteres que a fonte desenha — o resto é trocado antes de medir. */
  caracteres: Set<number>
}

/** As fontes de UM PDF: embute cada (fonte, estilo) uma vez só. */
export class FontesDoPdf {
  private readonly embutidas = new Map<string, FonteEmbutida>()

  constructor(private readonly pdf: PDFDocument) {
    pdf.registerFontkit(fontkit)
  }

  /** Embute antes de diagramar: medir e desenhar são síncronos. */
  async preparar(pares: Iterable<[FonteDeDocumento, EstiloDeFonte]>): Promise<void> {
    for (const [fonte, estilo] of pares) {
      const chave = `${fonte}/${estilo}`
      if (this.embutidas.has(chave)) continue
      const f = await this.pdf.embedFont(await bytesDaFonte(fonte, estilo), { subset: false })
      this.embutidas.set(chave, { pdf: f, caracteres: new Set(f.getCharacterSet()) })
    }
  }

  obter(fonte: FonteDeDocumento, estilo: EstiloDeFonte): FonteEmbutida {
    const f = this.embutidas.get(`${fonte}/${estilo}`)
    if (!f) throw new Error(`Fonte não preparada: ${fonte}/${estilo}`)
    return f
  }
}

/**
 * Troca o que a fonte não tem (emoji, símbolos raros) por "?" — sem isso o
 * pdf-lib desenharia um glifo vazio, ou lançaria. Aspas e travessões comuns
 * existem nas fontes do catálogo.
 */
export function soQueAFonteDesenha(texto: string, caracteres: Set<number>): string {
  let saida = ''
  for (const ch of texto) {
    const cp = ch.codePointAt(0)!
    if (ch === '\n' || caracteres.has(cp)) saida += ch
    else if (cp === 0x00a0) saida += ' '
    else if (cp >= 0xfe00 && cp <= 0xfe0f) continue // seletores de variação (emoji)
    else if (cp === 0x200d) continue
    else saida += '?'
  }
  return saida
}
