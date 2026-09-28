import { defineConfig } from '@playwright/test'
import base from './playwright.config'

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
process.env.E2E_BASE_URL = `http://localhost:${PORTA}`

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: process.env.E2E_BASE_URL },
  webServer: {
    command: `node scripts/servir-build.mjs ${PORTA}`,
    cwd: __dirname,
    url: process.env.E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
