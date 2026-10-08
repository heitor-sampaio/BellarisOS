import 'server-only'

/**
 * A conversa com a OpenAI (a Responses API), por `fetch` — sem o SDK.
 *
 * Decisão de 2026-10-08: o Copilot usa um pedaço pequeno da API (texto com
 * streaming, chamada de ferramenta, imagem e arquivo na entrada, transcrição),
 * e o `fetch` deixa a costura do E2E trivial: `OPENAI_BASE_URL_TESTE` aponta
 * para a OpenAI falsa (`e2e/apoio/openai-falsa.ts`). Um SDK a mais seria mais
 * uma versão a acompanhar para o mesmo POST.
 *
 * `store: false`: a OpenAI não guarda a conversa do lado dela. Como não há
 * histórico lá, o pedido leva a conversa inteira (`input`) toda vez — e, nos
 * modelos que raciocinam, o raciocínio cifrado (`reasoning.encrypted_content`)
 * volta junto dentro da mesma vez, para o modelo continuar de onde parou.
 */

const BASE_PADRAO = 'https://api.openai.com/v1'
const TEMPO_MAXIMO_MS = 90_000

export function copilotConfigurado(): boolean {
  return !!process.env.OPENAI_API_KEY
}

function base(): string {
  return (process.env.OPENAI_BASE_URL_TESTE || BASE_PADRAO).replace(/\/$/, '')
}

function chave(): string {
  const k = process.env.OPENAI_API_KEY
  if (!k) throw new ErroDoModelo('O Copilot não está configurado nesta instalação.')
  return k
}

export function modeloDoChat(): string {
  return process.env.OPENAI_MODEL || 'gpt-5-mini'
}

/**
 * O esforço de raciocínio (`OPENAI_RACIOCINIO`: minimal, low, medium, high, ou
 * "nenhum" para modelo que não raciocina). Sem a variável: `low` nos modelos
 * que raciocinam (gpt-5*, o*), nada nos outros — `gpt-5-chat` não aceita.
 */
function raciocinio(modelo: string): string | null {
  const v = (process.env.OPENAI_RACIOCINIO ?? '').trim().toLowerCase()
  if (v === 'nenhum') return null
  if (v) return v
  return /^(gpt-5(?!-chat)|o\d)/.test(modelo) ? 'low' : null
}

function modeloDeVoz(): string {
  return process.env.OPENAI_MODELO_DE_VOZ || 'gpt-4o-mini-transcribe'
}

/** Erro com mensagem que PODE ir à tela (sem detalhe técnico do provedor). */
export class ErroDoModelo extends Error {}

// -- Formatos da Responses API (só o que o Copilot usa) ----------------------

export type ConteudoDeEntrada =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }
  | { type: 'input_file'; filename: string; file_data: string }

