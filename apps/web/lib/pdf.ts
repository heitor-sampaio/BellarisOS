import 'server-only'

/**
 * Gerador mínimo de PDF, sem dependência externa.
 *
 * O relatório de dados pessoais precisa sair legível para o cliente, e as
 * alternativas eram entregar um HTML (que ele teria de imprimir) ou somar uma
 * biblioteca de PDF ao monorepo — o que obrigaria a mexer no lockfile, e o
 * build de produção roda `pnpm install --frozen-lockfile`.
 *
 * O escopo aqui é deliberadamente estreito: texto corrido, títulos e pares
 * rótulo/valor, em A4 com quebra de página automática. Usa as fontes base-14
 * (Helvetica), que não precisam ser embutidas, e WinAnsiEncoding.
 * Não faz imagens, tabelas com bordas nem cores.
 */

const PAGE_W = 595.28 // A4 em pontos
const PAGE_H = 841.89
const MARGIN = 56
const LINE   = 14

type Font = 'regular' | 'bold'

type Line = { text: string; font: Font; size: number; gapBefore: number }

export type PdfSection = {
  title?: string
  /** Pares rótulo/valor, um por linha. */
  fields?: [string, string][]
  /** Linhas soltas de texto. */
  lines?: string[]
  /** Aviso de que a seção está vazia. */
  emptyLabel?: string
}

export type PdfDoc = {
  title:     string
  subtitle?: string
  sections:  PdfSection[]
  footer?:   string
}

// ─── Codificação ─────────────────────────────────────────────────────────────

// WinAnsi (CP1252) difere de latin-1 na faixa 0x80–0x9F, onde ficam aspas
// tipográficas, travessões e reticências — justamente o que aparece em texto
// em português. Sem este mapa esses caracteres saem trocados no leitor.
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84,
  '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

function toWinAnsi(text: string): Buffer {
  const bytes: number[] = []
  for (const ch of text) {
    const extra = WIN_ANSI_EXTRA[ch]
    if (extra != null) { bytes.push(extra); continue }
    const code = ch.codePointAt(0)!
    // Fora do repertório: '?' é melhor que um byte inválido no stream.
    bytes.push(code <= 0xff ? code : 0x3f)
  }
  return Buffer.from(bytes)
}

/** Escapa os três caracteres que têm significado dentro de uma string PDF. */
function escapePdfText(text: string): string {
  return text.replace(/([\\()])/g, '\\$1')
}

// ─── Métrica e quebra de linha ───────────────────────────────────────────────

// Larguras médias por caractere das Helvetica, em milésimos de em. Não é a
// tabela completa de métricas: serve para decidir onde quebrar a linha, e um
// erro de alguns pontos só muda o ponto da quebra, não a validade do arquivo.
const AVG_W = { regular: 0.5, bold: 0.55 }

function textWidth(text: string, size: number, font: Font): number {
  return text.length * size * AVG_W[font]
}

function wrap(text: string, size: number, font: Font, maxWidth: number): string[] {
  if (!text) return ['']
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (textWidth(candidate, size, font) <= maxWidth) {
      line = candidate
    } else {
      if (line) out.push(line)
      // Palavra maior que a linha inteira (URL, hash): corta na força.
      if (textWidth(w, size, font) > maxWidth) {
        const perLine = Math.max(1, Math.floor(maxWidth / (size * AVG_W[font])))
        for (let i = 0; i < w.length; i += perLine) out.push(w.slice(i, i + perLine))
        line = ''
      } else {
        line = w
      }
    }
  }
  if (line) out.push(line)
  return out.length ? out : ['']
}

// ─── Montagem do documento ───────────────────────────────────────────────────

