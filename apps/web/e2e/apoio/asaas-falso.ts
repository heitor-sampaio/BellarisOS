import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Um ASAAS de mentira em `127.0.0.1` (a irmã de `graph-falsa.ts`): o servidor
 * do build sobe com `ASAAS_BASE_URL_TESTE` apontando para cá
 * (playwright.build.config.ts), e o app faz a cobrança inteira sem falar com o
 * Asaas de verdade. O teste lê o que teria ido para lá.
 *
 *  - GET  /customers?externalReference=… → os clientes criados com ela
 *  - POST /customers                     → `{ id: 'cus_falso_N' }`
 *  - POST /subscriptions                 → `{ id: 'sub_falsa_N', status: 'ACTIVE' }`
 *  - PUT/DELETE /subscriptions/{id}      → `{ id, deleted }`
 *  - GET  /subscriptions/{id}/payments   → as cobranças que o teste registrou
 */
export interface ChamadaAoAsaas { metodo: string; caminho: string; corpo: Record<string, unknown>; chave: string | null }

export interface AsaasFalso {
  url: string
  chamadas: ChamadaAoAsaas[]
  /** As cobranças que `GET /subscriptions/{id}/payments` devolve. */
  cobrancas: Map<string, Record<string, unknown>[]>
  fechar(): Promise<void>
}

export async function subirAsaasFalso(porta = 0): Promise<AsaasFalso> {
  let n = 0
  const clientes: { id: string; externalReference: string }[] = []
  const estado: AsaasFalso = {
    url: '', chamadas: [], cobrancas: new Map(),
    fechar: () => new Promise(resolve => servidor.close(() => resolve())),
  }
  const servidor = http.createServer((req, res) => {
    let bruto = ''
    req.on('data', p => { bruto += p })
    req.on('end', () => {
      let corpo: Record<string, unknown> = {}
      try { corpo = bruto ? JSON.parse(bruto) : {} } catch { /* não-JSON */ }
      const u = new URL(req.url ?? '/', 'http://x')
      const caminho = u.pathname.replace(/^\/v3/, '')
      const chave = (req.headers['access_token'] as string | undefined) ?? null
      estado.chamadas.push({ metodo: req.method ?? '', caminho, corpo, chave })
      const responder = (status: number, json: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)) }
      if (!chave) return responder(401, { errors: [{ description: 'sem chave' }] })

      if (req.method === 'GET' && caminho === '/customers') {
        const ref = u.searchParams.get('externalReference')
        return responder(200, { data: clientes.filter(c => c.externalReference === ref) })
      }
      if (req.method === 'POST' && caminho === '/customers') {
        if (!corpo.cpfCnpj) return responder(400, { errors: [{ description: 'cpfCnpj obrigatório' }] })
        const c = { id: `cus_falso_${++n}`, externalReference: String(corpo.externalReference ?? '') }
        clientes.push(c)
        return responder(200, c)
      }
      if (req.method === 'POST' && caminho === '/subscriptions') return responder(200, { id: `sub_falsa_${++n}`, status: 'ACTIVE' })
      const sub = caminho.match(/^\/subscriptions\/([^/]+)(\/payments)?$/)
      if (sub && req.method === 'GET' && sub[2]) return responder(200, { data: estado.cobrancas.get(sub[1]!) ?? [] })
      if (sub && req.method === 'PUT') return responder(200, { id: sub[1], status: 'ACTIVE' })
      if (sub && req.method === 'DELETE') return responder(200, { id: sub[1], deleted: true })
      responder(404, { errors: [{ description: `não conheço ${req.method} ${caminho}` }] })
    })
  })
  await new Promise<void>(ok => servidor.listen(porta, '127.0.0.1', () => ok()))
  estado.url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  return estado
}
