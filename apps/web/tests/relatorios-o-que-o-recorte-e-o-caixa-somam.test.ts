import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Relatórios: a tela diz o que cada número soma (princípio 3).
 *
 * A10 da 33ª: o recorte por unidade da aba Comercial mudava a tela sem mudar as
 * oportunidades — elas são da rede (`leads.branch_id` nulo; a cliente é da
 * rede, CL-18), e só os agendamentos do comercial respeitam o recorte
 * (`painelComercial`). Com uma unidade escolhida, a aba diz isso — o recorte
 * segue, porque recorta os agendamentos (decisão do Claude no relatório da 33ª).
 *
 * A11 da 33ª: o cartão "Despesas pagas (caixa)" dizia R$ 367 e o DRE logo
 * abaixo "Despesas operacionais R$ 0" — as comissões pagas estão no cartão e
 * vão ao DRE em linha própria (as lançadas). O DRE mostra de que se compõe o
 * cartão, com os números de lib/metrics, quando ele tem mais que a despesa
 * operacional. O nome do cartão não muda (é travado por vários E2E).
 */

const WEB = join(__dirname, '..')
const tela = readFileSync(join(WEB, 'components/admin/reports-bi-view.tsx'), 'utf8').replace(/\r/g, '')
const corpoDe = (nome: string) => {
  const i = tela.indexOf(`function ${nome}(`)
  expect(i, nome).toBeGreaterThanOrEqual(0)
  const resto = tela.slice(i + 10)
  const fim = resto.search(/\nfunction |\nexport function /)
  return fim < 0 ? resto : resto.slice(0, fim)
}

describe('A10: as oportunidades são da rede, e a aba Comercial diz isso no recorte por unidade', () => {
  const comercial = corpoDe('TabComercial')
  it('com uma unidade escolhida numa rede de mais de uma, a nota; na rede inteira (ou na rede de uma unidade), nada', () => {
    expect(comercial).toMatch(/p\.selectedBranchId && \(p\.allBranches \?\? p\.branches\)\.length > 1 && \(/)
    expect(comercial).toMatch(/data-oportunidades-da-rede/)
    expect(comercial).toMatch(/As oportunidades são da rede: o recorte por unidade não vale para elas\./)
    expect(comercial).toMatch(/agendamentos do comercial/)
  })
})

describe('A11: o DRE diz de que se compõe o caixa das despesas', () => {
  const financeiro = corpoDe('TabFinanceiro')
  it('as três partes, com os números de lib/metrics (nenhuma conta na tela)', () => {
    expect(financeiro).toMatch(/data-despesas-do-cartao/)
    expect(financeiro).toMatch(/resultado\.despesaOperacional/)
    expect(financeiro).toMatch(/p\.estoqueNoResultado\.atual\.despesaDeComissoes/)
    expect(financeiro).toMatch(/p\.estoqueNoResultado\.atual\.compraDeEstoque/)
    expect(financeiro).toMatch(/do pagamento das comissões/)
  })
  it('só aparece quando o caixa tem mais que a despesa operacional', () => {
    expect(financeiro).toMatch(/opEx !== resultado\.despesaOperacional &&/)
  })
})
