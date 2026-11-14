import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { REPORT_TAB_LABELS, REPORT_TAB_HINTS } from '@/lib/permissions'

// A9 da 6ª simulação: a aba "Comercial" dos Relatórios é o FUNIL, e o nome não dizia.
// RL2 (a revisão do Heitor, 2026-11-13, com o CR1): ela se chama "Oportunidades".
// A chave (`comercial`, no banco e na URL) fica: só o rótulo muda.
describe('a aba do funil se chama "Oportunidades"', () => {
  it('no cargo e na tela de Relatórios, o mesmo nome', () => {
    expect(REPORT_TAB_LABELS.comercial).toBe('Oportunidades')
    expect(REPORT_TAB_HINTS.comercial).not.toMatch(/leads?/i)
    const tela = fs.readFileSync(path.join(__dirname, '..', 'components', 'admin', 'reports-bi-view.tsx'), 'utf8')
    expect(tela).toMatch(/key: 'comercial',\s*label: REPORT_TAB_LABELS\.comercial/)
  })
})
