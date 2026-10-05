import { request } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { ARQUIVO_DE_SESSAO } from '../playwright.config'
import { varrerSobras } from './apoio/limpeza'

/**
 * Sessão do admin da rede, sem senha em lugar nenhum.
 *
 * O caminho é o mesmo que o app nativo já usa: a service role emite um
 * magic link (`generateLink`), o `verifyOtp` troca o token por uma sessão e o
 * `POST /api/auth/session` grava os cookies — que ficam salvos em
 * `e2e/.auth/admin.json` e valem para toda a suíte.
 *
 * Nenhuma senha é lida, digitada ou gravada: as chaves vêm do `.env.local`,
 * que já as tem para o próprio app rodar.
 */
export default async function globalSetup() {
  const url         = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email       = process.env.E2E_ADMIN_EMAIL ?? 'admin@bellaris.com.br'
  const baseURL     = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  const faltando = [
    ['NEXT_PUBLIC_SUPABASE_URL', url],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', anonKey],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ].filter(([, v]) => !v).map(([k]) => k)

  if (faltando.length > 0) {
    throw new Error(
      `Faltam variáveis em apps/web/.env.local para o E2E: ${faltando.join(', ')}. ` +
      'São as mesmas que o app já usa — nenhuma chave nova.',
    )
  }

  // Sobras `[e2e]` de rodadas anteriores — de teste que estourou o tempo ou de
  // limpeza que falhou calada. Ver `apoio/limpeza.ts`. Não para a suíte, mas
  // não se cala: o que não saiu aparece aqui, na saída do Playwright.
  const { apagou, falhas } = await varrerSobras()
  if (Object.keys(apagou).length) console.log('[e2e] varredura de sobras apagou:', apagou)
  for (const f of falhas) console.warn(`[e2e] varredura NÃO apagou ${f.o_que}: ${f.erro}`)

  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
  const anon = createClient(url!, anonKey!, { auth: { persistSession: false } })

  // ⚠️ As duas metades da completa rodam JUNTAS (no CI) e emitem o link do
  // MESMO admin ao mesmo tempo: o link novo invalida o que a outra metade
  // ainda ia usar ("Email link is invalid or has expired"), e a metade inteira
  // morria antes do primeiro teste (2026-10-05). Quem perde a corrida emite
  // outro, depois de uma espera aleatória.
  const obtida: { sessao: { session: { access_token: string; refresh_token: string } } | null } = { sessao: null }
  let ultimoErro = ''
  for (let tentativa = 1; tentativa <= 5 && !obtida.sessao; tentativa++) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(
        `Não consegui emitir a sessão de ${email}: ${linkErr?.message ?? 'link sem token'}. ` +
        'Confira E2E_ADMIN_EMAIL — precisa ser um usuário com abrangência de rede.',
      )
    }
    const { data, error: otpErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
    if (!otpErr && data.session) { obtida.sessao = { session: data.session }; break }
    ultimoErro = otpErr?.message ?? 'sem sessão'
    await new Promise(ok => setTimeout(ok, 1_000 + Math.random() * 4_000 * tentativa))
  }
  const sessao = obtida.sessao
  if (!sessao) {
    throw new Error(`Não consegui trocar o token por uma sessão: ${ultimoErro}`)
  }

  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post('/api/auth/session', {
    data: {
      access_token:  sessao.session.access_token,
      refresh_token: sessao.session.refresh_token,
    },
  })
  if (!res.ok()) {
    throw new Error(`/api/auth/session respondeu ${res.status()}: ${await res.text()}`)
  }

  fs.mkdirSync(path.dirname(ARQUIVO_DE_SESSAO), { recursive: true })
  await ctx.storageState({ path: ARQUIVO_DE_SESSAO })
  await ctx.dispose()
}
