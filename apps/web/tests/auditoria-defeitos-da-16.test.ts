import { describe, it, expect } from 'vitest'
import { gruposDaAuditoria } from '@/lib/auditoria/frase'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * D6/D7 da 16ª simulação: a gravação agrupada se lê pelo FATO (concluiu,
 * recebeu, vendeu o pacote) e leva a unidade dele. As gravações abaixo são as
 * da simulação (as linhas como o gatilho as guardou), da mais nova à mais
 * antiga, como a leitura as entrega.
 */

const sp = (s: string) => s.replace(/ /g, ' ')

let id = 5000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-16T14:12:09.123Z', branch_id: null, client_id: null, tabela: 'tags', operacao: 'criou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Caio', ator_tipo: 'membro',
  incompleto: false, ...x,
})

const nomes: NomesDaAuditoria = {
  clientes: { cB: 'Bárbara Lima', cR: 'Rita Moura', cP: 'Paula Neves', cI: 'Íris Costa' },
  membros: {}, unidades: { bM: 'Moinhos', bD: 'Menino Deus' },
  produtos: { p1: 'Hidratante' },
  pacotes: { pk1: '5 radiofrequências' },
  lancamentos: { ftParcela: { tipo: 'INCOME', valor: 200, forma: 'PIX', parcela: 1, de: 4 } },
}
const grupos = (rs: RegistroDaAuditoria[]) => gruposDaAuditoria(rs, nomes, '/admin/auditoria', null)

