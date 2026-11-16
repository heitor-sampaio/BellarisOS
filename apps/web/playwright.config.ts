import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import dotenv from 'dotenv'

// O Playwright não passa pelo carregamento de env do Next: o `.env.local` é
// lido aqui, e é de lá que saem a URL do Supabase e as chaves usadas para
// autenticar a suíte. Nada de credencial no repositório.
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

// Com `scripts/com-banco-local.mjs`, o ambiente já chega com o Supabase LOCAL
// (e a porta 3010): o `.env.local` não sobrescreve o que está no processo.

// Um arquivo por metade da suíte (`E2E_GRUPO`): as duas rodam juntas no CI, e
// cada global-setup grava a sua sessão — no mesmo arquivo, uma leria o JSON
// pela metade enquanto a outra escrevia.
export const ARQUIVO_DE_SESSAO = path.resolve(__dirname,
  `e2e/.auth/admin${process.env.E2E_GRUPO ? `-${process.env.E2E_GRUPO}` : ''}.json`)

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: path.resolve(__dirname, 'e2e'),
  // Um worker só: a suíte mexe em financeiro, estoque e agenda do banco de
  // desenvolvimento, e dois testes disputando o mesmo registro dariam
  // falha intermitente que não é do produto.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: path.resolve(__dirname, 'e2e/global-setup.ts'),

  use: {
    baseURL: BASE_URL,
    storageState: ARQUIVO_DE_SESSAO,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    // A porta da BASE_URL: o banco local usa a 3010, e um `next dev` na 3000
    // contra a nuvem não pode ser o reaproveitado.
    command: `pnpm dev --port ${new URL(BASE_URL).port || '3000'}`,
    cwd: __dirname,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
