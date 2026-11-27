import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A9 da 35ª simulação (princípio 3; decisão do Claude, 27/11): em Cargos, "O que
 * essa pessoa vai ver" de um cargo com só a aba Oportunidades dos Relatórios
 * dizia "Dashboard · Relatórios" — como se abrisse todos. O resumo diz quais
 * abas, como já diz quais abas das Configurações.
 */
describe('A9: o resumo do cargo diz as abas dos Relatórios', () => {
  it('todas as abas: só "Relatórios"', async () => {
    const { rotuloDosRelatorios } = await import('@/lib/cargos/relatorios-no-resumo')
    const { ALL_REPORT_TABS } = await import('@/lib/permissions')
    expect(rotuloDosRelatorios(ALL_REPORT_TABS)).toBe('Relatórios')
  })
  it('uma aba: "Relatórios (só Oportunidades)"', async () => {
    const { rotuloDosRelatorios } = await import('@/lib/cargos/relatorios-no-resumo')
    expect(rotuloDosRelatorios(['comercial'])).toBe('Relatórios (só Oportunidades)')
  })
  it('algumas: na ordem da tela, com "e"', async () => {
    const { rotuloDosRelatorios } = await import('@/lib/cargos/relatorios-no-resumo')
    expect(rotuloDosRelatorios(['comercial', 'agenda'])).toBe('Relatórios (só Agenda e Oportunidades)')
  })
  it('quase todas: diz a que falta', async () => {
    const { rotuloDosRelatorios } = await import('@/lib/cargos/relatorios-no-resumo')
    const { ALL_REPORT_TABS } = await import('@/lib/permissions')
    expect(rotuloDosRelatorios(ALL_REPORT_TABS.filter(t => t !== 'financeiro'))).toBe('Relatórios (sem Financeiro)')
  })
  it('a prévia da tela de Cargos usa o rótulo', () => {
    const tela = readFileSync(join(__dirname, '..', 'components', 'admin', 'roles-editor.tsx'), 'utf8')
    expect(tela).toMatch(/rotuloDosRelatorios\(reportTabs\)/)
  })
})
