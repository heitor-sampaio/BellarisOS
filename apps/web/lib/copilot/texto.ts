import { caminhoInterno } from '@/lib/origem'

/**
 * O texto do Copilot em BLOCOS, para a tela desenhar com elementos React —
 * nunca `dangerouslySetInnerHTML`. O modelo escreve um Markdown mínimo
 * (parágrafo, lista, **negrito**, [link](/caminho)); o resto fica texto.
 *
 * Link só INTERNO (`caminhoInterno`, a mesma conferência do `next` dos links
 * de e-mail): o que o modelo escreve pode ter vindo de um nome de cliente ou
 * de um documento — link para fora, `javascript:` e `//host` viram texto.
 */

export type Trecho =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'negrito'; texto: string }
  | { tipo: 'link'; texto: string; href: string }

export type Bloco =
  | { tipo: 'paragrafo'; trechos: Trecho[] }
  | { tipo: 'lista'; numerada: boolean; itens: Trecho[][] }

const ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/

/** Rotas que não são TELA: um link do modelo para elas faria um GET que age. */
const NAO_E_TELA = /^\/(api|auth|login|logout|assinar|verificar|conta-suspensa|_next)(\/|$|\?)/

export function linkSeguro(href: string): string | null {
  if (!href.startsWith('/')) return null
  const seguro = caminhoInterno(href, '')
  if (!seguro || seguro !== href || NAO_E_TELA.test(seguro)) return null
  return seguro
}

/**
 * O caminho de tela SOLTO no texto, com um id (inteiro ou cortado com "…"):
 * "(/lavanda-ponta-verde/agenda/<uuid>)", "/admin/agenda/b481…" (A27 da 21ª).
 * Não diz nada a quem lê — o link vai com o nome, ou no cartão —, e sai.
 */
const ID_NO_CAMINHO = String.raw`\/[\w-]+(?:\/[\w-]+)*\/[0-9a-f]{8}(?:-[0-9a-f]{1,12}){0,4}(?:…|\.\.\.)?`
/**
 * E o caminho solto SEM id (A32 da 22ª: "Abra o PDV para dar baixa:
 * /alecrim-renascenca/pdv"): dois trechos ou mais, começando por letra, com a
 * consulta (`?unidade=…`) junto. "19/11", "1/5" e "e/ou" não são caminho: o
 * trecho começa por letra, e antes da barra não vem letra nem número.
 */
const SEM_ID = String.raw`\/[a-z][\w-]*(?:\/[\w-]+)+(?:\?[^\s).,;!?]+(?:[.,;!?][^\s).,;!?]+)*)?`
const CAMINHO = `(?:${ID_NO_CAMINHO}|${SEM_ID})`
const CAMINHO_CRU = new RegExp(String.raw`\s*\(\s*${CAMINHO}\s*\)|\s?(?<![\w\]])${CAMINHO}`, 'gi')
/** Os dois-pontos que só apresentavam o caminho, no fim da frase: "dar baixa: /x/pdv." vira "dar baixa." */
const DOIS_PONTOS_DO_CAMINHO = new RegExp(String.raw`\s*:\s*(?<![\w\]])${CAMINHO}(?=\s*(?:[.!?;]|$))`, 'gi')
export function semCaminhoCru(t: string): string {
  return t.replace(DOIS_PONTOS_DO_CAMINHO, '').replace(CAMINHO_CRU, '')
}

export function trechosDaLinha(linha: string): Trecho[] {
  const trechos: Trecho[] = []
  // O link sem fechamento no fim (a resposta cortada, D3 da 19ª; ou ainda
  // chegando pelo streaming) fica só o texto, sem o pedaço "](/…".
  const padrao = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\[([^\]]+)\]\([^)\s]*$/g
  let ultimo = 0
  let m: RegExpExecArray | null
  const texto = (bruto: string) => { const t = semCaminhoCru(bruto); if (t) trechos.push({ tipo: 'texto', texto: t }) }
  while ((m = padrao.exec(linha))) {
    texto(linha.slice(ultimo, m.index))
    if (m[1] !== undefined) trechos.push({ tipo: 'negrito', texto: m[1] })
    else if (m[4] !== undefined) texto(m[4])
    else {
      const href = linkSeguro(m[3]!)
      if (href) trechos.push({ tipo: 'link', texto: m[2]!, href })
      else texto(m[2]!)
    }
    ultimo = m.index + m[0].length
  }
  texto(linha.slice(ultimo))
  // Junta textos vizinhos (o link recusado vira texto ao lado de texto).
  return trechos.reduce<Trecho[]>((acc, t) => {
    const anterior = acc[acc.length - 1]
    if (t.tipo === 'texto' && anterior?.tipo === 'texto') anterior.texto += t.texto
    else acc.push({ ...t })
    return acc
  }, [])
}

export function blocosDoTexto(entrada: string): Bloco[] {
  const blocos: Bloco[] = []
  let paragrafo: string[] = []
  let lista: { numerada: boolean; itens: Trecho[][] } | null = null

  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: 'paragrafo', trechos: trechosDaLinha(paragrafo.join('\n')) })
    paragrafo = []
  }
  const fecharLista = () => {
    if (lista) blocos.push({ tipo: 'lista', ...lista })
    lista = null
  }

  for (const bruta of entrada.replace(/\r\n/g, '\n').split('\n')) {
    const linha = bruta.replace(/^#{1,6}\s+/, '')
    if (!linha.trim()) { fecharParagrafo(); fecharLista(); continue }
    const item = linha.match(ITEM)
    if (item) {
      fecharParagrafo()
      const numerada = item[1] !== undefined
      if (!lista || lista.numerada !== numerada) { fecharLista(); lista = { numerada, itens: [] } }
      lista.itens.push(trechosDaLinha(item[2]!))
      continue
    }
    fecharLista()
    paragrafo.push(linha)
  }
  fecharParagrafo()
  fecharLista()
  return blocos
}
