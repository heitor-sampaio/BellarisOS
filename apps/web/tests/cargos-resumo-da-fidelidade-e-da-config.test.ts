import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * plataforma:CG-16 e fidelidade:PG-05 (princípio 3: o que a tela mostra é o
 * que vale). A Fidelidade não é entrada de menu: aparece na ficha da cliente,
 * que pede Clientes em Ver — o resumo do cargo não dizia onde. E o texto de
 * Gerenciar mandava "Ligar o programa e definir as regras" a Configurações,
 * que desde 18/11 é só da Admin da rede (CLAUDE.md §11: "Configuração da rede
 * toda só pela conta admin"). As Fichas e os Cargos em Gerenciar não dão nada
 * a quem não é a Admin da rede: o resumo diz.
 */

const fonte = (f: string) => readFileSync(path.join(__dirname, '..', f), 'utf8')

describe('A13: a Fidelidade no cargo', () => {
  it('o Ver diz o que vê e onde; o Gerenciar diz a troca e o voucher, e que ligar é da Admin da rede', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.loyalty.VIEW).toMatch(/na ficha da cliente/)
    expect(LEVEL_COPY.loyalty.VIEW).toMatch(/vouchers/)
    expect(LEVEL_COPY.loyalty.MANAGE).not.toMatch(/é Configurações/)
    expect(LEVEL_COPY.loyalty.MANAGE).toMatch(/só da Admin da rede/)
    expect(LEVEL_COPY.loyalty.MANAGE).toMatch(/trocar pontos por recompensa/)
  })
  it('o resumo diz onde ela aparece, e o que falta sem Clientes', async () => {
    const { fidelidadeNoResumo } = await import('@/lib/permissions-copy')
    expect(fidelidadeNoResumo({ loyalty: 'NONE', clients: 'VIEW' })).toBeNull()
    expect(fidelidadeNoResumo({ loyalty: 'VIEW', clients: 'VIEW' }))
      .toBe('A Fidelidade não é entrada do menu: aparece na ficha da cliente (o saldo, o extrato e os vouchers).')
    expect(fidelidadeNoResumo({ loyalty: 'MANAGE', clients: 'MANAGE' }))
      .toBe('A Fidelidade não é entrada do menu: aparece na ficha da cliente (o saldo, o extrato e os vouchers) e no PDV, para trocar pontos por recompensa.')
    expect(fidelidadeNoResumo({ loyalty: 'VIEW', clients: 'NONE' }))
      .toBe('A Fidelidade não é entrada do menu: aparece na ficha da cliente, que pede Clientes em “Ver” — sem ele, a Fidelidade não aparece.')
  })
  it('o resumo do cargo mostra', () => {
    const f = fonte('components/admin/roles-editor.tsx')
    expect(f).toContain('fidelidadeNoResumo(levels)')
    expect(f).toContain('data-resumo-fidelidade')
  })
})

describe('A12: as Fichas e os Cargos são da Admin da rede', () => {
  it('o Gerenciar das Fichas diz que montar é só da Admin da rede', async () => {
    const { LEVEL_COPY } = await import('@/lib/permissions-copy')
    expect(LEVEL_COPY.forms.MANAGE).toMatch(/só da Admin da rede/)
    expect(LEVEL_COPY.forms.MANAGE).not.toMatch(/documento/i)
  })
  it('o resumo diz que a configuração da rede toda fica com a Admin da rede', async () => {
    const { configDaRedeNoResumo } = await import('@/lib/permissions-copy')
    expect(configDaRedeNoResumo({ forms: 'NONE', roles: 'NONE' })).toBeNull()
    expect(configDaRedeNoResumo({ forms: 'MANAGE', roles: 'MANAGE' }))
      .toBe('Fichas e Cargos são configuração da rede toda: só a Admin da rede os muda. A quem não é a Admin da rede, estas permissões não abrem nada.')
    expect(configDaRedeNoResumo({ forms: 'MANAGE' }))
      .toBe('Fichas é configuração da rede toda: só a Admin da rede a muda. A quem não é a Admin da rede, esta permissão não abre nada.')
    expect(configDaRedeNoResumo({ roles: 'MANAGE' }))
      .toBe('Cargos é configuração da rede toda: só a Admin da rede a muda. A quem não é a Admin da rede, esta permissão não abre nada.')
  })
  it('o resumo do cargo mostra', () => {
    const f = fonte('components/admin/roles-editor.tsx')
    expect(f).toContain('configDaRedeNoResumo(levels)')
    expect(f).toContain('data-resumo-config-da-rede')
  })
})
