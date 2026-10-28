import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * D18 da simulação de 2026-10-28 (regressão parcial de f1e8414): o 404 do
 * `[...rota]` saía com HTTP 200 porque o `loading.tsx` do PORTAL (app/admin,
 * app/[slug]) envolve tudo o que está abaixo dele num Suspense, e com streaming
 * o status já foi antes do `notFound()` (docs do Next: file-conventions/loading,
 * "Status Codes"). Solução: o portal não tem `loading.tsx` no topo; cada seção
 * tem o seu — as telas seguem com o esqueleto, e o catch-all fica de fora.
 */
const app = path.join(__dirname, '..', 'app')
const portais = ['admin', '[slug]', path.join('[slug]', 'cliente')]

const temPagina = (dir: string): boolean =>
  fs.readdirSync(dir, { withFileTypes: true }).some(e =>
    (e.isFile() && /^page\.tsx$/.test(e.name)) || (e.isDirectory() && temPagina(path.join(dir, e.name))))

describe('o 404 do catch-all não pode ficar atrás de um loading.tsx', () => {
  for (const portal of portais) {
    const dir = path.join(app, portal)

    it(`${portal}: sem loading.tsx no topo (ele envolveria o [...rota] num Suspense)`, () => {
      expect(fs.existsSync(path.join(dir, 'loading.tsx')), `app/${portal}/loading.tsx faz o 404 sair com HTTP 200`).toBe(false)
    })

    it(`${portal}: cada seção com telas tem o seu loading.tsx (o esqueleto das telas continua)`, () => {
      const semLoading = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name !== '[...rota]' && !(portal === '[slug]' && e.name === 'cliente'))
        .map(e => e.name)
        .filter(n => temPagina(path.join(dir, n)) && !fs.existsSync(path.join(dir, n, 'loading.tsx')))
      expect(semLoading, `seções de app/${portal} sem loading.tsx`).toEqual([])
    })
  }
})
