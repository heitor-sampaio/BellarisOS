#!/usr/bin/env node
/**
 * Roda um comando contra o BANCO DE TESTES LOCAL (`scripts/banco-local.mjs`).
 *
 * Carrega `apps/web/.env.banco-local` POR CIMA do ambiente: o Playwright, o
 * `next dev`, o `next build` e os scripts leem o `.env.local` sem sobrescrever
 * o que já está no processo — então o Supabase daqui vence o da nuvem, e as
 * outras chaves (VAPID, Meta, as falsas do E2E) seguem as de sempre.
 *
 * Exemplos (de apps/web):
 *   node scripts/com-banco-local.mjs pnpm exec playwright test e2e/agenda.spec.ts --workers=1
 *   node scripts/com-banco-local.mjs pnpm test:e2e:completa
 */
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arquivo = path.join(WEB, '.env.banco-local')
if (!fs.existsSync(arquivo)) {
  console.error('[com-banco-local] falta apps/web/.env.banco-local: rode `node scripts/banco-local.mjs preparar`.')
  process.exit(1)
}
const local = dotenv.parse(fs.readFileSync(arquivo))
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(local.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('[com-banco-local] .env.banco-local não aponta para um Supabase local: recuso rodar.')
  process.exit(1)
}
const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('Uso: node scripts/com-banco-local.mjs <comando> [args…]')
  process.exit(1)
}
const r = spawnSync(cmd, args, { cwd: process.cwd(), stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...local } })
process.exit(r.status ?? 1)