function buildLines(doc: PdfDoc): Line[] {
  const usable = PAGE_W - MARGIN * 2
  const lines: Line[] = []

  for (const l of wrap(doc.title, 18, 'bold', usable)) {
    lines.push({ text: l, font: 'bold', size: 18, gapBefore: 0 })
  }
  if (doc.subtitle) {
    for (const l of wrap(doc.subtitle, 10, 'regular', usable)) {
      lines.push({ text: l, font: 'regular', size: 10, gapBefore: 4 })
    }
  }

  for (const section of doc.sections) {
    if (section.title) {
      for (const l of wrap(section.title, 13, 'bold', usable)) {
        lines.push({ text: l, font: 'bold', size: 13, gapBefore: 18 })
      }
    }

    const hasContent = (section.fields?.length ?? 0) > 0 || (section.lines?.length ?? 0) > 0
    if (!hasContent) {
      lines.push({ text: section.emptyLabel ?? 'Nenhum registro.', font: 'regular', size: 10, gapBefore: 6 })
      continue
    }

    for (const [label, value] of section.fields ?? []) {
      const text = `${label}: ${value}`
      wrap(text, 10, 'regular', usable).forEach((l, i) => {
        lines.push({ text: l, font: 'regular', size: 10, gapBefore: i === 0 ? 6 : 0 })
      })
    }

    for (const raw of section.lines ?? []) {
      wrap(raw, 10, 'regular', usable).forEach((l, i) => {
        lines.push({ text: l, font: 'regular', size: 10, gapBefore: i === 0 ? 6 : 0 })
      })
    }
  }

  if (doc.footer) {
    for (const l of wrap(doc.footer, 9, 'regular', usable)) {
      lines.push({ text: l, font: 'regular', size: 9, gapBefore: 20 })
    }
  }

  return lines
}

function paginate(lines: Line[]): Line[][] {
  const pages: Line[][] = []
  let page: Line[] = []
  let y = PAGE_H - MARGIN

  for (const original of lines) {
    let line = original
    let advance = LINE + line.gapBefore
    if (y - advance < MARGIN) {
      pages.push(page)
      page = []
      y = PAGE_H - MARGIN
      // Sem repetir o espaçamento no topo da página nova.
      line = { ...line, gapBefore: 0 }
      advance = LINE
    }
    y -= advance
    page.push(line)
  }
  if (page.length) pages.push(page)
  return pages.length ? pages : [[]]
}

function contentStream(page: Line[]): Buffer {
  const parts: Buffer[] = []
  let y = PAGE_H - MARGIN

  for (const line of page) {
    y -= LINE + line.gapBefore
    const font = line.font === 'bold' ? '/F2' : '/F1'
    const head = Buffer.from(`BT ${font} ${line.size} Tf 1 0 0 1 ${MARGIN.toFixed(2)} ${y.toFixed(2)} Tm (`, 'latin1')
    const body = toWinAnsi(escapePdfText(line.text))
    parts.push(head, body, Buffer.from(') Tj ET\n', 'latin1'))
  }
  return Buffer.concat(parts)
}

/** Monta o PDF completo e devolve os bytes do arquivo. */
export function buildPdf(doc: PdfDoc): Buffer {
  const pages = paginate(buildLines(doc))

  // Ordem dos objetos: 1 catálogo, 2 pages, 3..(2+n) páginas,
  // depois os streams, e por fim as duas fontes.
  const pageObjStart    = 3
  const contentObjStart = pageObjStart + pages.length
  const fontRegularObj  = contentObjStart + pages.length
  const fontBoldObj     = fontRegularObj + 1
  const totalObjects    = fontBoldObj

  const objects: Buffer[] = []
  const push = (s: string) => objects.push(Buffer.from(s, 'latin1'))

  push(`<< /Type /Catalog /Pages 2 0 R >>`)

  const kids = pages.map((_, i) => `${pageObjStart + i} 0 R`).join(' ')
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)

  pages.forEach((_, i) => {
    push(
      `<< /Type /Page /Parent 2 0 R ` +
      `/MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
      `/Contents ${contentObjStart + i} 0 R ` +
      `/Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R >> >> >>`,
    )
  })

  for (const page of pages) {
    const stream = contentStream(page)
    objects.push(Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'),
      stream,
      Buffer.from('\nendstream', 'latin1'),
    ]))
  }

  push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)
  push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`)

  // Serializa acumulando offsets — a xref precisa do byte exato de cada objeto.
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')]
  let offset = chunks[0]!.length
  const offsets: number[] = []

  objects.forEach((body, i) => {
    const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1')
    const tail = Buffer.from('\nendobj\n', 'latin1')
    offsets.push(offset)
    chunks.push(head, body, tail)
    offset += head.length + body.length + tail.length
  })

  const xrefOffset = offset
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  chunks.push(Buffer.from(xref, 'latin1'))

  return Buffer.concat(chunks)
}