export type ItemDaConversa =
  | { role: 'user' | 'developer'; content: string | ConteudoDeEntrada[] }
  | { role: 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string; id?: string; status?: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  | { type: 'reasoning'; [k: string]: unknown }
  | { type: 'message'; [k: string]: unknown }

export interface FerramentaParaOModelo {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
  strict: false
}

export interface ChamadaDeFerramenta { callId: string; nome: string; argumentos: string }

export interface RespostaDoModelo {
  texto: string
  chamadas: ChamadaDeFerramenta[]
  /** Os itens de saída, para voltar na próxima volta do laço. */
  itens: ItemDaConversa[]
  tokensEntrada: number
  tokensSaida: number
}

/**
 * Uma volta do modelo, com streaming: `aoTexto` recebe os pedaços conforme
 * chegam (a tela os mostra na hora). Devolve o texto inteiro, as chamadas de
 * ferramenta e os itens de saída.
 */
export async function perguntarAoModelo(entrada: {
  instrucoes: string
  itens: ItemDaConversa[]
  ferramentas: FerramentaParaOModelo[]
  aoTexto?: (pedaco: string) => void
  /**
   * O que a volta GASTOU, para a cota — chamado uma vez, também quando ela
   * falha ou cai no meio depois de aceita (a OpenAI cobra o que processou; sem
   * o `usage`, vai a estimativa de `estimarTokens`). Pedido recusado antes
   * (rede, 4xx/5xx) não é cobrado e não conta.
   */
  aoGastar?: (tokens: number) => void
  sinal?: AbortSignal
}): Promise<RespostaDoModelo> {
  const modelo = modeloDoChat()
  const esforco = raciocinio(modelo)
  // A pessoa fechou a tela (o sinal do pedido) ou o modelo demorou demais.
  const sinal = entrada.sinal
    ? AbortSignal.any([entrada.sinal, AbortSignal.timeout(TEMPO_MAXIMO_MS)])
    : AbortSignal.timeout(TEMPO_MAXIMO_MS)
  const pedido = {
    model: modelo,
    instructions: entrada.instrucoes,
    input: entrada.itens,
    tools: entrada.ferramentas,
    stream: true,
    store: false,
    ...(esforco ? { include: ['reasoning.encrypted_content'], reasoning: { effort: esforco } } : {}),
  }
  let res: Response
  try {
    res = await fetch(`${base()}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chave()}` },
      body: JSON.stringify(pedido),
      signal: sinal,
    })
  } catch (e) {
    console.error('[copilot] OpenAI fora do ar:', e instanceof Error ? e.message : e)
    throw new ErroDoModelo('Não consegui falar com o assistente agora. Tente de novo em instantes.')
  }

  if (!res.ok || !res.body) {
    const corpo = await res.text().catch(() => '')
    console.error(`[copilot] OpenAI ${res.status}:`, corpo.slice(0, 500))
    throw new ErroDoModelo(res.status === 429
      ? 'O assistente está sobrecarregado agora. Tente de novo em instantes.'
      : 'Não consegui falar com o assistente agora. Tente de novo em instantes.')
  }

  let texto = ''
  type Concluida = { output?: ItemDaConversa[]; usage?: { input_tokens?: number; output_tokens?: number } }
  let concluida = null as Concluida | null
  const feitos: ItemDaConversa[] = []
  let incompleta = false

  let gastou = false
  const gastar = (tokens: number) => { if (!gastou) { gastou = true; entrada.aoGastar?.(tokens) } }
  try {
    for await (const evento of eventosSSE(res.body)) {
      const tipo = evento.type as string | undefined
      if (tipo === 'response.output_text.delta' && typeof evento.delta === 'string') {
        texto += evento.delta
        entrada.aoTexto?.(evento.delta)
      } else if (tipo === 'response.output_item.done' && evento.item) {
        feitos.push(evento.item as ItemDaConversa)
      } else if (tipo === 'response.completed' || tipo === 'response.incomplete') {
        // Incompleta (teto de tokens, filtro): vale o que veio — e o uso conta.
        concluida = (evento.response ?? null) as Concluida | null
        if (tipo === 'response.incomplete') incompleta = true
      } else if (tipo === 'response.failed' || tipo === 'error') {
        console.error('[copilot] OpenAI falhou:', JSON.stringify(evento).slice(0, 500))
        const uso = (evento.response as Concluida | undefined)?.usage
        gastar(uso ? (uso.input_tokens ?? 0) + (uso.output_tokens ?? 0) : estimarTokens(pedido, texto))
        throw new ErroDoModelo('O assistente não conseguiu responder. Tente de novo.')
      }
    }
  } catch (e) {
    // Caiu no meio (a pessoa fechou a tela, a conexão, o tempo): conta a estimativa.
    gastar(estimarTokens(pedido, texto))
    throw e
  }
  // Terminou sem o "concluída" (e sem o uso): também a estimativa.
  gastar(concluida?.usage
    ? (concluida.usage.input_tokens ?? 0) + (concluida.usage.output_tokens ?? 0)
    : estimarTokens(pedido, texto))

  const itens = (concluida?.output?.length ? concluida.output : feitos)
  const chamadas: ChamadaDeFerramenta[] = itens
    .filter((i): i is Extract<ItemDaConversa, { type: 'function_call' }> => (i as { type?: string }).type === 'function_call')
    .map(i => ({ callId: i.call_id, nome: i.name, argumentos: i.arguments }))

  // Texto que veio só no item final (sem deltas): pega de lá.
  if (!texto) {
    for (const i of itens) {
      const m = i as { type?: string; content?: { type: string; text?: string }[] }
      if (m.type === 'message') texto += (m.content ?? []).filter(c => c.type === 'output_text').map(c => c.text ?? '').join('')
    }
  }

  if (incompleta && !chamadas.length) {
    const aviso = '\n\n(A resposta foi cortada. Peça a continuação, se precisar.)'
    texto += aviso
    entrada.aoTexto?.(aviso)
  }

  return {
    texto,
    chamadas,
    itens,
    tokensEntrada: concluida?.usage?.input_tokens ?? 0,
    tokensSaida: concluida?.usage?.output_tokens ?? 0,
  }
}

