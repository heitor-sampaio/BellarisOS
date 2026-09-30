import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import { ISOLADOS } from './e2e/grupos'

/**
 * A suíte inteira contra o BUILD de produção (`next build` + o servidor
 * standalone, como no Docker — ver `scripts/servir-build.mjs`), na
 * porta 3100 — o `next dev` da 3000 pode continuar aberto ao lado.
 *
 * É a regressão completa (local, por `pnpm test:e2e:completa`, e no GitHub
 * Actions). Contra o `next dev`, boa parte do tempo era compilar cada tela na
 * primeira visita, e o processo inchava até derrubar a máquina.
 *
 * `apoio/acao-direta.ts` lê os manifestos das actions do build (`.next/server`)
 * quando `E2E_BUILD` está ligado — no dev eles moram em `.next/dev/server`.
 */
process.env.E2E_BUILD = '1'
const PORTA = process.env.E2E_PORTA ?? '3100'
// 127.0.0.1, igual ao HOSTNAME do servidor (ver scripts/servir-build.mjs).
process.env.E2E_BASE_URL = `http://127.0.0.1:${PORTA}`

/**
 * `E2E_GRUPO` escolhe a metade da suíte (`e2e/grupos.ts`): `isolados` roda em
 * paralelo (`E2E_WORKERS`, 3 por padrão — um arquivo por worker, os testes de
 * cada arquivo em ordem), `compartilhados` um por vez. Sem grupo, a suíte
 * inteira um por vez, como antes. `scripts/e2e-completa.mjs` roda os dois em
 * sequência.
 */
const grupo = process.env.E2E_GRUPO
const isolados = ISOLADOS.map(f => `**/${f}`)

export default defineConfig({
  ...base,
  ...(grupo === 'isolados' ? { testMatch: isolados, workers: Number(process.env.E2E_WORKERS ?? 3) } : {}),
  ...(grupo === 'compartilhados' ? { testIgnore: isolados, workers: 1 } : {}),
  // Cada metade na sua pasta: o Playwright limpa a pasta ao começar, e a
  // segunda metade apagaria as evidências das falhas da primeira.
  ...(grupo ? { outputDir: `test-results/${grupo}` } : {}),
  use: { ...base.use, baseURL: process.env.E2E_BASE_URL },
  webServer: {
    command: `node scripts/servir-build.mjs ${PORTA}`,
    cwd: __dirname,
    url: process.env.E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
