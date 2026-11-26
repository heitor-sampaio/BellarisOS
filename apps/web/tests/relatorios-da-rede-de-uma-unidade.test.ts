import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D5 da 34ª simulação (UU-01; D-19, o Heitor, 2026-10-29: "Com UMA unidade
 * ativa, somem os termos e gráficos de rede ... O modelo não muda: tudo volta
 * quando nascer a segunda unidade."): numa rede de uma unidade, os Relatórios
 * mostravam "Faturamento por Unidade — Período Atual/Anterior" (aba Financeiro)
 * e "Comparativo por Unidade" (aba Agenda); e a página da UNIDADE não passava
 * `umaUnidade`, então nem o "Saúde do Estoque por Unidade" sumia ali.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

/** O trecho de JSX de um <SCard title="…"> e as 200 letras antes dele (onde mora a condição). */
function antesDoCartao(t: string, titulo: string): string {
  const i = t.indexOf(`title="${titulo}"`)
  expect(i, `o cartão "${titulo}" existe`).toBeGreaterThan(0)
  return t.slice(Math.max(0, i - 200), i)
}

describe('os Relatórios da rede de uma unidade', () => {
  const view = fonte('components/admin/reports-bi-view.tsx')

  for (const titulo of [
    'Faturamento por Unidade — Período Atual',
    'Faturamento por Unidade — Período Anterior',
    'Comparativo por Unidade',
  ]) {
    it(`"${titulo}" some com uma unidade`, () => {
      expect(antesDoCartao(view, titulo)).toMatch(/!p\.umaUnidade/)
    })
  }

  it('a página da unidade diz se a rede tem uma unidade (a régua de lib/unidades/uma-so)', () => {
    const pagina = fonte('app/[slug]/reports/page.tsx')
    expect(pagina).toMatch(/redeTemUmaUnidade\(ctx\.tenantId!?\)/)
    expect(pagina).toMatch(/umaUnidade=\{umaUnidade\}/)
  })
})
