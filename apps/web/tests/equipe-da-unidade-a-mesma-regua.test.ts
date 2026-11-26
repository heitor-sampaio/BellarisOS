import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A29 da 32ª simulação (2026-11-26; princípio 3): na página de Cascavel,
 * "0 membros ativos" (contava só quem tem Cascavel como PRINCIPAL — a Ivanete
 * a tem nas "outras unidades") e, no cartão da unidade, "1 pessoa atende
 * aqui". E a Equipe de Cascavel punha o chip "Atende" na Ivanete, que atende
 * só em Passo Fundo (o chip lia `provides_services`, "atende em alguma"). As
 * duas contas pela mesma régua: quem é da unidade (a principal ou uma das
 * outras) e quem atende NELA (`atende_em`).
 */
const fonte = (f: string) => readFileSync(path.join(__dirname, '..', f), 'utf8')

describe('A29: quem é da unidade e quem atende nela', () => {
  it('a página da unidade conta quem a tem entre as unidades dela, e diz quem atende nela', () => {
    const f = fonte('app/admin/branches/[id]/page.tsx')
    expect(f).toMatch(/branch_id\.eq\.\$\{id\},outras_unidades\.cs\.\{\$\{id\}\}/)
    expect(f).toMatch(/atende_em/)
    expect(f).toMatch(/data-quem-atende-na-unidade/)
    expect(f).not.toMatch(/users\(id, name, is_active\)/)
  })

  it('o chip "Atende" da Equipe da unidade é de quem atende NELA', () => {
    const f = fonte('app/[slug]/team/page.tsx')
    expect(f).toMatch(/atende: \(m\.atende_em \?\? \[\]\)\.includes\(branchId\)/)
    expect(f).not.toMatch(/atende: !!m\.provides_services/)
  })
})
