/**
 * Corrige a atribuição das conversas que o parser quebrado deixou "Orgânico".
 *
 * Entre a conexão da uazapi e a correção do parser (commit ac8aee1), toda
 * mensagem vinda de anúncio foi gravada sem `ad_referral`, e a conversa nasceu
 * como orgânica. Este script refaz o que teria acontecido se o parser
 * estivesse certo: busca o payload na uazapi, cruza pelo id da mensagem e
 * grava o que falta.
 *
 * **Roda em modo de conferência por padrão.** Para aplicar de verdade:
 *
 *   node scripts/corrigir-atribuicao-anuncio.mjs --aplicar
 *
 * O que NÃO faz, de propósito:
 *
 *  - **não emite `conversa.veio_de_anuncio`**. A corrente de eventos é um
 *    registro do que aconteceu QUANDO aconteceu; enfiar um fato de ontem nela
 *    hoje faria toda automação futura disparar com um evento velho, e o painel
 *    de eventos passaria a mentir sobre quando as coisas ocorreram;
 *  - **não mexe em lead**. O webhook nunca escreveu atribuição em `leads` — ela
 *    mora na conversa, que é o contato. Corrigir lead aqui seria inventar uma
 *    regra que o sistema não tem.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APLICAR = process.argv.includes('--aplicar')

const env = Object.fromEntries(
  readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: cfg } = await db
  .from('integration_configs').select('config')
  .eq('provider', 'uazapi').eq('is_active', true).maybeSingle()

if (!cfg) { console.error('Sem conexão uazapi ativa.'); process.exit(1) }

const base = (cfg.config.baseUrl ?? '').replace(/\/$/, '')

// ── 1. O que a uazapi tem de anúncio ────────────────────────────────────────
const res = await fetch(`${base}/message/find`, {
  method:  'POST',
  headers: { token: cfg.config.token, 'Content-Type': 'application/json' },
  body:    JSON.stringify({ limit: 1000, fromMe: false }),
})
const lista = await res.json()
const msgs  = Array.isArray(lista) ? lista : (lista.messages ?? [])

const anuncioPorId = new Map()
for (const m of msgs) {
  const ad = m?.content?.contextInfo?.externalAdReply
  if (ad?.sourceID && m.messageid) anuncioPorId.set(m.messageid, ad)
}
console.log(`uazapi: ${msgs.length} mensagens, ${anuncioPorId.size} de anúncio`)

// ── 2. Quais estão no nosso banco sem referral ──────────────────────────────
const ids = [...anuncioPorId.keys()]
const { data: nossas, error } = await db
  .from('messages')
  .select('id, external_id, conversation_id, ad_referral')
  .in('external_id', ids)

if (error) { console.error('Erro ao ler mensagens:', error.message); process.exit(1) }

const aCorrigir = (nossas ?? []).filter(m => !m.ad_referral)
console.log(`no banco: ${(nossas ?? []).length} dessas · ${aCorrigir.length} sem atribuição\n`)

if (!aCorrigir.length) { console.log('Nada a corrigir.'); process.exit(0) }

/** O mesmo formato que `lerAnuncio` produz e que `messages.ad_referral` guarda. */
const MIDIA = { 1: 'IMAGE', 2: 'VIDEO' }
function referralDe(ad) {
  const r = {}
  if (ad.sourceType) r.source_type = String(ad.sourceType)
  if (ad.sourceID)   r.source_id   = String(ad.sourceID)
  if (ad.sourceURL)  r.source_url  = String(ad.sourceURL)
  if (ad.ctwaClid)   r.ctwa_clid   = String(ad.ctwaClid)
  if (ad.title)      r.headline    = String(ad.title)
  if (ad.body)       r.body        = String(ad.body)
  if (ad.sourceApp)  r.source_app  = String(ad.sourceApp).toLowerCase()
  if (ad.mediaType !== undefined) r.media_type = MIDIA[Number(ad.mediaType)] ?? String(ad.mediaType)
  if (ad.thumbnailURL) r.thumbnail_url = String(ad.thumbnailURL)
  return r
}

/** A plataforma, como `metaPlatform` deriva: o provedor primeiro, a URL depois. */
function plataforma(ad) {
  const app = String(ad.sourceApp ?? '').toLowerCase()
  if (app === 'instagram' || app === 'facebook') return app
  const url = String(ad.sourceURL ?? '').toLowerCase()
  if (url.includes('instagram') || url.includes('ig.me')) return 'instagram'
  if (url.includes('facebook')  || url.includes('fb.'))   return 'facebook'
  return undefined
}

let mensagens = 0
let conversas = 0

for (const m of aCorrigir) {
  const ad = anuncioPorId.get(m.external_id)
  const ref = referralDe(ad)

  const { data: conv } = await db
    .from('conversations').select('id, attribution, tags, contact_name')
    .eq('id', m.conversation_id).maybeSingle()

  const atual = conv?.attribution ?? {}
  const novo  = { ...atual, source: 'Meta Ads', ad_id: ref.source_id }
  if (ref.ctwa_clid) novo.ctwa_clid = ref.ctwa_clid
  const plat = plataforma(ad)
  if (plat) novo.utm_source = plat

  // 'Meta Ads' na frente, como `mergeTags` faz: a tag de origem espelha o
  // source. 'Orgânico' sai — ela era a conclusão errada, não um dado.
  const tags = ['Meta Ads', ...(conv?.tags ?? []).filter(t => t !== 'Orgânico' && t !== 'Meta Ads')]

  console.log(`· ${conv?.contact_name ?? '(?)'}`)
  console.log(`  anúncio ${ref.source_id}${plat ? ` (${plat})` : ''}${ref.ctwa_clid ? ' · com ctwa_clid' : ' · SEM ctwa_clid'}`)
  console.log(`  ${JSON.stringify(atual)} → ${JSON.stringify(novo)}`)

  if (!APLICAR) continue

  const { error: e1 } = await db.from('messages').update({ ad_referral: ref }).eq('id', m.id)
  if (e1) { console.error('  ERRO na mensagem:', e1.message); continue }
  mensagens++

  const { error: e2 } = await db
    .from('conversations').update({ attribution: novo, tags }).eq('id', m.conversation_id)
  if (e2) { console.error('  ERRO na conversa:', e2.message); continue }
  conversas++
}

console.log(
  APLICAR
    ? `\nAplicado: ${mensagens} mensagens, ${conversas} conversas.`
    : `\nConferência apenas. Para aplicar: node scripts/corrigir-atribuicao-anuncio.mjs --aplicar`,
)
