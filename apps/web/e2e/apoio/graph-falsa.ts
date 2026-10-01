import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Uma Graph API da Meta de mentira, em `127.0.0.1` — a irmã de
 * `uazapi-falsa.ts` para o provedor OFICIAL e para a API de Conversões.
 *
 * A caixa oficial `[e2e]` (`config.graphBase`) e a integração de anúncios da
 * rede de teste (`config.graphBase`) apontam para cá; o app faz o envio inteiro
 * e o teste lê o que teria ido para a Meta. `graphBase` não é gravável pela tela
 * (fica fora das listas de chaves): só o teste o põe, direto no banco.
 *
 *  - POST `…/messages` → `{ messages: [{ id: 'wamid.falsa-N' }] }`
 *  - POST `…/events`   → `{ events_received: 1 }`
 *  - GET que termina num sufixo de `responder` → o corpo registrado
 *  - qualquer outro    → `{}`
 */

export interface ChamadaAGraph { metodo: string; caminho: string; corpo: Record<string, unknown> }

export interface GraphFalsa {
  url: string
  chamadas: ChamadaAGraph[]
  terminadasEm(sufixo: string): ChamadaAGraph[]
  /** Resposta de um GET cujo caminho termina em `sufixo` (contas, pixels, campanhas). */
  responder(sufixo: string, corpo: unknown): void
  fechar(): Promise<void>
}

export async function subirGraphFalsa(porta = 0): Promise<GraphFalsa> {
  let contador = 0
  const respostas = new Map<string, unknown>()
  const estado: GraphFalsa = {
    url: '',
    chamadas: [],
    terminadasEm: sufixo => estado.chamadas.filter(c => c.caminho.endsWith(sufixo)),
    responder: (sufixo, corpo) => { respostas.set(sufixo, corpo) },
    fechar: () => new Promise(resolve => servidor.close(() => resolve())),
  }
  const servidor = http.createServer((req, res) => {
    let bruto = ''
    req.on('data', parte => { bruto += parte })
    req.on('end', () => {
      let corpo: Record<string, unknown> = {}
      try { corpo = bruto ? JSON.parse(bruto) : {} } catch { /* não-JSON */ }
      const caminho = (req.url ?? '').split('?')[0]!
      // Num GET, os parâmetros (o token, por exemplo) contam como o corpo.
      if (req.method === 'GET') corpo = Object.fromEntries(new URL(req.url ?? '/', 'http://x').searchParams)
      estado.chamadas.push({ metodo: req.method ?? '', caminho, corpo })
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.method === 'GET') {
        // O sufixo mais longo vence: `/act_1/adspixels` antes de `/act_1`.
        const achado = [...respostas.keys()].sort((a, b) => b.length - a.length).find(s => caminho.endsWith(s))
        if (achado) return res.end(JSON.stringify(respostas.get(achado)))
      }
      if (req.method === 'POST' && caminho.endsWith('/messages')) return res.end(JSON.stringify({ messages: [{ id: `wamid.falsa-${++contador}` }] }))
      if (req.method === 'POST' && caminho.endsWith('/events')) return res.end(JSON.stringify({ events_received: 1 }))
      res.end('{}')
    })
  })
  await new Promise<void>(resolve => servidor.listen(porta, '127.0.0.1', () => resolve()))
  estado.url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  return estado
}
