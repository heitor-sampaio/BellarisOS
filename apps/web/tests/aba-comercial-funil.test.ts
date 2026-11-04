import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { REPORT_TAB_LABELS } from '@/lib/permissions'

// A9 da 6ª simulação: a aba "Comercial" dos Relatórios é o FUNIL, e o nome não dizia.
describe('a aba do funil se chama "Funil comercial"', () => {
  it('no cargo e na tela de Relatórios, o mesmo nome', () => {
    expect(REPORT_TAB_LABELS.comercial).toBe('Funil comercial')
    const tela = fs.readFileSync(path.join(__dirname, '..', 'components', 'admin', 'reports-bi-view.tsx'), 'utf8')
    expect(tela).toMatch(/key: 'comercial',\s*label: REPORT_TAB_LABELS\.comercial/)
  })
})
