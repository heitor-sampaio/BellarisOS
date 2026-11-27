import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { formasDoPagamentoDoAtendimento, pagamentoConfirmadoEmTexto } from '@/lib/financeiro/pagamento-do-atendimento'

/**
 * O "Pagamento confirmado" do atendimento diz TODAS as formas (D8 da 39ª,
 * princípio 3): pago em Pix R$ 100 + Débito R$ 62, a tela dizia só o Pix — o
 * `find` pegava o primeiro lançamento pago. E a janela do agendamento recebido
 * diz que foi recebido, com as formas (A23 da 39ª), não só "Concluído".
 */

const raiz = path.resolve(__dirname, '..')
const fonte = (arq: string) => readFileSync(path.join(raiz, arq), 'utf8')
const sem = (s: string) => s.replace(/ /g, ' ')

const linha = (id: string, metodo: string, valor: number, extra: Record<string, unknown> = {}) => ({
  id, payment_method: metodo, amount: valor, cartao_vezes: null, cartao_bandeira: null, maquininha_id: null,
  is_paid: true, notes: null, ...extra,
})

describe('as formas do pagamento do atendimento', () => {
  it('as duas formas pagas, a maior primeiro; o estornado e o em aberto ficam fora', () => {
    const formas = formasDoPagamentoDoAtendimento([
      linha('a', 'PIX', 100),
      linha('b', 'DEBIT_CARD', 62),
      linha('c', 'CASH', 30, { notes: 'Estornada' }),
      linha('d', 'CASH', 20, { is_paid: false }),
    ], null)
    expect(formas.map(f => f.id)).toEqual(['a', 'b'])
    expect(sem(pagamentoConfirmadoEmTexto(formas))).toBe('Pix · R$ 100,00 + Débito · R$ 62,00')
  })
  it('uma forma só, como era: o rótulo dela e o valor', () => {
    const formas = formasDoPagamentoDoAtendimento([linha('a', 'CREDIT_CARD', 300, { cartao_vezes: 5, cartao_bandeira: 'VISA' })], null)
    expect(sem(pagamentoConfirmadoEmTexto(formas))).toBe('Crédito Visa 5x · R$ 300,00')
  })
  it('a maquininha entra no rótulo quando a rede tem mais de uma', () => {
    const formas = formasDoPagamentoDoAtendimento(
      [linha('a', 'DEBIT_CARD', 62, { cartao_bandeira: 'VISA', maquininha_id: 'm1' })],
      { m1: 'Stone', m2: 'Cielo' })
    expect(sem(pagamentoConfirmadoEmTexto(formas))).toBe('Débito Visa · Stone · R$ 62,00')
  })
  it('nada pago, lista vazia', () => {
    expect(formasDoPagamentoDoAtendimento([linha('a', 'PIX', 10, { notes: 'Estornada' })], null)).toEqual([])
  })
})

describe('a tela usa todas as formas', () => {
  it('a sessão do atendimento manda as formas, e o bloco as diz todas', () => {
    expect(fonte('app/_shared/sessao-de-atendimento.tsx')).toContain('formasDoPagamentoDoAtendimento(')
    const tela = fonte('components/branch/appointment-session.tsx')
    expect(tela).toContain('pagamentoConfirmadoEmTexto(')
    expect(tela).not.toMatch(/Pagamento confirmado — \{rotuloDaForma\(paymentTransaction/)
  })
  it('a janela do agendamento recebido diz "Recebido", com as formas', () => {
    expect(fonte('actions/a-receber.ts')).toContain('pagamentoConfirmadoEmTexto(')
    const janela = fonte('components/branch/appointment-sheet.tsx')
    expect(janela).toContain('data-recebido')
    expect(janela).toMatch(/cobranca\?\.recebido/)
  })
})
