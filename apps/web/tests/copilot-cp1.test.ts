import { describe, it, expect } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { ALL_PERMISSIONS } from '@/lib/permissions'
import { instrucoesDoCopilot } from '@/lib/copilot/prompt'
import { formaDePagamento, FORMA_LEGIVEL } from '@/lib/copilot/ferramentas/gestao-escrita'
import { indicadores, vendaParaOModelo } from '@/lib/copilot/ferramentas/indicadores'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * CP1 — o bloco Copilot do plano de adaptação (docs/revisao.md): cada
 * ferramenta conferida contra o sistema adaptado. Aqui, o que não precisa de
 * banco: o prompt de quem tem várias unidades, o boleto da despesa, a comanda
 * da venda e os nomes da revisão nas descrições.
 */

function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Ana (via Copilot)', roleLabel: 'Atendimento',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: ALL_PERMISSIONS as ResolvedPermissions, reportTabs: [], providesServices: false,
    isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: FUNCIONALIDADES.map(f => f.chave), limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  }
}
const prompt = (c: TenantContext, extras: Partial<Parameters<typeof instrucoesDoCopilot>[1]> = {}) =>
  instrucoesDoCopilot(c, { rede: 'Rede X', unidade: null, pagina: '/admin', slugDoPortal: null, ...extras })

describe('o prompt do Copilot', () => {
  it('quem tem várias unidades: o prompt diz TODAS as dela e em qual está (EQ1a)', () => {
    const p = prompt(ctx({ branchId: 'b1', unidades: ['b1', 'b2'] }), { unidade: 'Centro', unidades: ['Centro', 'Praia'], pagina: '/centro/agenda', slugDoPortal: 'centro' })
    expect(p).toContain('"Centro"')
    expect(p).toContain('"Praia"')
    expect(p).not.toContain('só alcança essa unidade')
  })

  it('quem tem uma unidade: só ela; quem é da rede: a rede inteira', () => {
    expect(prompt(ctx({ branchId: 'b1', unidades: ['b1'] }), { unidade: 'Centro' })).toContain('só alcança a unidade "Centro"')
    expect(prompt(ctx())).toContain('rede inteira')
  })

  it('fala de permissão, e indica o PDV para vender e receber', () => {
    const p = prompt(ctx())
    expect(p).not.toMatch(/cargo desta pessoa permite|o cargo dela não libera/)
    expect(p).toContain('PDV')
  })
})

describe('a forma de pagamento (marcar_pago e lancar)', () => {
  it('o boleto vale na DESPESA, como a baixa da tela (marcarPagoCore)', () => {
    expect(formaDePagamento('boleto', 'EXPENSE')).toBe('BOLETO')
    expect(formaDePagamento('BOLETO', 'EXPENSE')).toBe('BOLETO')
    expect(FORMA_LEGIVEL.BOLETO).toBe('boleto')
  })
  it('na receita, o boleto é recusado com o motivo', () => {
    expect(formaDePagamento('boleto', 'INCOME')).toEqual({ erro: expect.stringContaining('despesa') })
  })
  it('as de sempre continuam', () => {
    expect(formaDePagamento('Pix', 'INCOME')).toBe('PIX')
    expect(formaDePagamento('cartão de crédito', 'EXPENSE')).toBe('CREDIT_CARD')
  })
})

describe('as vendas (indicadores, aba vendas)', () => {
  it('cada venda leva o número da comanda do PDV', () => {
    const v = vendaParaOModelo({
      id: 'v1', tipo: 'PRODUTO', data: '2026-11-15T13:00:00Z', descricao: 'Sérum', quantidade: 2,
      clienteId: 'c1', cliente: 'Bia', profissional: 'Ana', branchId: 'b1', valor: 120, comanda: 12,
    })
    expect(v).toMatchObject({ comanda: 'Nº 12', tipo: 'Produto', cliente: 'Bia' })
  })
  it('a descrição usa os nomes da revisão: Oportunidades, produto e crédito interno', () => {
    expect(indicadores.descricao).toContain('Oportunidades')
    expect(indicadores.descricao).toMatch(/produto/i)
    expect(indicadores.descricao).toMatch(/crédito interno/i)
  })
})
