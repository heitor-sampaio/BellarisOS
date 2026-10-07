import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Todo export de um arquivo `'use server'` é endpoint público: quem tem o id
 * chama com os argumentos que quiser. Função que recebe a REDE por parâmetro
 * ali dentro serve a rede alheia a qualquer pessoa logada (CLAUDE.md §14 — era
 * o `dispatchCampaignInline`; em 2026-10-06, `seedDefaultFunnel`,
 * `listStages` e `listAllStages`). O lugar delas é `lib/`, que não vira
 * endpoint.
 */
const RAIZ = path.resolve(__dirname, '..')

function arquivosUseServer(dir: string, achados: string[] = []): string[] {
  for (const nome of fs.readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const cheio = path.join(dir, nome)
    if (fs.statSync(cheio).isDirectory()) arquivosUseServer(cheio, achados)
    else if (/\.tsx?$/.test(nome) && /^\s*['"]use server['"]/.test(fs.readFileSync(cheio, 'utf8'))) achados.push(cheio)
  }
  return achados
}

describe("export de 'use server' não recebe a rede por parâmetro", () => {
  it('nenhuma action exportada começa por tenantId', () => {
    const culpados: string[] = []
    for (const dir of ['actions', 'app']) {
      for (const f of arquivosUseServer(path.join(RAIZ, dir))) {
        const texto = fs.readFileSync(f, 'utf8')
        for (const m of texto.matchAll(/export\s+async\s+function\s+(\w+)\s*\(\s*(tenantId|p_tenant|tenant)\s*[:,)]/g)) {
          culpados.push(`${path.relative(RAIZ, f).split(path.sep).join('/')}#${m[1]}`)
        }
      }
    }
    expect(culpados).toEqual([])
  })
})
