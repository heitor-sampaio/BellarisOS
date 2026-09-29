/**
 * A marcação dos documentos do editor — termos e contratos.
 *
 * É pequena de propósito: título, subtítulo, parágrafo, negrito, lista,
 * divisória, o lugar da assinatura e as variáveis. O mesmo texto vira HTML na
 * tela e PDF no servidor, e os dois têm de desenhar EXATAMENTE a mesma coisa —
 * é sobre essa forma que se calcula o hash que a assinatura prova. Um editor
 * rico (tiptap e afins) traria dezenas de tipos de nó para o PDF suportar; este
 * analisador produz uma árvore só, e os dois lados a desenham.
 *
 * Puro, sem `server-only`: roda no navegador (prévia do editor, tela de
 * assinatura) e no servidor (render, PDF).
 *
 *   # Título            ## Subtítulo
 *   parágrafo — linhas seguidas são o mesmo parágrafo, com a quebra mantida
 *   (linha em branco separa parágrafos)
 *   **negrito**
 *   - item               1. item numerado
 *   ---                  divisória
 *   [[assinatura]]       onde vai a imagem da assinatura (sem ela: no fim)
 *   {{cliente.nome}}     variável (ver `variaveis.ts`)
 */

/** Pedaço de texto dentro de uma linha: texto literal ou variável. */
export type Trecho =
  | { texto: string;    negrito?: true }
  | { variavel: string; negrito?: true }

/** Depois de interpolado, só sobra texto. */
export interface TrechoResolvido { texto: string; negrito?: true }

type Bloco<T> =
  | { tipo: 'titulo';     nivel: 1 | 2; trechos: T[] }
  | { tipo: 'paragrafo';  linhas: T[][] }
  | { tipo: 'lista';      ordenada: boolean; itens: T[][] }
  | { tipo: 'divisoria' }
  | { tipo: 'assinatura' }

export type BlocoDeModelo    = Bloco<Trecho>
export type BlocoResolvido   = Bloco<TrechoResolvido>
export type ArvoreDoModelo   = BlocoDeModelo[]
export type ArvoreResolvida  = BlocoResolvido[]

/** O nome de uma variável: `grupo.campo`, só minúsculas e sublinhado. */
const RE_VARIAVEL = /\{\{\s*([a-z_]+(?:\.[a-z_]+)+)\s*\}\}/g
/** Qualquer coisa entre chaves duplas — para achar a variável MAL escrita. */
const RE_CHAVES   = /\{\{([^}]*)\}\}/g

export const MARCA_DE_ASSINATURA = '[[assinatura]]'

/** Tamanho máximo do texto de um modelo — contrato longo cabe com folga. */
export const MAX_CARACTERES_DO_MODELO = 60_000

// ─── Linha → trechos ─────────────────────────────────────────────────────────

/** Separa o negrito (`**…**`) e as variáveis de uma linha. */
function trechosDaLinha(linha: string): Trecho[] {
  const saida: Trecho[] = []
  // `**` alterna o negrito. Um `**` sem par fica como texto literal: o
  // último pedaço, se ímpar, volta a ser normal com as estrelas de volta.
  const partes = linha.split('**')
  const semPar = partes.length % 2 === 0
  partes.forEach((parte, i) => {
    const ultimoSemPar = semPar && i === partes.length - 1
    const negrito = i % 2 === 1 && !ultimoSemPar
    const texto = ultimoSemPar ? `**${parte}` : parte
    if (!texto) return
    let desde = 0
    for (const m of texto.matchAll(RE_VARIAVEL)) {
      const antes = texto.slice(desde, m.index)
      if (antes) saida.push(negrito ? { texto: antes, negrito: true } : { texto: antes })
      saida.push(negrito ? { variavel: m[1]!, negrito: true } : { variavel: m[1]! })
      desde = m.index! + m[0].length
    }
    const resto = texto.slice(desde)
    if (resto) saida.push(negrito ? { texto: resto, negrito: true } : { texto: resto })
  })
  return saida
}

// ─── Texto → árvore ──────────────────────────────────────────────────────────

const RE_ITEM          = /^[-*]\s+(.*)$/
const RE_ITEM_NUMERADO = /^\d+[.)]\s+(.*)$/

