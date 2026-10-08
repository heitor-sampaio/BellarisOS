import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Uma OpenAI de mentira, em `127.0.0.1`, para o Copilot rodar de ponta a ponta
 * sem gastar um centavo nem depender do humor de um modelo.
 *
 * O build sobe com `OPENAI_BASE_URL_TESTE` apontando para cá (porta fixa
 * `PORTA_DA_OPENAI_FALSA`, playwright.build.config.ts e o workflow) — À FORÇA,
 * como a uazapi: a chave real, quando existir no `.env.local`, não pode ser
 * usada por teste.
 *
 * O teste ROTEIRIZA o "modelo": cada `POST /v1/responses` consome um passo de
 * `roteiro` — chamar ferramentas (`chamar`) ou responder um texto (`texto`).
 * Sem passo, responde "Certo." (o teste que não roteiriza não trava). Tudo o
 * que chegou fica em `pedidos`: as ferramentas OFERECIDAS (é o que prova que
 * o cargo sem o módulo nem recebe a ferramenta) e as saídas das ferramentas
 * que o servidor devolveu ao modelo (é o que prova o que a ferramenta leu).
 *
 * Fala o subconjunto da Responses API que o Copilot usa, com streaming:
 * (como um modelo que RACIOCINA: as chamadas vêm depois de um item
 * `reasoning` cifrado — e, como a API de verdade com `store: false`, um
 * `function_call` com `id` na entrada sem um `reasoning` antes é recusado com 400.)
 * `response.output_text.delta`, `response.output_item.done` e
 * `response.completed` (com `usage`). E `/v1/audio/transcriptions`, que
 * devolve `transcricao`.
 *
 * Porta fixa = um spec do Copilot por vez: eles ficam nos COMPARTILHADOS.
 */

export const PORTA_DA_OPENAI_FALSA = 3196

export interface ChamadaRoteirizada { nome: string; args: Record<string, unknown> }
export interface PassoDoRoteiro {
  texto?: string
  chamar?: ChamadaRoteirizada[]
  /** Tokens que o passo "gasta" (para a cota). Padrão: 100 de entrada + 20 de saída. */
  tokens?: { entrada: number; saida: number }
  /** Responde erro HTTP (o provedor fora do ar). */
  status?: number
}

interface ItemDeEntrada {
  role?: string
  type?: string
  content?: unknown
  call_id?: string
  name?: string
  output?: string
  arguments?: string
}

export interface PedidoRecebido {
  caminho: string
  autorizacao: string | null
  corpo: {
    model?: string
    instructions?: string
    input?: ItemDeEntrada[]
    tools?: { type: string; name: string; parameters?: unknown }[]
    stream?: boolean
    store?: boolean
  } & Record<string, unknown>
  /** Só em `/audio/transcriptions`: o tamanho do arquivo recebido. */
  bytes?: number
}

export interface OpenaiFalsa {
  url: string
  pedidos: PedidoRecebido[]
  roteiro: PassoDoRoteiro[]
  transcricao: string
  /** As respostas ao modelo (`/responses`), na ordem. */
  respostas(): PedidoRecebido[]
  /** Os nomes das ferramentas oferecidas no pedido `i` (padrão: o último). */
  ferramentasOferecidas(i?: number): string[]
  /** As saídas de ferramenta que o servidor devolveu ao modelo, em todos os pedidos. */
  saidasDeFerramenta(): { nome: string | null; saida: unknown }[]
  zerar(): void
  fechar(): Promise<void>
}

