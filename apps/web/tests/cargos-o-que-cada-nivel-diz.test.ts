import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A matriz de Cargos diz o que cada nível dá de verdade (princípio 3).
 *
 * - O Financeiro em Ver dá o Fechamento do dia (FC-01: "Vê quem tem o PDV em
 *   Gerenciar ou o Financeiro em Ver"), e a linha dizia só "Vê faturamento,
 *   despesas, extrato de lançamentos e comissões." (A4 da 28ª: a pessoa com o
 *   Financeiro em Ver achou que não devia ver o Fechamento).
 * - A Agenda em Ver se escolhe sozinha (a pendência 12 da 27ª): o módulo aceita
 *   os três níveis, a tela não amarra a Agenda a outro módulo, a action grava o
 *   nível como veio e o cargo só com ela abre a Agenda.
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')

describe('o Financeiro em Ver diz o Fechamento do dia', () => {
  it('a linha do Ver cita o Fechamento do dia, só para ver', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.financial.VIEW).toMatch(/Fechamento do dia/)
    // Ver não fecha: fechar é de quem recebe (o PDV em Gerenciar).
    expect(LEVEL_COPY.financial.VIEW).toMatch(/fechar .*PDV|PDV.*fecha/i)
  })
})

describe('a Agenda em Ver, sozinha', () => {
  it('o módulo aceita o Ver', async () => {
    const { MODULE_LEVELS } = await import('@/lib/permissions')
    expect(MODULE_LEVELS.agenda).toContain('VIEW')
  })

  it('o cargo só com a Agenda em Ver abre a Agenda (não é "sem acesso")', async () => {
    const { modulosQueOCargoAbre, cargoSemAcesso } = await import('@/lib/cargos/sem-acesso')
    const cargo = { linhas: [{ module: 'agenda' as const, level: 'VIEW' as const }], abas: [] }
    expect(cargoSemAcesso(cargo, { foraDoPlano: [], abasForaDoPlano: [] })).toBe(false)
    expect(modulosQueOCargoAbre(cargo, { foraDoPlano: [], abasForaDoPlano: [] })).toContain('agenda')
  })

  it('nem a tela nem a action amarram a Agenda a outro módulo', () => {
    const acao = fonte('actions/permissions.ts')
    // A única recusa pelo que a matriz escolheu é o Relatórios sem aba (o resto é o cargo e o banco).
    expect(acao.match(/return \{ error: '[^']*'/g)?.filter(e => !/Cargo não|Cargos do sistema|Erro ao salvar|Marque ao menos uma aba/.test(e)) ?? []).toEqual([])
    expect(fonte('components/admin/roles-editor.tsx')).not.toMatch(/levels\.agenda\s*[!=]==/)
  })
})
