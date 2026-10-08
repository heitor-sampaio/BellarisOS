import { deflateRawSync } from 'node:zlib'

/**
 * Um .zip de verdade (deflate), para os testes montarem docx e xlsx sem
 * arquivo pronto no repositório. Só o necessário: entradas locais e o
 * diretório central.
 */
function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

export function zipar(arquivos: Record<string, string>): Buffer {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let deslocamento = 0
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = Buffer.from(conteudo, 'utf8')
    const comprimido = deflateRawSync(dados)
    const nomeBuf = Buffer.from(nome, 'utf8')
    const crc = crc32(dados)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(nomeBuf.length, 26); local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8)
    central.writeUInt16LE(8, 10); central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(dados.length, 24); central.writeUInt16LE(nomeBuf.length, 28); central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38)
    central.writeUInt32LE(deslocamento, 42)
    locais.push(local, nomeBuf, comprimido)
    centrais.push(central, nomeBuf)
    deslocamento += local.length + nomeBuf.length + comprimido.length
  }
  const dirCentral = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(0, 4); fim.writeUInt16LE(0, 6)
  fim.writeUInt16LE(Object.keys(arquivos).length, 8); fim.writeUInt16LE(Object.keys(arquivos).length, 10)
  fim.writeUInt32LE(dirCentral.length, 12); fim.writeUInt32LE(deslocamento, 16); fim.writeUInt16LE(0, 20)
  return Buffer.concat([...locais, dirCentral, fim])
}

/** Um .docx mínimo com estes parágrafos. */
export function docx(paragrafos: string[]): Buffer {
  const corpo = paragrafos.map(p => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('')
  return zipar({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`,
  })
}

/** Um .xlsx mínimo: a primeira aba com estas linhas (texto pela tabela de strings; número direto). */
export function xlsx(linhas: (string | number)[][]): Buffer {
  const strings: string[] = []
  const indice = (s: string) => { const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1 }
  const col = (i: number) => String.fromCharCode(65 + i)
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => typeof v === 'number'
    ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`
    : `<c r="${col(c)}${r + 1}" t="s"><v>${indice(v)}</v></c>`).join('')}</row>`).join('')
  return zipar({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Clientes" sheetId="1"/></sheets></workbook>',
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
  })
}
