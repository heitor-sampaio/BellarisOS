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
 * A limpeza cerca a rodada (F25, 2026-11-05 — a da completa travava o
 * Supabase no meio dela): a varredura das sobras UMA vez, antes; as duas
 * metades só ANOTAM as redes de teste (`E2E_LIMPEZA_ADIADA=1`); e o fim apaga
 * as anotadas — sempre, até com falha (`playwright.limpeza.config.ts`).
 *
 * Argumentos extras vão para as duas (ex.: `--reporter=list`).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extras = process.argv.slice(2)
const env = { ...process.env, E2E_LIMPEZA_ADIADA: '1', E2E_VARREDURA_FEITA: '1' }
const playwright = (args, envDoPasso) => spawnSync('pnpm', ['exec', 'playwright', 'test', ...args], {
  cwd: WEB, stdio: 'inherit', shell: process.platform === 'win32', env: envDoPasso,
})

console.log('\n=== E2E: varredura das sobras ===\n')
playwright(['-c', 'playwright.limpeza.config.ts', '-g', 'varredura'], env)

let falhou = false
for (const grupo of ['isolados', 'compartilhados']) {
  console.log(`
=== E2E: ${grupo} ===
`)
  const r = playwright(['-c', 'playwright.build.config.ts', ...extras], { ...env, E2E_GRUPO: grupo })
  if (r.status !== 0) falhou = true
}

console.log('\n=== E2E: a limpeza do fim (as redes adiadas) ===\n')
playwright(['-c', 'playwright.limpeza.config.ts', '-g', 'adiadas'], env)
process.exit(falhou ? 1 : 0)
