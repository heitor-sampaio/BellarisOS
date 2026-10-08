import 'server-only'
import { transcrever as transcreverNoModelo, type ConteudoDeEntrada } from '@/lib/copilot/openai'
import { ANEXOS_MAXIMOS } from '@/lib/copilot/tipos'

/**
 * O que a pessoa manda ao Copilot além do texto: voz, imagem e documento.
 *
 * Decisão de 2026-10-08: o arquivo é lido NO PEDIDO e descartado — não vai ao
 * storage. A conversa guarda só o nome e o tipo. A foto de uma ficha de papel
 * tem dado pessoal (e às vezes clínico): guardar sem precisar seria juntar
 * dado parado; e a tela não precisa reabrir o arquivo depois.
 *
 * - voz: transcrita (a tela mostra o que foi entendido) e vira texto;
 * - imagem (jpeg, png, webp): vai como imagem ao modelo;
 * - PDF: vai como arquivo ao modelo;
 * - txt e csv: vão como texto.
 * docx e xlsx ficam de fora por ora ("mande em PDF"): ler os dois pediria duas
 * bibliotecas a mais só para isto.
 *
 * O tipo é conferido pelo CONTEÚDO (os primeiros bytes), não pela extensão.
 */

export class ErroDeAnexo extends Error {}

export type TipoDeAnexo = 'imagem' | 'audio' | 'documento'

export interface AnexoLido {
  nome: string
  tipo: TipoDeAnexo
  mime: string
  bytes: Buffer
  /** Não guardado (ver o cabeçalho); fica no tipo para quem um dia guardar. */
  caminho: string | null
}

const MB = 1024 * 1024
const LIMITE: Record<TipoDeAnexo, number> = { imagem: 5 * MB, audio: 16 * MB, documento: 20 * MB }
const TEXTO_MAXIMO_DO_DOCUMENTO = 20_000

function comeca(b: Buffer, ...bytes: number[]): boolean {
  return bytes.every((x, i) => b[i] === x)
}

function mimeDaImagem(b: Buffer): string | null {
  if (comeca(b, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (comeca(b, 0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

function ehAudio(b: Buffer, declarado: string): boolean {
  if (comeca(b, 0x1a, 0x45, 0xdf, 0xa3)) return true                  // webm / matroska
  if (b.subarray(0, 4).toString('latin1') === 'OggS') return true      // ogg
  // mp4/m4a: o mesmo contêiner do vídeo e do HEIC — só vale se veio como áudio.
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return declarado.startsWith('audio/')
  if (b.subarray(0, 3).toString('latin1') === 'ID3' || comeca(b, 0xff, 0xfb) || comeca(b, 0xff, 0xf3)) return true // mp3
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE') return true
  return false
}

function pareceTexto(b: Buffer): boolean {
  const amostra = b.subarray(0, 4096)
  return !amostra.includes(0)
}

export async function lerAnexos(arquivos: File[]): Promise<AnexoLido[]> {
  if (arquivos.length > ANEXOS_MAXIMOS) throw new ErroDeAnexo(`Mande no máximo ${ANEXOS_MAXIMOS} anexos por vez.`)
  const lidos: AnexoLido[] = []
  for (const f of arquivos) {
    const nome = (f.name || 'anexo').slice(0, 120)
    if (f.size === 0) throw new ErroDeAnexo(`"${nome}" está vazio.`)
    if (f.size > LIMITE.documento) throw new ErroDeAnexo(`"${nome}" passa de 20 MB.`)
    const bytes = Buffer.from(await f.arrayBuffer())
    const declarado = (f.type || '').toLowerCase()
    const extensao = nome.toLowerCase().split('.').pop() ?? ''

    const mimeImagem = mimeDaImagem(bytes)
    let lido: AnexoLido | null = null
    if (mimeImagem) {
      lido = { nome, tipo: 'imagem', mime: mimeImagem, bytes, caminho: null }
    } else if (ehAudio(bytes, declarado)) {
      lido = { nome, tipo: 'audio', mime: declarado.startsWith('audio/') ? declarado.split(';')[0]! : 'audio/webm', bytes, caminho: null }
    } else if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
      lido = { nome, tipo: 'documento', mime: 'application/pdf', bytes, caminho: null }
    } else if ((extensao === 'txt' || extensao === 'csv') && pareceTexto(bytes)) {
      lido = { nome, tipo: 'documento', mime: extensao === 'csv' ? 'text/csv' : 'text/plain', bytes, caminho: null }
    } else if (extensao === 'docx' || extensao === 'xlsx' || extensao === 'doc' || extensao === 'xls') {
      throw new ErroDeAnexo(`"${nome}": por enquanto o Copilot lê PDF, imagem, txt e csv. Salve em PDF e mande de novo.`)
    } else {
      throw new ErroDeAnexo(`"${nome}": tipo de arquivo que o Copilot não lê (use imagem, PDF, txt, csv ou áudio).`)
    }

    if (bytes.length > LIMITE[lido.tipo]) {
      throw new ErroDeAnexo(`"${nome}" passa de ${LIMITE[lido.tipo] / MB} MB.`)
    }
    lidos.push(lido)
  }
  if (lidos.filter(a => a.tipo === 'audio').length > 1) throw new ErroDeAnexo('Mande um áudio por vez.')
  return lidos
}

/** Imagem e documento no formato da Responses API. */
export function paraOModelo(lidos: AnexoLido[]): ConteudoDeEntrada[] {
  return lidos.flatMap<ConteudoDeEntrada>(a => {
    if (a.tipo === 'imagem') return [{ type: 'input_image', image_url: `data:${a.mime};base64,${a.bytes.toString('base64')}`, detail: 'auto' }]
    if (a.mime === 'application/pdf') return [{ type: 'input_file', filename: a.nome, file_data: `data:application/pdf;base64,${a.bytes.toString('base64')}` }]
    if (a.tipo === 'documento') {
      const texto = a.bytes.toString('utf8').slice(0, TEXTO_MAXIMO_DO_DOCUMENTO)
      return [{ type: 'input_text', text: `Conteúdo do arquivo "${a.nome}":\n${texto}` }]
    }
    return []
  })
}

export async function transcrever(a: AnexoLido): Promise<string> {
  const texto = await transcreverNoModelo(new File([new Uint8Array(a.bytes)], a.nome || 'audio.webm', { type: a.mime }))
  if (!texto) throw new ErroDeAnexo('Não entendi o áudio. Tente de novo, mais perto do microfone, ou escreva.')
  return texto
}
