import { defineConfig } from '@playwright/test'
import build from './playwright.build.config'

/**
 * A CÂMERA do site (2026-10-17): o spec de `e2e-capturas/` fotografa as telas
 * reais que bellarisos.com mostra, contra o build da clínica com os
 * provedores falsos (a OpenAI falsa responde pelo Copilot). Não faz parte da
 * suíte: roda à mão quando uma tela do site mudou.
 *
 *   npx playwright test -c playwright.capturas.config.ts
 */
export default defineConfig({
  ...build,
  testDir: './e2e-capturas',
  testMatch: undefined,
  testIgnore: undefined,
  timeout: 300_000,
  workers: 1,
})
