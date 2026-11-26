import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { categoryAxisWidth, rotuloQueCabe } from '@/lib/chart-utils'

/**
 * A22 da 34ª simulação (docs/regras/design.md): no gráfico de barras dos
 * Relatórios (Estoque → "Top 10 Produtos Mais Consumidos"), o nome longo
 * passava da largura do eixo (no máximo 150 px) e o Recharts o quebrava em
 * linhas que se encavalavam ("Ponteira demicroagulhamento"). O nome fica numa
 * linha só, cortado com reticências quando não cabe, e inteiro ao passar o
 * mouse (o <title> do rótulo e a dica do gráfico).
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('o rótulo do eixo de categorias numa linha só', () => {
  it('o que cabe fica como está', () => {
    expect(rotuloQueCabe('Sérum', 150)).toBe('Sérum')
  })
  it('o que não cabe é cortado com reticências, sem passar da largura', () => {
    const nome = 'Ponteira de microagulhamento 0,5 mm'
    const largura = categoryAxisWidth([nome], { fontPx: 11 })
    const r = rotuloQueCabe(nome, largura)
    expect(r.endsWith('…')).toBe(true)
    expect(nome.startsWith(r.slice(0, -1))).toBe(true)
    expect(categoryAxisWidth([r], { fontPx: 11 })).toBeLessThanOrEqual(largura)
  })
  it('o gráfico de barras desenha o rótulo pela régua, com o nome inteiro no <title>', () => {
    const f = fonte('components/admin/reports-charts.tsx')
    expect(f).toMatch(/rotuloQueCabe\(/)
    expect(f).toMatch(/<title>\{nome\}<\/title>/)
  })
})
