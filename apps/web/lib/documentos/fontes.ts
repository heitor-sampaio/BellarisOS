/**
 * As fontes dos documentos (termos e contratos).
 *
 * Cada fonte que o editor oferece vai para dentro do PDF assinado — por isso
 * só fonte de licença livre, com os arquivos no repositório
 * (`public/fontes-documento/`, baixados por `scripts/baixar-fontes.mjs`). As do
 * Office não podem ser embutidas: no lugar delas, as equivalentes livres com
 * as MESMAS larguras de letra (Arimo = Arial, Tinos = Times New Roman,
 * Carlito = Calibri, Cousine = Courier New, Gelasio = Georgia) — o texto
 * quebra nas mesmas palavras.
 *
 * A tela usa os mesmos arquivos (`@font-face` em `globals.css`), então o que
 * se vê é o que se assina. Puro: roda no navegador e no servidor.
 */

export const FONTES_DE_DOCUMENTO = {
  arimo:        { rotulo: 'Arimo (Arial)',            familia: 'Arimo',            generica: 'sans-serif' },
  tinos:        { rotulo: 'Tinos (Times New Roman)',  familia: 'Tinos',            generica: 'serif' },
  carlito:      { rotulo: 'Carlito (Calibri)',        familia: 'Carlito',          generica: 'sans-serif' },
  cousine:      { rotulo: 'Cousine (Courier New)',    familia: 'Cousine',          generica: 'monospace' },
  gelasio:      { rotulo: 'Gelasio (Georgia)',        familia: 'Gelasio',          generica: 'serif' },
  hanken:       { rotulo: 'Hanken Grotesk',           familia: 'Hanken Grotesk',   generica: 'sans-serif' },
  roboto:       { rotulo: 'Roboto',                   familia: 'Roboto',           generica: 'sans-serif' },
  'open-sans':  { rotulo: 'Open Sans',                familia: 'Open Sans',        generica: 'sans-serif' },
  montserrat:   { rotulo: 'Montserrat',               familia: 'Montserrat',       generica: 'sans-serif' },
  lato:         { rotulo: 'Lato',                     familia: 'Lato',             generica: 'sans-serif' },
  merriweather: { rotulo: 'Merriweather',             familia: 'Merriweather',     generica: 'serif' },
  playfair:     { rotulo: 'Playfair Display',         familia: 'Playfair Display', generica: 'serif' },
} as const

export type FonteDeDocumento = keyof typeof FONTES_DE_DOCUMENTO
export const IDS_DE_FONTE = Object.keys(FONTES_DE_DOCUMENTO) as FonteDeDocumento[]

/** A fonte e o tamanho de quem não escolheu nada. */
export const FONTE_BASE: FonteDeDocumento = 'arimo'
export const TAMANHO_BASE = 11

/** Os tamanhos que o editor oferece, em pontos. */
export const TAMANHOS_DE_FONTE = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36] as const

export type EstiloDeFonte = 'regular' | 'negrito' | 'italico' | 'negrito-italico'
export const ESTILOS_DE_FONTE: EstiloDeFonte[] = ['regular', 'negrito', 'italico', 'negrito-italico']

export function ehFonte(v: unknown): v is FonteDeDocumento {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FONTES_DE_DOCUMENTO, v)
}

export function estiloDe(negrito?: boolean, italico?: boolean): EstiloDeFonte {
  return negrito ? (italico ? 'negrito-italico' : 'negrito') : (italico ? 'italico' : 'regular')
}

/** O arquivo de uma fonte num estilo, relativo a `public/`. */
export function arquivoDaFonte(fonte: FonteDeDocumento, estilo: EstiloDeFonte): string {
  return `fontes-documento/${fonte}-${estilo}.ttf`
}

/**
 * O nome CSS da família é o próprio id, prefixado (`doc-arimo`): não colide com
 * uma fonte instalada na máquina de quem lê (uma "Arimo" local de outra versão
 * desenharia outra coisa), e é o valor que o editor grava — então volta para o
 * id sem tabela. Os `@font-face` de `globals.css` declaram estes nomes.
 */
export function nomeCss(fonte: FonteDeDocumento): string {
  return `doc-${fonte}`
}

export function familiaCss(fonte: FonteDeDocumento): string {
  return `'${nomeCss(fonte)}', ${FONTES_DE_DOCUMENTO[fonte].generica}`
}

/**
 * A fonte de um `font-family` qualquer — o do editor (`doc-arimo`) ou o que um
 * texto colado do Word traz (`Calibri, sans-serif`): as do Office viram a
 * equivalente livre. Desconhecida: nulo, e fica a fonte base.
 */
const DO_OFFICE: Record<string, FonteDeDocumento> = {
  'arial': 'arimo', 'helvetica': 'arimo', 'liberation sans': 'arimo',
  'times new roman': 'tinos', 'times': 'tinos', 'liberation serif': 'tinos',
  'calibri': 'carlito', 'courier new': 'cousine', 'courier': 'cousine', 'georgia': 'gelasio',
}
export function fonteDoCss(valor: unknown): FonteDeDocumento | null {
  if (typeof valor !== 'string') return null
  for (const bruto of valor.split(',')) {
    const nome = bruto.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
    if (nome.startsWith('doc-') && ehFonte(nome.slice(4))) return nome.slice(4) as FonteDeDocumento
    const direto = IDS_DE_FONTE.find(id => FONTES_DE_DOCUMENTO[id].familia.toLowerCase() === nome)
    if (direto) return direto
    if (DO_OFFICE[nome]) return DO_OFFICE[nome]!
  }
  return null
}

/** O tamanho da lista mais perto do pedido (colar do Word traz 11,5 e 13). */
export function tamanhoMaisProximo(pt: number): number {
  let melhor: number = TAMANHO_BASE
  for (const t of TAMANHOS_DE_FONTE) if (Math.abs(t - pt) < Math.abs(melhor - pt)) melhor = t
  return melhor
}
