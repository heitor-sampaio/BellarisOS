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
 * Credenciais vêm de `apps/web/.env.local` (que o .gitignore já cobre) — nunca
 * da linha de comando, que fica no histórico do shell, nem coladas num chat.
 * Basta acrescentar lá:
 *
 *   UAZAPI_ADMIN_TOKEN=...
 *   UAZAPI_BASE_URL=https://api.uazapi.com      # opcional
 *   UAZAPI_PROBE_PROXY=socks5://user:senha@host:1080   # opcional
 *   UAZAPI_PROBE_WEBHOOK=https://.../api/webhooks/uazapi  # opcional
 *
 * E rodar: `node scripts/uazapi-probe.mjs`
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// -- .env.local ---------------------------------------------------------------
// Node não lê o .env.local do Next sozinho, e passar segredo por linha de
// comando deixa rastro no histórico do shell. Variável de ambiente já definida
// tem precedência, para CI continuar funcionando.
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const arquivo of [join(raiz, 'apps', 'web', '.env.local'), join(raiz, '.env.local')]) {
  if (!existsSync(arquivo)) continue
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, chave, bruto] = m
    if (process.env[chave] !== undefined) continue
    process.env[chave] = bruto.trim().replace(/^["']|["']$/g, '')
  }
}

const BASE  = (process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com').replace(/\/$/, '')
const ADMIN = process.env.UAZAPI_ADMIN_TOKEN
const PROXY = process.env.UAZAPI_PROBE_PROXY ?? ''
const HOOK  = process.env.UAZAPI_PROBE_WEBHOOK ?? 'https://exemplo.invalid/api/webhooks/uazapi'

if (!ADMIN) {
  console.error('UAZAPI_ADMIN_TOKEN não encontrado.')
  console.error('Acrescente a linha `UAZAPI_ADMIN_TOKEN=...` em apps/web/.env.local e rode de novo.')
  process.exit(1)
}

/** Preenchido assim que a instância nasce; a máscara depende dele. */
let instanceToken = null

/**
 * Máscara para tudo que for segredo.
 *
 * O arquivo de saída existe para consulta humana e pode acabar colado num chat
 * ou anexado num ticket. A resposta do `init` traz o token da instância e o
 * proxy traz usuário e senha — nada disso pode sair em claro.
 */
function mascarar(valor) {
  if (typeof valor === 'string') {
    let v = valor
    if (ADMIN) v = v.split(ADMIN).join('«admintoken»')
    if (instanceToken) v = v.split(instanceToken).join('«token-da-instancia»')
    if (PROXY) v = v.split(PROXY).join('«proxy-url»')
    // Qualquer credencial embutida numa URL, mesmo que não seja a nossa.
    return v.replace(/(\w+:\/\/)[^:/@\s]+:[^@\s]+@/g, '$1«usuario»:«senha»@')
  }
  if (Array.isArray(valor)) return valor.map(mascarar)
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) =>
      /token|apikey|secret|senha|password|proxy_url/i.test(k)
        ? [k, v ? '«oculto»' : v]
        : [k, mascarar(v)],
    ))
  }
  return valor
}

const TIMEOUT_MS = 30_000
const registro = []
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

  registro.push({
    rotulo, method, path, status, ms, erro,
    corpoEnviado: mascarar(body ?? null),
    resposta:     mascarar(json ?? texto),
  })
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
  // /webhook devolve um ARRAY de webhooks, não um objeto.
  const hook0 = Array.isArray(hookLido.json) ? hookLido.json[0] : hookLido.json?.webhook ?? hookLido.json
  const excl = hook0?.excludeMessages
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
    console.log('   → proxy próprio não testado (defina UAZAPI_PROBE_PROXY)')
  }

  // A instância nasce com `proxy_managed_country`, o que sugere proxy gerenciado
  // pela própria uazapi. Se existir, pode dispensar contratar IP à parte.
  await chamar('ler proxy (estado atual)', '/instance/proxy', { headers: comToken() })

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
  writeFileSync(arquivo, JSON.stringify({
    base: BASE,
    quando: new Date().toISOString(),
    aviso: 'Credenciais mascaradas. Ainda assim, confira antes de compartilhar.',
    registro,
  }, null, 2))
  console.log(`${'─'.repeat(64)}\nRespostas cruas em ${arquivo}`)
  console.log(falhas === 0 ? 'Tudo passou.' : `${falhas} chamada(s) com problema — confira o arquivo.`)
  process.exit(falhas === 0 ? 0 : 1)
}