export function analisarMarcacao(fonte: string): ArvoreDoModelo {
  const linhas = fonte.replace(/\r\n?/g, '\n').split('\n')
  const arvore: ArvoreDoModelo = []
  let paragrafo: Trecho[][] | null = null
  let lista: { ordenada: boolean; itens: Trecho[][] } | null = null

  const fecharParagrafo = () => {
    if (paragrafo) arvore.push({ tipo: 'paragrafo', linhas: paragrafo })
    paragrafo = null
  }
  const fecharLista = () => {
    if (lista) arvore.push({ tipo: 'lista', ordenada: lista.ordenada, itens: lista.itens })
    lista = null
  }
  const fecharTudo = () => { fecharParagrafo(); fecharLista() }

  for (const bruta of linhas) {
    const linha = bruta.trim()
    if (!linha) { fecharTudo(); continue }

    if (linha === MARCA_DE_ASSINATURA) { fecharTudo(); arvore.push({ tipo: 'assinatura' }); continue }
    if (/^-{3,}$/.test(linha))          { fecharTudo(); arvore.push({ tipo: 'divisoria' }); continue }

    const titulo = /^(#{1,2})\s+(.*)$/.exec(linha)
    if (titulo) {
      fecharTudo()
      arvore.push({ tipo: 'titulo', nivel: titulo[1]!.length as 1 | 2, trechos: trechosDaLinha(titulo[2]!) })
      continue
    }

    const item = RE_ITEM.exec(linha)
    const numerado = item ? null : RE_ITEM_NUMERADO.exec(linha)
    if (item || numerado) {
      const ordenada = !!numerado
      fecharParagrafo()
      if (lista && lista.ordenada !== ordenada) fecharLista()
      lista ??= { ordenada, itens: [] }
      lista.itens.push(trechosDaLinha((item ?? numerado)![1]!))
      continue
    }

    fecharLista()
    ;(paragrafo ??= []).push(trechosDaLinha(linha))
  }
  fecharTudo()
  return arvore
}

// ─── Variáveis ───────────────────────────────────────────────────────────────

function trechosDoBloco(b: BlocoDeModelo): Trecho[] {
  switch (b.tipo) {
    case 'titulo':    return b.trechos
    case 'paragrafo': return b.linhas.flat()
    case 'lista':     return b.itens.flat()
    default:          return []
  }
}

/** As variáveis citadas, na ordem em que aparecem, sem repetir. */
export function variaveisDaArvore(arvore: ArvoreDoModelo): string[] {
  const vistas = new Set<string>()
  for (const b of arvore) {
    for (const t of trechosDoBloco(b)) if ('variavel' in t) vistas.add(t.variavel)
  }
  return [...vistas]
}

/**
 * Chaves duplas que NÃO formam uma variável válida (`{{ Nome }}`, `{{nome}}`
 * sem grupo, `{{}}`). Sem esta conferência elas iriam para o documento como
 * texto, e o cliente assinaria um contrato com chaves no lugar do nome.
 */
export function chavesMalFormadas(fonte: string): string[] {
  const ruins: string[] = []
  for (const m of fonte.matchAll(RE_CHAVES)) {
    if (!/^\s*[a-z_]+(?:\.[a-z_]+)+\s*$/.test(m[1]!)) ruins.push(m[0])
  }
  return [...new Set(ruins)]
}

// ─── Interpolação ────────────────────────────────────────────────────────────

/**
 * Troca cada variável pelo seu valor, SOBRE A ÁRVORE.
 *
 * O valor vira texto puro: um cliente chamado `# Ana` ou com `**` no nome não
 * injeta marcação, porque a análise já aconteceu antes. `resolver` devolve
 * null quando o dado falta; a variável obrigatória que faltar vai para
 * `faltando` (e o documento não pode ser assinado), a opcional sai vazia.
 */
export function interpolarArvore(
  arvore: ArvoreDoModelo,
  resolver: (variavel: string) => string | null,
  ehOpcional: (variavel: string) => boolean,
): { arvore: ArvoreResolvida; faltando: string[] } {
  const faltando = new Set<string>()

  const resolverTrechos = (ts: Trecho[]): TrechoResolvido[] => {
    const saida: TrechoResolvido[] = []
    for (const t of ts) {
      let texto: string
      if ('variavel' in t) {
        const valor = resolver(t.variavel)
        if (valor == null || valor === '') {
          if (!ehOpcional(t.variavel)) faltando.add(t.variavel)
          texto = ''
        } else {
          texto = valor
        }
      } else {
        texto = t.texto
      }
      if (!texto) continue
      // Junta pedaços vizinhos com o mesmo estilo: a forma canônica não pode
      // depender de como o texto foi fatiado.
      const anterior = saida[saida.length - 1]
      if (anterior && !!anterior.negrito === !!t.negrito) anterior.texto += texto
      else saida.push(t.negrito ? { texto, negrito: true } : { texto })
    }
    return saida
  }

  const resolvida: ArvoreResolvida = arvore.map((b): BlocoResolvido => {
    switch (b.tipo) {
      case 'titulo':    return { tipo: 'titulo', nivel: b.nivel, trechos: resolverTrechos(b.trechos) }
      case 'paragrafo': return { tipo: 'paragrafo', linhas: b.linhas.map(resolverTrechos) }
      case 'lista':     return { tipo: 'lista', ordenada: b.ordenada, itens: b.itens.map(resolverTrechos) }
      default:          return b
    }
  })
  return { arvore: resolvida, faltando: [...faltando] }
}

// ─── Forma canônica e texto ──────────────────────────────────────────────────

/**
 * A forma canônica: é SOBRE ESTES BYTES que o hash do documento é calculado,
 * no servidor ao gravar e no navegador ao exibir. Os objetos da árvore são
 * sempre montados na mesma ordem de chaves (ver acima), então o JSON é estável.
 * Quem exibe tem de calcular o hash dos bytes que RECEBEU — nunca reserializar.
 */
export function formaCanonica(arvore: ArvoreResolvida): string {
  return JSON.stringify(arvore)
}

/** Texto corrido do documento — busca, export LGPD e a leitura sem tela. */
export function textoDaArvore(arvore: ArvoreResolvida): string {
  const junta = (ts: TrechoResolvido[]) => ts.map(t => t.texto).join('')
  const partes: string[] = []
  for (const b of arvore) {
    switch (b.tipo) {
      case 'titulo':     partes.push(junta(b.trechos)); break
      case 'paragrafo':  partes.push(b.linhas.map(junta).join('\n')); break
      case 'lista':      partes.push(b.itens.map((it, i) => `${b.ordenada ? `${i + 1}.` : '•'} ${junta(it)}`).join('\n')); break
      case 'divisoria':  partes.push('—'); break
      case 'assinatura': partes.push('[assinatura]'); break
    }
  }
  return partes.join('\n\n')
}
