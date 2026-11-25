import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria diz o que mudou o dinheiro (princípio 3: o registro diz o que
 * aconteceu). As gravações abaixo são as que o gatilho guardou no recebimento
 * da comanda do PDV (`confirmar_pagamento_do_atendimento`), da mais nova à
 * mais antiga, como a leitura as entrega:
 *
 * - o crediário (entrada + parcelas) saía só "Recebeu R$ 100,00 (Pix)";
 * - a despesa saía pela categoria ("Criou a despesa Compra de estoque"), não
 *   pela descrição que a pessoa escreveu;
 * - o desconto, o voucher e os pontos da comanda: o gatilho de
 *   `financial_transactions` não guardava `sale_discount` nem
 *   `loyalty_discount` (a frase da A20a da 25ª lia um valor que nunca vinha), e
 *   o do voucher não guardava o `discount_value` — com o voucher, os pontos
 *   pagos à parte sumiam.
 */

const sp = (s: string) => s.replace(/[  ]/g, ' ')
let id = 7000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-25T02:08:32.671Z', branch_id: 'bA', client_id: 'cG', tabela: 'financial_transactions', operacao: 'criou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Elza', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cG: 'Graça', cE: 'Eloá' }, membros: {}, unidades: { bA: 'Setor Bueno' },
  clientesDosPontos: { lt1: 'Eloá', lt2: 'Eloá' },
}

describe('o crediário da comanda diz a entrada e as parcelas', () => {
  it('"Recebeu a entrada de R$ 100,00 (Pix) e lançou 3 parcelas no crediário (R$ 300,00)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const parcela = (n: number) => r({ registro_id: `p${n}`, depois: {
      type: 'INCOME', amount: 100, is_paid: false, category: 'Serviços', description: `Atendimento concluído — parcela ${n}/3`,
      parcela_numero: n, parcela_total: 3, due_date: '2026-12-24T15:00:00+00:00' } })
    const linhas = [
      parcela(3), parcela(2), parcela(1),
      r({ registro_id: 'e1', depois: { type: 'INCOME', amount: 100, is_paid: true, paid_at: '2026-11-25T02:08:32Z', category: 'Serviços',
        description: 'Atendimento concluído — entrada', payment_method: 'PIX' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu a entrada de R$ 100,00 (Pix) e lançou 3 parcelas no crediário (R$ 300,00) — Graça')
  })

  it('uma parcela só, no singular', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ registro_id: 'p1', depois: { type: 'INCOME', amount: 50, is_paid: false, category: 'Serviços', parcela_numero: 1, parcela_total: 1 } }),
      r({ registro_id: 'e1', depois: { type: 'INCOME', amount: 150, is_paid: true, paid_at: '2026-11-25T02:20:28Z', category: 'Serviços', payment_method: 'PIX' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu a entrada de R$ 150,00 (Pix) e lançou 1 parcela no crediário (R$ 50,00) — Graça')
  })

  it('sem parcela em aberto, a frase de sempre', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'comandas', registro_id: 'c1', depois: { status: 'PAGA' } }),
      r({ registro_id: 'e1', depois: { type: 'INCOME', amount: 150, is_paid: true, paid_at: '2026-11-25T02:20:28Z', category: 'Serviços', payment_method: 'PIX' } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes))).toBe('Recebeu R$ 150,00 (Pix) — Graça')
  })
})

describe('a despesa se lê pela descrição', () => {
  it('"Criou a despesa Conta de energia, em Energia (R$ 480,00)"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDaAuditoria(r({ client_id: null, depois: { type: 'EXPENSE', amount: 480, category: 'Energia', description: 'Conta de energia' } }), nomes)))
      .toBe('Criou a despesa Conta de energia, em Energia (R$ 480,00)')
  })

  it('a despesa em parcelas é uma frase só, pela descrição', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const parcela = (n: number) => r({ client_id: null, registro_id: `d${n}`, depois: {
      type: 'EXPENSE', amount: 300, is_paid: false, category: 'Compra de estoque', fornecedor: 'Dermo Centro',
      description: `Dermo Centro (insumos) — parcela ${n}/3`, parcela_numero: n, parcela_total: 3 } })
    expect(sp(fraseDoGrupo([parcela(3), parcela(2), parcela(1)], nomes)))
      .toBe('Criou a despesa Dermo Centro (insumos), em Compra de estoque, em 3 parcelas (R$ 900,00)')
  })
})

describe('o desconto, o voucher e os pontos da comanda', () => {
  // A comanda da Eloá: R$ 450 − 10% (R$ 45) − o Voucher R$ 30 − 100 pontos (R$ 5) = R$ 370 no Pix.
  const daEloa = (comValores: boolean) => [
    r({ tabela: 'loyalty_transactions', client_id: 'cE', registro_id: 'lt2', depois: { points: -100 } }),
    r({ tabela: 'loyalty_vouchers', operacao: 'editou', client_id: 'cE', colunas: ['status', 'used_at', 'used_transaction_id'],
      antes: { status: 'ATIVO' }, depois: { name: 'Voucher R$ 30', status: 'USADO', ...(comValores ? { discount_value: 30 } : {}) } }),
    r({ client_id: 'cE', registro_id: 'ft1', depois: {
      type: 'INCOME', amount: 370, is_paid: true, paid_at: '2026-11-25T02:21:20Z', category: 'Serviços', payment_method: 'PIX',
      ...(comValores ? { sale_discount: 45, loyalty_discount: 35 } : {}) } }),
    r({ tabela: 'loyalty_transactions', client_id: 'cE', registro_id: 'lt1', depois: { points: 370 } }),
    r({ tabela: 'commissions', client_id: 'cE', depois: { type: 'PERCENTAGE', amount: 148, status: 'OPEN' } }),
  ]

  it('com os valores que o gatilho passa a guardar: o desconto, o voucher e os pontos em reais', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo(daEloa(true), nomes)))
      .toBe('Recebeu R$ 370,00 (Pix), com desconto de R$ 45,00, o Voucher R$ 30 e R$ 5,00 em pontos — Eloá')
  })

  it('nas gravações de antes (sem os valores), o voucher e os pontos debitados na gravação', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo(daEloa(false), nomes)))
      .toBe('Recebeu R$ 370,00 (Pix), com o Voucher R$ 30 e 100 pontos — Eloá')
  })

  it('o gatilho passa a guardar o desconto, os pontos e o valor do voucher (a migration)', () => {
    const pasta = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arquivo = readdirSync(pasta).find(f => /^2026120440\d{4}_auditoria_o_dinheiro_da_comanda\.sql$/.test(f))
    expect(arquivo, 'a migration da faixa P').toBeTruthy()
    const sql = readFileSync(path.join(pasta, arquivo!), 'utf8')
    for (const op of ['ins', 'upd', 'del']) {
      expect(sql).toMatch(new RegExp(`auditoria_${op}[\\s\\S]*?on public\\.financial_transactions[\\s\\S]*?sale_discount,loyalty_discount`))
      // O valor do voucher vai no RÓTULO: na edição (o voucher usado) o gatilho só guarda os valores que mudaram.
      expect(sql).toMatch(new RegExp(`auditoria_${op}[\\s\\S]*?on public\\.loyalty_vouchers[\\s\\S]*?'name,discount_value', 'status'`))
    }
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