export async function subirOpenaiFalsa(porta = PORTA_DA_OPENAI_FALSA): Promise<OpenaiFalsa> {
  let contador = 0
  const estado: OpenaiFalsa = {
    url: '',
    pedidos: [],
    roteiro: [],
    transcricao: 'Transcrição de teste.',
    respostas: () => estado.pedidos.filter(p => p.caminho.endsWith('/responses')),
    ferramentasOferecidas(i) {
      const lista = estado.respostas()
      const p = lista[i ?? lista.length - 1]
      return (p?.corpo.tools ?? []).map(t => t.name)
    },
    saidasDeFerramenta() {
      const vistas = new Map<string, { nome: string | null; saida: unknown }>()
      for (const p of estado.respostas()) {
        const itens = p.corpo.input ?? []
        const nomes = new Map(itens.filter(i => i.type === 'function_call').map(i => [i.call_id!, i.name ?? null]))
        for (const i of itens) {
          if (i.type !== 'function_call_output' || !i.call_id) continue
          let saida: unknown = i.output
          try { saida = JSON.parse(i.output ?? '') } catch { /* texto */ }
          vistas.set(i.call_id, { nome: nomes.get(i.call_id) ?? null, saida })
        }
      }
      return [...vistas.values()]
    },
    zerar() { estado.pedidos.length = 0; estado.roteiro.length = 0 },
    fechar: () => new Promise(resolve => servidor.close(() => resolve())),
  }

  const servidor = http.createServer((req, res) => {
    const partes: Buffer[] = []
    req.on('data', p => partes.push(p as Buffer))
    req.on('end', () => {
      const bruto = Buffer.concat(partes)
      const caminho = (req.url ?? '').split('?')[0]!
      const autorizacao = (req.headers['authorization'] as string | undefined) ?? null

      if (caminho.endsWith('/audio/transcriptions')) {
        estado.pedidos.push({ caminho, autorizacao, corpo: {}, bytes: bruto.length })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ text: estado.transcricao }))
        return
      }

      let corpo: PedidoRecebido['corpo'] = {}
      try { corpo = JSON.parse(bruto.toString('utf8') || '{}') } catch { /* não-JSON */ }
      estado.pedidos.push({ caminho, autorizacao, corpo })

      if (!autorizacao?.startsWith('Bearer ')) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'sem chave' } }))
        return
      }
      if (!caminho.endsWith('/responses')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'caminho desconhecido' } }))
        return
      }

      // A regra da API real (store:false): a chamada com id precisa do raciocínio dela.
      const entrada = corpo.input ?? []
      const semRaciocinio = entrada.findIndex((i, n) => i.type === 'function_call' && (i as { id?: string }).id
        && !entrada.slice(0, n).some(x => x.type === 'reasoning'))
      if (semRaciocinio >= 0) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: "Item of type 'function_call' was provided without its required 'reasoning' item." } }))
        return
      }

      const passo = estado.roteiro.shift() ?? { texto: 'Certo.' }
      if (passo.status) {
        res.writeHead(passo.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'fora do ar (openai falsa)' } }))
        return
      }

      const id = `resp_${++contador}`
      const tokens = passo.tokens ?? { entrada: 100, saida: 20 }
      const usage = { input_tokens: tokens.entrada, output_tokens: tokens.saida, total_tokens: tokens.entrada + tokens.saida }
      const saida: Record<string, unknown>[] = []
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const evento = (tipo: string, dados: Record<string, unknown>) =>
        res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dados })}\n\n`)

      evento('response.created', { response: { id, status: 'in_progress' } })
      if (passo.chamar?.length) {
        const item = { type: 'reasoning', id: `rs_${++contador}`, summary: [], encrypted_content: 'cifrado-de-mentira' }
        saida.push(item)
        evento('response.output_item.done', { output_index: saida.length - 1, item })
      }
      for (const c of passo.chamar ?? []) {
        const n = ++contador
        const item = { type: 'function_call', id: `fc_${n}`, call_id: `call_${n}`, name: c.nome, arguments: JSON.stringify(c.args), status: 'completed' }
        saida.push(item)
        evento('response.output_item.done', { output_index: saida.length - 1, item })
      }
      if (passo.texto !== undefined) {
        // Em dois pedaços: prova que a tela junta o que chega aos poucos.
        const meio = Math.ceil(passo.texto.length / 2)
        for (const delta of [passo.texto.slice(0, meio), passo.texto.slice(meio)]) {
          if (delta) evento('response.output_text.delta', { delta })
        }
        const item = { type: 'message', id: `msg_${++contador}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: passo.texto, annotations: [] }] }
        saida.push(item)
        evento('response.output_item.done', { output_index: saida.length - 1, item })
      }
      evento('response.completed', { response: { id, status: 'completed', output: saida, usage } })
      res.end()
    })
  })

  await new Promise<void>(resolve => servidor.listen(porta, '127.0.0.1', () => resolve()))
  estado.url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v1`
  return estado
}
