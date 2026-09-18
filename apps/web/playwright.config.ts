import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import dotenv from 'dotenv'

// O Playwright não passa pelo carregamento de env do Next: o `.env.local` é
// lido aqui, e é de lá que saem a URL do Supabase e as chaves usadas para
// autenticar a suíte. Nada de credencial no repositório.
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

export const ARQUIVO_DE_SESSAO = path.resolve(__dirname, 'e2e/.auth/admin.json')

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: path.resolve(__dirname, 'e2e'),
  // Um worker só: a suíte mexe em caixa, estoque e agenda do banco de
  // desenvolvimento, e dois testes disputando o mesmo caixa aberto dariam
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
    command: 'pnpm dev',
    cwd: __dirname,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
