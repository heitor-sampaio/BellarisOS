import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import dotenv from 'dotenv'

/**
 * O SITE (apps/site, bellarisos.com — 2026-10-17) contra o build dele, à
 * parte da suíte da clínica: não há sessão, nem global-setup, nem os outros
 * apps. Os specs moram em `e2e-site/`, fora do `testDir` da suíte.
 *
 *   npx playwright test -c playwright.site.config.ts
 *
 * O build vem antes: `pnpm --filter=site build`.
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

const PORTA = '3103'
process.env.E2E_SITE_URL = `http://127.0.0.4:${PORTA}`
// Os links do site para a clínica: o endereço só precisa ser reconhecível.
process.env.CLINICA_URL = 'https://app.bellarisos.test'
process.env.SITE_URL = process.env.E2E_SITE_URL

export default defineConfig({
  testDir: path.resolve(__dirname, 'e2e-site'),
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_SITE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/servir-build.mjs ${PORTA} site 127.0.0.4`,
    cwd: __dirname,
    url: process.env.E2E_SITE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
