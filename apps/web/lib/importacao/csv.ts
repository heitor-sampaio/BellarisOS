/**
 * Ler um CSV como o Excel brasileiro o salva (2026-10-13, importador de
 * contatos). Puro: roda no navegador (a prévia) e no teste.
 *
 * - **A acentuação**: o Excel em português salva em Windows-1252, não em
 *   UTF-8. Decodificar como UTF-8 viraria "Concei��o". Tenta-se UTF-8
 *   estrito; falhou, é 1252.
 * - **O separador**: o Excel brasileiro usa `;` (a vírgula é o decimal);
 *   outros programas, `,` ou tabulação. Decide-se pela primeira linha.
 * - **Aspas** (RFC 4180): campo entre aspas pode ter o separador, quebra de
 *   linha e aspas dobradas (`""`).
 */

export function decodificar(bytes: Uint8Array): string {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes)
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
}

/** O separador que mais aparece FORA de aspas na primeira linha. */
function separadorDe(texto: string): string {
  const candidatos = [';', ',', '\t']
  const contagem = new Map(candidatos.map(c => [c, 0]))
  let aspas = false
  for (const ch of texto) {
    if (ch === '"') aspas = !aspas
    else if (!aspas && (ch === '\n' || ch === '\r')) break
    else if (!aspas && contagem.has(ch)) contagem.set(ch, contagem.get(ch)! + 1)
  }
  let melhor = ';'
  for (const c of candidatos) if (contagem.get(c)! > contagem.get(melhor)!) melhor = c
  return melhor
}

export interface CsvLido {
  cabecalho: string[]
  linhas:    string[][]
  /** A linha da planilha em que cada registro começa (o relatório cita esta). */
  numeros:   number[]
  separador: string
}

export function lerCsv(texto: string): CsvLido {
  const sep = separadorDe(texto)
  const registros: { valores: string[]; linha: number }[] = []
  let campo = ''
  let registro: string[] = []
  let aspas = false
  // A linha física: célula com quebra de linha e linha em branco contam, para
  // o "Linha N" do relatório bater com o que a pessoa vê na planilha.
  let linhaFisica = 1
  let inicio = 1

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ }
        else aspas = false
      } else {
        if (ch === '\n') linhaFisica++
        campo += ch
      }
      continue
    }
    if (ch === '"' && campo === '') { aspas = true; continue }
    if (ch === sep) { registro.push(campo); campo = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') {
      registro.push(campo); registros.push({ valores: registro, linha: inicio })
      registro = []; campo = ''; linhaFisica++; inicio = linhaFisica
      continue
    }
    campo += ch
  }
  if (campo !== '' || registro.length) { registro.push(campo); registros.push({ valores: registro, linha: inicio }) }

  // Linha toda vazia (o "\n" do fim, a linha em branco do meio) não é registro.
  const cheios = registros.filter(r => r.valores.some(c => c.trim() !== ''))
  const [cabecalho, ...dados] = cheios
  return {
    cabecalho: (cabecalho?.valores ?? []).map(c => c.trim()),
    linhas:    dados.map(r => r.valores),
    numeros:   dados.map(r => r.linha),
    separador: sep,
  }
}
