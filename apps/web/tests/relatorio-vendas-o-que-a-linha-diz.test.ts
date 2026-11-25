import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { marcaDoCancelamento, quemDaVenda, colunasDoCsvDeVendas, type Venda } from '@/lib/metrics/vendas-comum'

/**
 * Relatórios → Vendas, o que cada linha diz (princípios 3 e 7):
 * - A10 da 28ª: o plano cancelado aparecia "Plano · 3 sessões R$ 300" (o valor
 *   certo, o que a rede ficou) sem dizer que foi cancelado. O pacote cancelado
 *   com valor que ficou, igual.
 * - Pendente 17 da 27ª (E7): a coluna "Profissional" é quem ATENDEU no avulso e
 *   quem VENDEU no resto; cada linha diz qual (o rótulo da linha no celular e a
 *   marca na tela).
 */
const venda = (extra: Partial<Venda>): Venda => ({
  id: 'v', tipo: 'PLANO', data: '2026-11-24T15:00:00Z', descricao: 'Plano', quantidade: 3, clienteId: 'c', cliente: 'Ágata',
  profissional: 'Laura', branchId: 'b', valor: 300, comanda: 12, ...extra,
})

describe('a linha da venda cancelada', () => {
  it('o plano e o pacote cancelados dizem que foram', () => {
    expect(marcaDoCancelamento(venda({ cancelada: true }))).toBe('Plano cancelado')
    expect(marcaDoCancelamento(venda({ tipo: 'PACOTE', cancelada: true }))).toBe('Pacote cancelado')
    expect(marcaDoCancelamento(venda({}))).toBeNull()
  })
  it('o CSV diz também, na descrição', () => {
    expect(colunasDoCsvDeVendas(venda({ cancelada: true }), { unidade: 'Centro' })[3]).toBe('Plano · 3 sessões (Plano cancelado)')
    expect(colunasDoCsvDeVendas(venda({}), { unidade: 'Centro' })[3]).toBe('Plano · 3 sessões')
  })
  it('a leitura marca os cancelados da página, e a tela mostra a marca', () => {
    const l = readFileSync(join(__dirname, '..', 'lib/metrics/vendas.ts'), 'utf8')
    expect(l).toContain("eq('status', 'CANCELLED')")
    expect(l).toContain("not('cancelado_em', 'is', null)")
    const t = readFileSync(join(__dirname, '..', 'components/admin/reports-bi-view.tsx'), 'utf8')
    expect(t).toMatch(/marcaDoCancelamento\(l\)/)
  })
})

describe('quem aparece na coluna Profissional', () => {
  it('no avulso, quem atendeu; no resto, quem vendeu', () => {
    expect(quemDaVenda('PROCEDIMENTO')).toBe('Quem atendeu')
    for (const t of ['PACOTE', 'PRE_PAGO', 'PLANO', 'PRODUTO'] as const) expect(quemDaVenda(t)).toBe('Quem vendeu')
  })
  it('a célula diz qual', () => {
    const t = readFileSync(join(__dirname, '..', 'components/admin/reports-bi-view.tsx'), 'utf8')
    expect(t).toMatch(/<td data-label=\{quemDaVenda\(l\.tipo\)\}/)
    expect(t).toContain('data-quem-da-venda')
  })
})
