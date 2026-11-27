import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A oportunidade é sempre da REDE (`docs/regras/crm-inbox.md`, "a oportunidade é sempre da rede"; OP-10 do
 * catálogo): a da "Nova oportunidade" nasce com `branch_id` nulo (`lib/crm/oportunidade.ts`), e o funil e o
 * painel comercial contam as da rede em qualquer recorte (`lib/metrics/painel-comercial.ts`). A aberta pela
 * conversa gravava a unidade da conversa: saía do funil das outras unidades e a Auditoria a dizia da unidade
 * (achado da área R na correção da 36ª simulação).
 */
describe('a oportunidade aberta pela conversa é da rede', () => {
  it('criarOportunidade grava branch_id nulo, não a unidade da conversa', () => {
    const s = readFileSync(path.join(__dirname, '..', 'actions', 'inbox.ts'), 'utf8')
    const i = s.indexOf('export async function criarOportunidade(')
    expect(i).toBeGreaterThanOrEqual(0)
    const corpo = s.slice(i, s.indexOf('\nexport ', i + 10))
    expect(corpo).not.toMatch(/branch_id:\s*c\.branch_id/)
    expect(corpo).toMatch(/branch_id:\s*null/)
  })
})
