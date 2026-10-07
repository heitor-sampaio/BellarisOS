import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Uma uazapi de mentira, em `127.0.0.1`, para o envio de mensagem rodar de
 * ponta a ponta sem falar com ninguém.
 *
 * O E2E roda contra o banco da produção. Uma caixa `[e2e]` com `baseUrl`
 * apontando para cá faz o app executar o caminho de saída inteiro — escolher a
 * caixa, gravar `sending`, chamar o provedor, registrar o id devolvido — e o
 * teste lê exatamente o que teria saído. Antes, a caixa de teste apontava para
 * `https://e2e.invalido`: o envio sempre falhava na rede, e o caminho de
 * SUCESSO nunca era exercitado.
 *
 * - `modo = 'ok'`: responde como a uazapi, com um `messageid` novo por chamada.
 * - `modo = 'erro'`: responde 500, como um provedor fora do ar.
 * - Qualquer outro caminho (o `/chat/details` que o webhook consulta, por
 *   exemplo) responde `{}` e fica registrado também.
 *
 * O CICLO DA INSTÂNCIA (a conexão gerenciada, `lib/whatsapp/uazapi-admin.ts`):
 * `/instance/init` devolve um token novo; `/instance/status` diz "conectada"
 * para os tokens em `conectadas` e devolve um QR para os outros;
 * `/instance/connect` devolve o QR. O build sobe com `UAZAPI_BASE_URL` na
 * porta fixa `PORTA_DA_UAZAPI_FALSA` (playwright.build.config.ts) — criar uma
 * instância de verdade é COBRADO, e o E2E nunca deve falar com a uazapi real.
 */

/** A porta fixa da uazapi falsa que o build conhece pelo ambiente. */
export const PORTA_DA_UAZAPI_FALSA = 3197

/** Um PNG de 1×1: o bastante para a tela desenhar "o QR". */
export const QR_FALSO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

export interface ChamadaRecebida {
  caminho: string
  token:   string | null
  corpo:   Record<string, unknown>
}

export interface UazapiFalsa {
  url: string
  chamadas: ChamadaRecebida[]
  modo: 'ok' | 'erro'
  /** Token da instância → o número pareado. Fora daqui, a instância espera o QR. */
  conectadas: Map<string, { jid: string; nome: string }>
  /** As chamadas para um caminho, na ordem em que chegaram. */
  para(caminho: string): ChamadaRecebida[]
  fechar(): Promise<void>
}

export async function subirUazapiFalsa(porta = 0): Promise<UazapiFalsa> {
  let contador = 0
  const estado: UazapiFalsa = {
    url: '',
    chamadas: [],
    modo: 'ok',
    conectadas: new Map(),
    para: caminho => estado.chamadas.filter(c => c.caminho === caminho),
    fechar: () => new Promise(resolve => servidor.close(() => resolve())),
  }

  const servidor = http.createServer((req, res) => {
    let bruto = ''
    req.on('data', parte => { bruto += parte })
    req.on('end', () => {
      let corpo: Record<string, unknown> = {}
      try { corpo = bruto ? JSON.parse(bruto) : {} } catch { /* não-JSON */ }
      const caminho = (req.url ?? '').split('?')[0]!
      estado.chamadas.push({ caminho, token: (req.headers['token'] as string | undefined) ?? null, corpo })

      const responder = (status: number, json: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(json))
      }
      const token = (req.headers['token'] as string | undefined) ?? ''
      if (caminho === '/instance/init') {
        const novo = `falsa-instancia-${++contador}`
        return responder(200, { token: novo, instance: { id: novo, name: String(corpo.name ?? novo), token: novo } })
      }
      if (caminho === '/instance/status') {
        const par = estado.conectadas.get(token)
        return responder(200, par
          ? { status: { connected: true, loggedIn: true, jid: par.jid }, instance: { profileName: par.nome } }
          : { status: { connected: false, loggedIn: false }, instance: { qrcode: QR_FALSO } })
      }
      if (caminho === '/instance/connect') return responder(200, { instance: { qrcode: QR_FALSO } })

      const enviando = caminho.startsWith('/send/') || caminho === '/message/edit'
      if (enviando && estado.modo === 'erro') return responder(500, { error: 'fora do ar (uazapi falsa)' })
      if (enviando) return responder(200, { messageid: `falsa-${++contador}` })
      responder(200, {})
    })
  })

  await new Promise<void>(resolve => servidor.listen(porta, '127.0.0.1', () => resolve()))
  estado.url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  return estado
}
