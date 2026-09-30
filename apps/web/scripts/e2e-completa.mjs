#!/usr/bin/env node
/**
 * A suíte completa em duas metades (`e2e/grupos.ts`): os ISOLADOS em paralelo e
 * depois os COMPARTILHADOS, um por vez. Aqui, em sequência: juntas elas
 * poderiam rodar (a varredura só leva sobra de mais de uma hora, e é assim no
 * CI), mas quatro navegadores e o servidor ao mesmo tempo pesam demais para a
 * máquina de desenvolvimento. As duas rodam sempre
 * (a segunda não depende da primeira passar), e o código de saída é de falha
 * se qualquer uma falhar. Espera o build já feito (`next build`).
 *
 * Argumentos extras vão para as duas (ex.: `--reporter=list`).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extras = process.argv.slice(2)
let falhou = false
for (const grupo of ['isolados', 'compartilhados']) {
  console.log(`
=== E2E: ${grupo} ===
`)
  const r = spawnSync('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.build.config.ts', ...extras], {
    cwd: WEB, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, E2E_GRUPO: grupo },
  })
  if (r.status !== 0) falhou = true
}
process.exit(falhou ? 1 : 0)
