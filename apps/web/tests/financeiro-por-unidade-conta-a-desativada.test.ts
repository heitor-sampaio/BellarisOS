import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O "Por unidade" do Financeiro da rede lista as unidades de LEITURA
 * (`unidadesParaLer`), como o dashboard (UN-13; `docs/regras/plataforma.md`, "a
 * unidade desativada continua contada e alcançável", e C45 em
 * `indicadores.md`: "o recorte de uma unidade, as listas e os filtros de
 * LEITURA também a alcançam enquanto ela tiver o que ficou"). Na 33ª simulação
 * a Cachoeira, desativada com a agenda futura da E07 e nenhum lançamento,
 * contava no dashboard (6 unidades) e sumia do Financeiro (5): o "Por
 * unidade" só deixava entrar a desativada com dinheiro no período — a regra
 * de 2026-10-20, de antes da F72. Decisão do Claude, 26/11 (o arremate da 33ª).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o "Por unidade" do Financeiro da rede', () => {
  it('a desativada que a tela lê (o que ficou, ou movimento no período) entra, com o dinheiro ou sem', () => {
    const s = fonte('app/admin/financeiro/page.tsx')
    expect(s).toMatch(/const lidas = new Set\(branchIds\)/)
    expect(s).toMatch(/branchMetrics\.filter\(b => b\.isActive \|\| lidas\.has\(b\.branchId\) \|\|/)
  })
})
