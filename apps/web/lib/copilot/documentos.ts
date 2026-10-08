import { inflateRawSync } from 'node:zlib'

/**
 * docx e xlsx em TEXTO, para o Copilot (2026-10-08 — era "mande em PDF").
 * Os dois são um zip de XML: aqui um leitor de zip mínimo (o diretório
 * central e o deflate do próprio Node) e os dois extratores. Sem biblioteca:
 * duas dependências a mais só para isto não compensavam.
 *
 * O texto é cortado antes do teto do anexo de texto (`anexos.ts`), com o
 * aviso de que foi cortado — o modelo diz isso à pessoa em vez de responder
 * sobre metade da planilha como se fosse o todo.
 */

export class ErroDoDocumento extends Error {}

const TETO = 19_000

/** As entradas do zip: nome → conteúdo (só as pedidas, para não descomprimir tudo). */
function lerZip(bytes: Buffer, quer: (nome: string) => boolean): Map<string, Buffer> {
  // O fim do diretório central: a assinatura procurada do fim para o começo
  // (pode haver um comentário depois dela).
  let fim = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { fim = i; break }
  }
  if (fim < 0) throw new ErroDoDocumento('não é um arquivo do Office válido')
  const total = bytes.readUInt16LE(fim + 10)
  let p = bytes.readUInt32LE(fim + 16)
  const saida = new Map<string, Buffer>()
  for (let n = 0; n < total; n++) {
    if (p + 46 > bytes.length || bytes.readUInt32LE(p) !== 0x02014b50) throw new ErroDoDocumento('o arquivo está corrompido')
    const metodo = bytes.readUInt16LE(p + 10)
    const tamanho = bytes.readUInt32LE(p + 20)
    const lenNome = bytes.readUInt16LE(p + 28)
    const lenExtra = bytes.readUInt16LE(p + 30)
    const lenComentario = bytes.readUInt16LE(p + 32)
    const local = bytes.readUInt32LE(p + 42)
    const nome = bytes.subarray(p + 46, p + 46 + lenNome).toString('utf8')
    p += 46 + lenNome + lenExtra + lenComentario
    if (!quer(nome)) continue
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new ErroDoDocumento('o arquivo está corrompido')
    const inicio = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const dados = bytes.subarray(inicio, inicio + tamanho)
    if (metodo === 0) saida.set(nome, Buffer.from(dados))
    else if (metodo === 8) saida.set(nome, inflateRawSync(dados))
    else throw new ErroDoDocumento('o arquivo usa uma compressão que o Copilot não lê')
  }
  return saida
}

function textoDoXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

function cortar(texto: string): string {
  if (texto.length <= TETO) return texto
  return `${texto.slice(0, TETO)}\n(cortado: o arquivo tem ${texto.length.toLocaleString('pt-BR')} caracteres; peça para mandar só a parte que importa)`
}

/** O texto de um .docx: um parágrafo por linha. */
export function textoDoDocx(bytes: Buffer): string {
  const doc = lerZip(bytes, n => n === 'word/document.xml').get('word/document.xml')
  if (!doc) throw new ErroDoDocumento('não achei o texto deste arquivo do Word')
  const xml = doc.toString('utf8')
  const paragrafos = xml.split(/<\/w:p>/).map(p => {
    let linha = ''
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      linha += m[0] === '<w:tab/>' ? '\t' : m[0] === '<w:br/>' ? '\n' : textoDoXml(m[1] ?? '')
    }
    return linha
  })
  return cortar(paragrafos.map(l => l.trimEnd()).filter(l => l.trim()).join('\n'))
}

/** "A1" → 0; "AB7" → 27. */
function coluna(ref: string): number {
  const letras = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** O texto de um .xlsx: cada aba com o nome, uma linha por linha, as colunas separadas por ";". */
export function textoDaPlanilha(bytes: Buffer): string {
  const arquivos = lerZip(bytes, n => n === 'xl/workbook.xml' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
  const abas = [...arquivos.keys()].filter(n => n.startsWith('xl/worksheets/'))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
  if (!abas.length) throw new ErroDoDocumento('não achei nenhuma aba nesta planilha')
  const nomes = [...(arquivos.get('xl/workbook.xml')?.toString('utf8') ?? '').matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map(m => textoDoXml(m[1]!))
  const strings = [...(arquivos.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(t => textoDoXml(t[1]!)).join(''))

  const partes: string[] = []
  abas.forEach((arquivo, i) => {
    const xml = arquivos.get(arquivo)!.toString('utf8')
    const linhas: string[] = []
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const celulas: string[] = []
      for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? ''
        const corpo = c[2] ?? ''
        const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
        const tipo = attrs.match(/\bt="([^"]+)"/)?.[1]
        const v = corpo.match(/<v>([^<]*)<\/v>/)?.[1]
        let valor = ''
        if (tipo === 's' && v !== undefined) valor = strings[Number(v)] ?? ''
        else if (tipo === 'inlineStr') valor = [...corpo.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(t => textoDoXml(t[1]!)).join('')
        else if (v !== undefined) valor = textoDoXml(v)
        const pos = ref ? coluna(ref) : celulas.length
        while (celulas.length < pos) celulas.push('')
        celulas[pos] = valor.replace(/[;\n\r]+/g, ' ')
      }
      while (celulas.length && !celulas[celulas.length - 1]) celulas.pop()
      if (celulas.length) linhas.push(celulas.join(';'))
    }
    partes.push(`# ${nomes[i] ?? `Aba ${i + 1}`}\n${linhas.join('\n')}`)
  })
  return cortar(partes.join('\n\n'))
}
