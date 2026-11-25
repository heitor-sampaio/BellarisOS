import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { abaTemFiltroDeTags, tagsDaAba } from '@/lib/metrics/tags-do-relatorio'

/**
 * A Visão geral e a aba Financeiro dos Relatórios ganham o filtro de Tags
 * (Q05 do catálogo dos Indicadores, revisão de 24/11: "a Visão geral e a aba
 * Financeiro dos Relatórios têm filtros, então ganham o de Tags. Defeito a
 * corrigir"). A régua é a das outras abas (TF-02): a linha entra pela cliente
 * dela; a sem cliente (a despesa, a compra de estoque, as perdas) sai enquanto
 * houver tag — e o lucro, a margem, o DRE e o gráfico seguem as mesmas linhas
 * (princípio 3: o que a tela mostra é o que vale na conta).
 */
const raiz = path.join(__dirname, '..')
const ler = (...p: string[]) => readFileSync(path.join(raiz, ...p), 'utf8')
const migrations = path.join(raiz, '..', '..', 'supabase', 'migrations')

describe('o filtro de Tags na Visão geral e no Financeiro', () => {
  it('as duas abas têm o filtro; o Estoque continua sem (não há pessoa)', () => {
    expect(abaTemFiltroDeTags('overview')).toBe(true)
    expect(abaTemFiltroDeTags('financeiro')).toBe(true)
    expect(abaTemFiltroDeTags('estoque')).toBe(false)
    expect(tagsDaAba('financeiro', ['VIP'])).toEqual(['VIP'])
  })

  const arquivo = readdirSync(migrations).find(f => /^202612034\d{5}_relatorios_tags_na_visao_geral_e_no_financeiro\.sql$/.test(f))
  const sql = arquivo ? readFileSync(path.join(migrations, arquivo), 'utf8') : ''
  it('a migration existe, na faixa R, e recarrega o esquema', () => {
    expect(arquivo).toBeTruthy()
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
  for (const f of ['metrics_series', 'metrics_resultado', 'metrics_series_do_resultado', 'metrics_custos_da_venda', 'metrics_series_dos_custos_da_venda']) {
    it(`${f} ganha p_tags (a assinatura nova só com o service_role)`, () => {
      expect(sql).toMatch(new RegExp(`select pg_temp\\.com_tags\\(\\s*'public\\.${f}\\(`))
    })
  }
  it('a receita por unidade, por forma e por categoria do metrics_relatorio seguem a tag', () => {
    expect(sql).toMatch(/pg_temp\.trocar_no_corpo\(\s*'public\.metrics_relatorio\(/)
    expect((sql.match(/metrics_cliente_tem_as_tags\(client_id, p_tags\)/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('os wrappers levam as tags, e a seção as manda à evolução, ao lucro e ao status do período', () => {
    const q = ler('lib/metrics/queries.ts')
    for (const fn of ['getSeries', 'getResultadoDoEstoque', 'getSeriesDoResultado']) {
      const ini = q.indexOf(`export async function ${fn}(`)
      expect(q.slice(ini, q.indexOf('\n}\n', ini)), fn).toMatch(/paramDeTags\(args\.tags\)/)
    }
    const s = ler('components/admin/reports-bi-section.tsx')
    expect(s).toMatch(/getSeries\(\{[^}]*tags/)
    expect(s).toMatch(/getSeriesDoResultado\(\{[^}]*tags/)
    expect((s.match(/getResultadoDoEstoque\(\{[^}]*tags/g) ?? []).length).toBe(2)
    expect(s).toMatch(/from: startDate, to: periodInfo\.fullTo, recorte, tags \}\)/)
  })

  it('com tag, o que não tem cliente sai: as parcelas pela cliente, as compras e as perdas fora', () => {
    const s = ler('components/admin/reports-bi-section.tsx')
    expect(s).toMatch(/comAsTags\(/)
    expect(s).toMatch(/semPessoa/)
  })

  it('a dica do filtro não diz mais que a Visão geral e o Financeiro ficam de fora', () => {
    const tela = ler('components/admin/reports-bi-view.tsx')
    expect(tela).not.toMatch(/Visão geral, '\s*\+ 'Financeiro e Estoque não têm este filtro/)
    expect(tela).toMatch(/a despesa, a compra de estoque e as perdas/)
  })
})
