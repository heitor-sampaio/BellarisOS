/**
 * Sonda da uazapi — roda ANTES de escrever o provider.
 *
 * Três coisas estão em disputa entre as fontes que consultei, e errar qualquer
 * uma delas só apareceria com um número real na mão:
 *
 *   1. `POST /instance/init` ou `/instance/create`?
 *   2. o corpo quer `name`, `instanceName`, ou os dois?
 *   3. em que campo o webhook entrega a URL da mídia?
 *
 * Esta sonda responde (1) e (2) por tentativa, registra as respostas CRUAS num
 * arquivo para consulta, e prova o caminho todo — inclusive o proxy por
 * instância, que é o motivo de estarmos trocando de provedor e que dá para
 * verificar sem telefone nenhum.
 *
 * Cria uma instância descartável e a APAGA no fim, inclusive se algo falhar no
 * meio — instância órfã numa conta paga é cobrança sem dono.
 *
 * Uso:
 *   UAZAPI_ADMIN_TOKEN=xxx node scripts/uazapi-probe.mjs
 *   UAZAPI_BASE_URL=https://free.uazapi.com ... (default: api.uazapi.com)
 *   UAZAPI_PROBE_PROXY=socks5://user:senha@host:1080  (opcional, testa o proxy)
 *   UAZAPI_PROBE_WEBHOOK=https://exemplo.com/api/webhooks/uazapi (opcional)
 */

import { writeFileSync } from 'node:fs'

