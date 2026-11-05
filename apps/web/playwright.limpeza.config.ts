import { defineConfig } from '@playwright/test'
import path from 'node:path'
import dotenv from 'dotenv'

/**
 * A limpeza da COMPLETA, fora das duas metades (F25, 2026-11-05).
 *
 * Não é teste: são os dois passos que cercam a rodada, rodados pelo
 * Playwright só porque é ele que já carrega o TypeScript do apoio.
 *
 *   -g varredura      ANTES: as sobras de rodadas anteriores (o `[e2e]` com
 *                     mais de uma hora, `varrerSobras`). Uma vez só — as duas
 *                     metades pulam a delas (`E2E_VARREDURA_FEITA=1`).
 *   -g adiadas        DEPOIS (sempre, até com falha): as redes de teste que
 *                     a rodada anotou (`E2E_LIMPEZA_ADIADA=1`), uma de cada
 *                     vez, numa passada no servidor cada.
 *
 * Sem servidor, sem sessão, sem global-setup: só o banco.
 * `.github/workflows/e2e.yml` e `scripts/e2e-completa.mjs` chamam.
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

export default defineConfig({
  testDir: path.resolve(__dirname, 'e2e-limpeza'),
  workers: 1,
  fullyParallel: false,
  // A rodada inteira anota ~400 redes; uma de cada vez, com pausa, leva minutos.
  timeout: 45 * 60_000,
  reporter: [['list']],
  outputDir: 'test-results/limpeza',
})
