#!/usr/bin/env node
/**
 * Serve o build do jeito que a produção serve — o servidor STANDALONE.
 *
 * O `next.config` usa `output: 'standalone'` (é o que o Dockerfile embarca), e
 * com ele `next start` não funciona direito: o próprio Next avisa, e na
 * primeira rodada da suíte contra o build uma action ficou pendurada. Aqui se
 * repete o Dockerfile: `.next/static` e `public` entram ao lado do
 * `server.js`, que sobe na porta pedida.
 *
 *   node scripts/servir-build.mjs [porta]     (padrão: 3100)
 *
 * As variáveis de ambiente vêm de quem chama (o Playwright já carregou o
 * `.env.local`; no GitHub Actions, o environment).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WEB   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOLTO = path.join(WEB, '.next', 'standalone', 'apps', 'web')
const porta = process.argv[2] ?? process.env.E2E_PORTA ?? '3100'

if (!fs.existsSync(path.join(SOLTO, 'server.js'))) {
  console.error('Não há build standalone: rode `next build` antes.')
  process.exit(1)
}

fs.cpSync(path.join(WEB, '.next', 'static'), path.join(SOLTO, '.next', 'static'), { recursive: true })
if (fs.existsSync(path.join(WEB, 'public'))) {
  fs.cpSync(path.join(WEB, 'public'), path.join(SOLTO, 'public'), { recursive: true })
}

const servidor = spawn(process.execPath, ['server.js'], {
  cwd: SOLTO,
  stdio: 'inherit',
  // '::' atende IPv4 e IPv6: 'localhost' pode resolver para qualquer um.
  env: { ...process.env, PORT: porta, HOSTNAME: '::' },
})
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => servidor.kill(sinal))
servidor.on('exit', code => process.exit(code ?? 0))
