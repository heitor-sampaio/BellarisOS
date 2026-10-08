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
  sinal?: AbortSignal
}): Promise<RespostaDoModelo> {
  const modelo = modeloDoChat()
  const raciocina = /^(gpt-5|o\d)/.test(modelo)
  let res: Response
  try {
    res = await fetch(`${base()}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chave()}` },
      body: JSON.stringify({
        model: modelo,
        instructions: entrada.instrucoes,
        input: entrada.itens,
        tools: entrada.ferramentas,
        stream: true,
        store: false,
        ...(raciocina ? { include: ['reasoning.encrypted_content'], reasoning: { effort: 'low' } } : {}),
      }),
      signal: entrada.sinal ?? AbortSignal.timeout(TEMPO_MAXIMO_MS),
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

  for await (const evento of eventosSSE(res.body)) {
    const tipo = evento.type as string | undefined
    if (tipo === 'response.output_text.delta' && typeof evento.delta === 'string') {
      texto += evento.delta
      entrada.aoTexto?.(evento.delta)
    } else if (tipo === 'response.output_item.done' && evento.item) {
      feitos.push(evento.item as ItemDaConversa)
    } else if (tipo === 'response.completed') {
      concluida = (evento.response ?? null) as Concluida | null
    } else if (tipo === 'response.failed' || tipo === 'error') {
      console.error('[copilot] OpenAI falhou:', JSON.stringify(evento).slice(0, 500))
      throw new ErroDoModelo('O assistente não conseguiu responder. Tente de novo.')
    }
  }

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

  return {
    texto,
    chamadas,
    itens,
    tokensEntrada: concluida?.usage?.input_tokens ?? 0,
    tokensSaida: concluida?.usage?.output_tokens ?? 0,
  }
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

/** Transcreve um áudio gravado na tela. */
export async function transcrever(arquivo: File): Promise<string> {
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
  const json = await res.json().catch(() => null) as { text?: string } | null
  return (json?.text ?? '').trim()
}
