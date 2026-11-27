import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UU-01 (D-19, o Heitor, 2026-10-29: "Com UMA unidade ativa, somem os termos e
 * gráficos de rede ... e o seletor de unidade. O modelo não muda: tudo volta
 * quando nascer a segunda unidade."); Decisão E1 da 37ª (decisão do Claude,
 * 27/11): some o que só é recorte por unidade, e fica o que é dado.
 *
 * - O "Hoje" do dashboard da rede com uma unidade (ou recortado a uma) mostrava
 *   a linha da unidade, com o nome e o MESMO total do cabeçalho: fica a conta
 *   do dia (agendados, confirmados, em atendimento, concluídos), sem a linha.
 * - O Financeiro da rede de uma unidade dizia "Novembro · 1 unidade" — o
 *   dashboard já não diz "N unidades" com uma (UU-01).
 * - O mapa: "Consolidado" não é a rede consolidada, é a soma das duas camadas
 *   (Concentração e LTV); o nome diz isso, para não se ler como o seletor de
 *   unidade (princípio 7: o nome certo).
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('a rede de uma unidade: o que só é recorte por unidade some', () => {
  it('o "Hoje" do dashboard da rede lista as unidades só com mais de uma', () => {
    const view = fonte('components/admin/admin-dashboard-view.tsx')
    const i = view.indexOf('[...todayByBranch]')
    expect(i, 'a lista por unidade do "Hoje" existe').toBeGreaterThan(0)
    const vazio = view.indexOf('Nenhum agendamento para hoje')
    expect(vazio, 'o vazio do "Hoje" vem antes da lista').toBeGreaterThan(0)
    expect(view.slice(vazio, i)).toMatch(/\) : umaUnidade \? \(/)
    // Com uma, a conta do dia fica (é dado): os status vêm no próprio cartão.
    expect(view).toMatch(/data-hoje-da-unidade-unica/)
  })

  it('o Financeiro da rede de uma unidade não diz "1 unidade"', () => {
    const view = fonte('components/admin/admin-financial-view.tsx')
    // O "N unidades" do subtítulo só com mais de uma (o título já é "Financeiro").
    expect(view).toMatch(/umaUnidade \? '' : ` · \$\{branchStats\.length\} \$\{branchStats\.length === 1 \? 'unidade' : 'unidades'\}`/)
  })

  it('o mapa não chama de "Consolidado" a soma das duas camadas', () => {
    const mapa = fonte('components/admin/hotmap-section.tsx')
    expect(mapa).not.toMatch(/label: 'Consolidado'/)
    expect(mapa).toMatch(/label: 'Concentração e LTV'/)
  })
})