describe('D6 da 16ª: a unidade da gravação é a do fato', () => {
  it('a conclusão do atendimento em Moinhos, com a sessão do pacote vendido em Menino Deus, é de Moinhos', () => {
    const g = grupos([
      r({ tabela: 'commissions', branch_id: 'bM', depois: { amount: 132, type: 'PERCENTAGE' } }),
      r({ tabela: 'client_packages', operacao: 'editou', branch_id: 'bD', client_id: 'cB', colunas: ['used_sessions'] }),
      r({ tabela: 'package_sessions', operacao: 'editou', branch_id: 'bD', client_id: 'cB', colunas: ['appointment_id'] }),
      r({ tabela: 'stock_movements', branch_id: 'bM', depois: { type: 'PROCEDURE_USAGE', quantity: -1, product_id: 'p1' } }),
      r({ tabela: 'medical_record_entries', branch_id: 'bM', client_id: 'cB' }),
      r({ tabela: 'appointments', operacao: 'editou', branch_id: 'bM', client_id: 'cB', registro_id: 'ag1',
        colunas: ['aconteceu_em', 'completed_at', 'status'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'COMPLETED' } }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0]!.unidade).toBe('Moinhos')
    expect(g[0]!.href).toContain('ag1')
    expect(sp(g[0]!.oQue)).toBe('Concluiu o atendimento — Bárbara Lima')
  })

  it('o início do atendimento (a comanda aberta junto) é o atendimento', () => {
    const g = grupos([
      r({ tabela: 'comandas', branch_id: 'bM', client_id: 'cB', depois: { status: 'ABERTA' } }),
      r({ tabela: 'appointments', operacao: 'editou', branch_id: 'bM', client_id: 'cB', registro_id: 'ag1',
        colunas: ['started_at', 'status'], antes: { status: 'ARRIVED' }, depois: { status: 'IN_PROGRESS' } }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Iniciou o atendimento — Bárbara Lima')
  })
})

describe('D7 da 16ª: o recebimento e a venda têm frase própria', () => {
  it('o recebimento da comanda (a comissão e os pontos gravados junto) é "Recebeu"', () => {
    const g = grupos([
      r({ tabela: 'financial_transactions', branch_id: 'bM', client_id: 'cR',
        depois: { type: 'INCOME', amount: 1600, payment_method: 'PIX', paid_at: '2026-11-16T14:25:20Z', category: 'Serviços' } }),
      r({ tabela: 'loyalty_transactions', branch_id: 'bM', client_id: 'cR' }),
      r({ tabela: 'commissions', branch_id: 'bM', depois: { amount: 480, type: 'PERCENTAGE' } }),
    ])
    expect(g).toHaveLength(1)
    expect(sp(g[0]!.oQue)).toBe('Recebeu R$ 1.600,00 (Pix) — Rita Moura')
    expect(g[0]!.unidade).toBe('Moinhos')
  })

  it('a comanda com o atendimento e um produto: o total recebido e o produto', () => {
    const g = grupos([
      r({ tabela: 'comanda_itens', operacao: 'editou', branch_id: 'bM', colunas: ['product_sale_id'] }),
      r({ tabela: 'financial_transactions', operacao: 'editou', branch_id: 'bM', client_id: 'cP', registro_id: 'ftP',
        colunas: ['is_paid', 'paid_at', 'recebido_por'], antes: { paid_at: null }, depois: { paid_at: '2026-11-16T14:25:53Z' } }),
      r({ tabela: 'financial_transactions', branch_id: 'bM', client_id: 'cP', registro_id: 'ftP',
        depois: { type: 'INCOME', amount: 89, payment_method: 'DEBIT_CARD', paid_at: null, category: 'Venda de produto' } }),
      r({ tabela: 'product_sales', operacao: 'editou', branch_id: 'bM', client_id: 'cP', colunas: ['custo'] }),
      r({ tabela: 'product_sales', operacao: 'editou', branch_id: 'bM', client_id: 'cP', colunas: ['stock_movement_id'] }),
      r({ tabela: 'product_sale_items', branch_id: 'bM' }),
      r({ tabela: 'stock_movements', branch_id: 'bM', depois: { type: 'SALE', quantity: -1, product_id: 'p1' } }),
      r({ tabela: 'product_sales', branch_id: 'bM', client_id: 'cP', depois: { price: 89, quantity: 1 } }),
      r({ tabela: 'financial_transactions', branch_id: 'bM', client_id: 'cP',
        depois: { type: 'INCOME', amount: 320, payment_method: 'DEBIT_CARD', paid_at: '2026-11-16T14:25:53Z', category: 'Serviços' } }),
      r({ tabela: 'loyalty_transactions', branch_id: 'bM', client_id: 'cP' }),
      r({ tabela: 'commissions', branch_id: 'bM', depois: { amount: 96 } }),
    ])
    expect(g).toHaveLength(1)
    expect(sp(g[0]!.oQue)).toBe('Recebeu R$ 409,00 (Débito), com 1 Hidratante — Paula Neves')
  })

  it('a venda de produto com o voucher: o que vendeu e o que recebeu (o valor depois do desconto)', () => {
    const g = grupos([
      r({ tabela: 'loyalty_vouchers', operacao: 'editou', client_id: 'cR', colunas: ['used_at'] }),
      r({ tabela: 'financial_transactions', operacao: 'editou', branch_id: 'bM', client_id: 'cR', registro_id: 'ftV',
        colunas: ['amount', 'is_paid', 'loyalty_discount', 'paid_at', 'recebido_por'],
        antes: { amount: 89, paid_at: null }, depois: { amount: 39, paid_at: '2026-11-16T14:28:09Z' } }),
      r({ tabela: 'financial_transactions', branch_id: 'bM', client_id: 'cR', registro_id: 'ftV',
        depois: { type: 'INCOME', amount: 89, payment_method: 'PIX', paid_at: null, category: 'Venda de produto' } }),
      r({ tabela: 'comandas', branch_id: 'bM', client_id: 'cR', depois: { status: 'PAGA' } }),
      r({ tabela: 'product_sales', operacao: 'editou', branch_id: 'bM', client_id: 'cR', colunas: ['custo'] }),
      r({ tabela: 'product_sales', operacao: 'editou', branch_id: 'bM', client_id: 'cR', colunas: ['stock_movement_id'] }),
      r({ tabela: 'product_sale_items', branch_id: 'bM' }),
      r({ tabela: 'stock_movements', branch_id: 'bM', depois: { type: 'SALE', quantity: -1, product_id: 'p1' } }),
      r({ tabela: 'product_sales', branch_id: 'bM', client_id: 'cR', depois: { price: 89, quantity: 1 } }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Vendeu 1 Hidratante e recebeu R$ 39,00 (Pix) — Rita Moura')
  })

  it('a baixa da parcela do crediário (os pontos gravados junto) é "Recebeu a parcela"', () => {
    const g = grupos([
      r({ tabela: 'financial_transactions', operacao: 'editou', branch_id: 'bM', client_id: 'cI', registro_id: 'ftParcela',
        colunas: ['data_de_referencia', 'is_paid', 'paid_at', 'payment_method', 'recebido_por'],
        antes: { paid_at: null, payment_method: null }, depois: { paid_at: '2026-11-16T14:31:20Z', payment_method: 'PIX' } }),
      r({ tabela: 'loyalty_transactions', branch_id: 'bM', client_id: 'cI' }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Recebeu a parcela 1/4 (R$ 200,00, Pix) — Íris Costa')
    expect(g[0]!.unidade).toBe('Moinhos')
  })

  it('a baixa sozinha (sem os pontos) também é "Recebeu a parcela"', () => {
    const g = grupos([
      r({ tabela: 'financial_transactions', operacao: 'editou', branch_id: 'bM', client_id: 'cI', registro_id: 'ftParcela',
        colunas: ['is_paid', 'paid_at', 'payment_method', 'recebido_por'],
        antes: { paid_at: null, payment_method: null }, depois: { paid_at: '2026-11-16T14:31:20Z', payment_method: 'PIX' } }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Recebeu a parcela 1/4 (R$ 200,00, Pix) — Íris Costa')
  })

  it('a venda do pacote (o contrato, as sessões e a comanda gravados junto) é "Vendeu o pacote", na unidade da venda', () => {
    const g = grupos([
      r({ tabela: 'financial_transactions', branch_id: 'bD', client_id: 'cB',
        depois: { type: 'INCOME', amount: 1650, payment_method: 'CREDIT_CARD', paid_at: '2026-11-16T14:05:17Z', category: 'Serviços' } }),
      r({ tabela: 'comandas', branch_id: 'bD', client_id: 'cB', depois: { status: 'PAGA' } }),
      ...Array.from({ length: 5 }, () => r({ tabela: 'package_sessions', branch_id: 'bD', client_id: 'cB' })),
      r({ tabela: 'client_packages', branch_id: 'bD', client_id: 'cB', depois: { price: 1650, package_id: 'pk1', status: 'ACTIVE' } }),
      r({ tabela: 'issued_documents', branch_id: 'bD', client_id: 'cB', depois: { title: 'Contrato de pacote' } }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Vendeu o pacote 5 radiofrequências (R$ 1.650,00) — Bárbara Lima')
    expect(g[0]!.unidade).toBe('Menino Deus')
  })

  it('a venda do pré-pago diz as sessões e o valor', () => {
    const g = grupos([
      r({ tabela: 'financial_transactions', branch_id: 'bM', client_id: 'cB',
        depois: { type: 'INCOME', amount: 250, payment_method: 'PIX', paid_at: '2026-11-16T14:19:25Z', category: 'Serviços' } }),
      r({ tabela: 'comandas', branch_id: 'bM', client_id: 'cB', depois: { status: 'PAGA' } }),
      r({ tabela: 'procedure_sale_units', branch_id: 'bM', client_id: 'cB' }),
      r({ tabela: 'procedure_sales', branch_id: 'bM', client_id: 'cB', depois: { price: 250, quantity: 1 } }),
    ])
    expect(sp(g[0]!.oQue)).toBe('Vendeu o pré-pago de 1 sessão (R$ 250,00) — Bárbara Lima')
  })
})
