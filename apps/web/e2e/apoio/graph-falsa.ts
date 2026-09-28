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
 *  - qualquer outro    → `{}`
 */

export interface ChamadaAGraph { metodo: string; caminho: string; corpo: Record<string, unknown> }

export interface GraphFalsa {
  url: string
  chamadas: ChamadaAGraph[]
  terminadasEm(sufixo: string): ChamadaAGraph[]
  fechar(): Promise<void>
}

export async function subirGraphFalsa(): Promise<GraphFalsa> {
  let contador = 0
  const estado: GraphFalsa = {
    url: '',
    chamadas: [],
    terminadasEm: sufixo => estado.chamadas.filter(c => c.caminho.endsWith(sufixo)),
    fechar: () => new Promise(resolve => servidor.close(() => resolve())),
  }
  const servidor = http.createServer((req, res) => {
    let bruto = ''
    req.on('data', parte => { bruto += parte })
    req.on('end', () => {
      let corpo: Record<string, unknown> = {}
      try { corpo = bruto ? JSON.parse(bruto) : {} } catch { /* não-JSON */ }
      const caminho = (req.url ?? '').split('?')[0]!
      estado.chamadas.push({ metodo: req.method ?? '', caminho, corpo })
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.method === 'POST' && caminho.endsWith('/messages')) return res.end(JSON.stringify({ messages: [{ id: `wamid.falsa-${++contador}` }] }))
      if (req.method === 'POST' && caminho.endsWith('/events')) return res.end(JSON.stringify({ events_received: 1 }))
      res.end('{}')
    })
  })
  await new Promise<void>(resolve => servidor.listen(0, '127.0.0.1', () => resolve()))
  estado.url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  return estado
}