/**
 * Os tokens de uma volta sem o `usage` da OpenAI: ~4 caracteres por token, do
 * pedido e do que já saiu. O anexo em base64 conta como ~1.000 tokens (o
 * modelo cobra a imagem pelo tamanho em pixels, não pelos caracteres).
 */
export function estimarTokens(pedido: unknown, saida: string): number {
  const semAnexo = JSON.stringify(pedido).replace(/data:[^"]{200,}/g, () => 'x'.repeat(4000))
  return Math.ceil(semAnexo.length / 4) + Math.ceil(saida.length / 4)
}

/** Lê um corpo `text/event-stream` e devolve os `data:` já em JSON. */
async function* eventosSSE(corpo: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const leitor = corpo.getReader()
  const decodificador = new TextDecoder()
  let resto = ''
  for (;;) {
    const { value, done } = await leitor.read()
    if (done) break
    resto += decodificador.decode(value, { stream: true })
    let fim: number
    while ((fim = resto.indexOf('\n\n')) >= 0) {
      const bloco = resto.slice(0, fim)
      resto = resto.slice(fim + 2)
      const dados = bloco.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
      if (!dados || dados === '[DONE]') continue
      try { yield JSON.parse(dados) } catch { /* bloco quebrado: ignora */ }
    }
  }
}

/**
 * Transcreve um áudio gravado na tela. Devolve também o que GASTOU (para a
 * cota): o `usage` em tokens (gpt-4o-*-transcribe) ou em segundos (whisper,
 * ~10 tokens por segundo); sem nenhum, pelo tamanho do arquivo (opus ~2 kB/s).
 */
export async function transcrever(arquivo: File): Promise<{ texto: string; tokens: number }> {
  const form = new FormData()
  form.append('file', arquivo, arquivo.name || 'audio.webm')
  form.append('model', modeloDeVoz())
  form.append('language', 'pt')
  let res: Response
  try {
    res = await fetch(`${base()}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${chave()}` },
      body: form,
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    })
  } catch (e) {
    console.error('[copilot] transcrição fora do ar:', e instanceof Error ? e.message : e)
    throw new ErroDoModelo('Não consegui ouvir o áudio agora. Tente de novo ou escreva.')
  }
  if (!res.ok) {
    console.error(`[copilot] transcrição ${res.status}:`, (await res.text().catch(() => '')).slice(0, 300))
    throw new ErroDoModelo('Não consegui ouvir o áudio. Tente de novo ou escreva.')
  }
  const json = await res.json().catch(() => null) as { text?: string; usage?: { total_tokens?: number; seconds?: number } } | null
  const tokens = json?.usage?.total_tokens
    ?? (json?.usage?.seconds ? Math.ceil(json.usage.seconds * 10) : Math.ceil(arquivo.size / 200))
  return { texto: (json?.text ?? '').trim(), tokens }
}
