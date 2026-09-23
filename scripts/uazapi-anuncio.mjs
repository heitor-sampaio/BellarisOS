/**
 * Sonda: como a uazapi entrega, DE VERDADE, uma mensagem vinda de anúncio.
 *
 * O parser de `lerAnuncio` (lib/whatsapp/uazapi.ts) foi escrito a partir da
 * documentação e de um webhook de teste. Esta sonda busca mensagens REAIS na
 * instância da rede e mostra o caminho exato em que o `externalAdReply` chega —
 * que é a única forma de saber se o parser está lendo o lugar certo.
 *
 * Só LÊ. Não envia nada, não altera nada.
 *
 * Credenciais saem do banco (a config da rede) e do `.env.local`; nada de
 * token na linha de comando, que fica no histórico do shell.
 *
 * Uso: node scripts/uazapi-anuncio.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: cfg, error } = await db
  .from('integration_configs')
  .select('config')
  .eq('provider', 'uazapi')
  .eq('is_active', true)
  .maybeSingle()

if (error || !cfg) {
  console.error('Sem conexão uazapi ativa neste banco.', error?.message ?? '')
  process.exit(1)
}

const base  = (cfg.config.baseUrl ?? env.UAZAPI_BASE_URL ?? '').replace(/\/$/, '')
const token = cfg.config.token

if (!base || !token) { console.error('Config da uazapi sem baseUrl ou token.'); process.exit(1) }

console.log('instância:', cfg.config.connectedPhone ?? '(sem número)', '·', base)

/** Busca mensagens; a uazapi pagina por `limit` + `offset`. */
async function buscar(body) {
  const res = await fetch(`${base}/message/find`, {
    method:  'POST',
    headers: { token, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30_000),
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${texto.slice(0, 300)}`)
  try { return JSON.parse(texto) } catch { throw new Error(`resposta não-JSON: ${texto.slice(0, 200)}`) }
}

// As últimas mensagens recebidas. O anúncio é raro; puxamos um lote grande e
// filtramos aqui em vez de pedir por campo — a API não filtra por contextInfo.
const resposta = await buscar({ limit: 300, fromMe: false })
const lista = Array.isArray(resposta) ? resposta : (resposta.messages ?? resposta.data ?? [])

console.log('mensagens recebidas no lote:', lista.length)

/** Acha `externalAdReply` em QUALQUER profundidade, e devolve o caminho. */
function acharAdReply(obj, caminho = '') {
  if (!obj || typeof obj !== 'object') return []
  let achados = []
  for (const [k, v] of Object.entries(obj)) {
    const aqui = caminho ? `${caminho}.${k}` : k
    if (k === 'externalAdReply' && v && typeof v === 'object') achados.push({ caminho: aqui, valor: v })
    else if (v && typeof v === 'object') achados = achados.concat(acharAdReply(v, aqui))
  }
  return achados
}

const comAnuncio = []
for (const m of lista) {
  const achados = acharAdReply(m)
  if (achados.length) comAnuncio.push({ mensagem: m, achados })
}

console.log('mensagens COM externalAdReply:', comAnuncio.length)

if (!comAnuncio.length) {
  // Ainda assim vale ver a forma de uma mensagem qualquer: os nomes dos campos
  // mudam entre versões da uazapi, e é aí que o parser quebra em silêncio.
  console.log('\nnenhuma com anúncio no lote. Forma de uma mensagem recebida qualquer:')
  console.log(JSON.stringify(lista[0] ?? {}, null, 2).slice(0, 3000))
  process.exit(0)
}

for (const { mensagem, achados } of comAnuncio.slice(0, 5)) {
  console.log('\n' + '='.repeat(70))
  console.log('id:', mensagem.id ?? mensagem.messageid ?? '(?)')
  console.log('de:', mensagem.sender_pn ?? mensagem.sender ?? mensagem.chatid ?? '(?)')
  console.log('quando:', mensagem.messageTimestamp ?? mensagem.timestamp ?? '(?)')
  console.log('texto:', String(mensagem.text ?? mensagem.content ?? '').slice(0, 80))
  for (const a of achados) {
    console.log('\n  CAMINHO:', a.caminho)
    console.log('  ' + JSON.stringify(a.valor, null, 2).split('\n').join('\n  '))
  }
}

// O payload inteiro da primeira, para conferir campo a campo sem depender do
// que esta sonda achou que era importante.
const arquivo = new URL('../uazapi-anuncio-bruto.json', import.meta.url)
writeFileSync(arquivo, JSON.stringify(comAnuncio.map(c => c.mensagem), null, 2))
console.log('\npayloads completos em uazapi-anuncio-bruto.json')