const BASE  = (process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com').replace(/\/$/, '')
const ADMIN = process.env.UAZAPI_ADMIN_TOKEN
const PROXY = process.env.UAZAPI_PROBE_PROXY ?? ''
const HOOK  = process.env.UAZAPI_PROBE_WEBHOOK ?? 'https://exemplo.invalid/api/webhooks/uazapi'

if (!ADMIN) {
  console.error('UAZAPI_ADMIN_TOKEN é obrigatório.')
  console.error('Uso: UAZAPI_ADMIN_TOKEN=xxx node scripts/uazapi-probe.mjs')
  process.exit(1)
}

const TIMEOUT_MS = 30_000
const registro = []
let instanceToken = null
let falhas = 0

/** Toda chamada passa por aqui para a resposta crua ficar registrada. */
async function chamar(rotulo, path, { method = 'GET', headers = {}, body } = {}) {
  const url = `${BASE}${path}`
  const inicio = Date.now()
  let status = 0, texto = '', json = null, erro = null

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body:    body ? JSON.stringify(body) : undefined,
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    })
    status = res.status
    texto  = await res.text()
    try { json = JSON.parse(texto) } catch { /* resposta não-JSON */ }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }

  const ms = Date.now() - inicio
  const ok = status >= 200 && status < 300

  registro.push({ rotulo, method, path, status, ms, erro, corpoEnviado: body ?? null, resposta: json ?? texto })
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${rotulo.padEnd(34)} ${method} ${path} → ${erro ?? status} (${ms}ms)`)
  if (!ok) falhas++

  return { ok, status, json, texto }
}

const comToken = () => ({ token: instanceToken })
const comAdmin = () => ({ admintoken: ADMIN })

/** Onde está o token na resposta do init? A forma varia entre as fontes. */
function acharToken(json) {
  return json?.token
    ?? json?.hash
    ?? json?.instance?.token
    ?? json?.instance?.apikey
    ?? null
}

async function principal() {
  console.log(`\nSonda uazapi · ${BASE}\n${'─'.repeat(64)}`)

  // 1. O admintoken vale e a base URL está certa?
  await chamar('listar instâncias', '/instance/all', { headers: comAdmin() })

  // 2. `init` ou `create`? E qual chave de nome? Mandar as duas é seguro:
  //    backend em Go ignora campo desconhecido.
  const nome = `bellaris-probe-${Date.now().toString(36)}`
  const corpoInit = { name: nome, instanceName: nome, systemName: 'BellarisOS' }

  let criacao = await chamar('criar instância (init)', '/instance/init', {
    method: 'POST', headers: comAdmin(), body: corpoInit,
  })
  if (!criacao.ok) {
    console.log('   → /instance/init falhou; tentando /instance/create')
    criacao = await chamar('criar instância (create)', '/instance/create', {
      method: 'POST', headers: comAdmin(), body: corpoInit,
    })
  }

  instanceToken = acharToken(criacao.json)
  if (!instanceToken) {
    console.error('\nNão achei o token da instância na resposta. Veja o registro para o formato real.')
    return
  }
  console.log(`   → token da instância em: ${Object.keys(criacao.json ?? {}).join(', ')}`)

  // 3. O status traz o qrcode? Isso decide se o polling da tela pode bater aqui
  //    (barato, idempotente) em vez de repetir /instance/connect, que é escrita.
  const status = await chamar('status da instância', '/instance/status', { headers: comToken() })
  const temQrNoStatus = !!(status.json?.instance?.qrcode ?? status.json?.qrcode)
  console.log(`   → /instance/status traz qrcode? ${temQrNoStatus ? 'SIM' : 'não'}`)

  // 4. Webhook: round-trip. `excludeMessages` PRECISA voltar vazio — com
  //    'wasSentByApi' a uazapi suprime os recibos das nossas mensagens e os
  //    ticks nunca avançam.
  await chamar('definir webhook', '/webhook', {
    method: 'POST', headers: comToken(),
    body: { url: HOOK, events: ['messages', 'connection'], enabled: true, excludeMessages: [] },
  })
  const hookLido = await chamar('ler webhook', '/webhook', { headers: comToken() })
  const excl = hookLido.json?.excludeMessages ?? hookLido.json?.webhook?.excludeMessages
  console.log(`   → excludeMessages voltou: ${JSON.stringify(excl ?? null)}`)

  // 5. A prova que motiva a troca de provedor — e não precisa de telefone.
  if (PROXY) {
    await chamar('definir proxy', '/instance/proxy', {
      method: 'POST', headers: comToken(), body: { enable: true, proxy_url: PROXY },
    })
    const proxyLido = await chamar('ler proxy', '/instance/proxy', { headers: comToken() })
    const ativo = proxyLido.json?.enable === true || proxyLido.json?.proxy?.enable === true
    console.log(`   → proxy ativo? ${ativo ? 'SIM' : 'NÃO — o isolamento de IP não pegou'}`)
    if (!ativo) falhas++
  } else {
    console.log('   → proxy não testado (defina UAZAPI_PROBE_PROXY para provar o isolamento)')
  }

  // 6. O QR sai sem telefone nenhum: prova o caminho até o momento do scan.
  const conexao = await chamar('conectar (QR)', '/instance/connect', {
    method: 'POST', headers: comToken(), body: {},
  })
  const qr = conexao.json?.instance?.qrcode ?? conexao.json?.qrcode
  console.log(`   → qrcode recebido? ${qr ? `SIM (${String(qr).length} chars)` : 'não'}`)
}

try {
  await principal()
} catch (e) {
  console.error('\nErro não tratado:', e)
  falhas++
} finally {
  // Teardown mesmo em falha: instância órfã em conta paga é cobrança sem dono.
  if (instanceToken) {
    await chamar('apagar instância (teardown)', '/instance', {
      method: 'DELETE', headers: comToken(),
    })
  }

  const arquivo = `uazapi-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(arquivo, JSON.stringify({ base: BASE, quando: new Date().toISOString(), registro }, null, 2))
  console.log(`${'─'.repeat(64)}\nRespostas cruas em ${arquivo}`)
  console.log(falhas === 0 ? 'Tudo passou.' : `${falhas} chamada(s) com problema — confira o arquivo.`)
  process.exit(falhas === 0 ? 0 : 1)
}
