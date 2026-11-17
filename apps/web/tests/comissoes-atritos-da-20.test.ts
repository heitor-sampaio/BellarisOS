import { describe, it, expect } from 'vitest'
import { vinculosDoExtrato } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/**
 * D3 da 20ª simulação (2026-11-17; princípio 3). O extrato da Bianca:
 * Liberação 69,48 (11:39), Estorno −69,48 (11:45), Liberação 72,00 (11:45). O
 * pagamento (11:36) veio ANTES da conclusão (11:39): a comissão foi liberada
 * pela conclusão, sem o lançamento (`transaction_id` nulo), e o estorno tem o
 * do pagamento de 2x. O vínculo exigia a mesma transação e não ligava o
 * estorno à liberação. Agora, sem a liberação daquele pagamento, o estorno se
 * liga à liberação SEM pagamento do mesmo atendimento e valor.
 */

const hora = (iso: string) => iso.slice(11, 16)

const linha = (mais: Partial<LancamentoDoExtrato>): LancamentoDoExtrato => ({
  id: 'x', professionalId: 'p', branchId: 'b', releasedAt: '2026-11-16T11:39:00Z', kind: 'LIBERACAO', motivo: null, amount: 69.48,
  status: 'OPEN', payoutId: null, appointmentId: 'ag-neusa', scheduledAt: null, cliente: 'Neusa', procedimento: 'Toxina',
  origem: 'AVULSO', preco: 300, regraTipo: 'PERCENTAGE', regraValor: 24, pacote: null, descontaTaxa: true, descontaInsumos: false,
  previsto: null, baseComPontos: null, plano: null, base: 289.5, baseDesconto: 0, baseTaxa: 10.5, baseInsumos: 0, baseFator: 1,
  pagoEm: null, regraDe: null, transacaoId: null, ...mais,
})

describe('D3: o estorno se liga à liberação feita na conclusão', () => {
  // O extrato vem do mais novo ao mais velho.
  const extrato = [
    linha({ id: 'l2', releasedAt: '2026-11-16T11:45:30Z', amount: 72, transacaoId: 'tx-avista' }),
    linha({ id: 'e1', releasedAt: '2026-11-16T11:45:00Z', kind: 'ESTORNO', amount: -69.48, motivo: 'Estorno do pagamento', transacaoId: 'tx-2x' }),
    linha({ id: 'l1' }),
  ]

  it('a liberação da conclusão (sem lançamento) é a que o estorno desfaz', () => {
    const v = vinculosDoExtrato(extrato, hora)
    expect(v.get('e1')).toBe('desfaz a liberação das 11:39')
    expect(v.get('l2')).toBe('de novo, depois do estorno das 11:45')
  })

  it('a liberação de OUTRO pagamento não é desfeita por engano', () => {
    const v = vinculosDoExtrato([
      linha({ id: 'e1', releasedAt: '2026-11-16T11:45:00Z', kind: 'ESTORNO', amount: -69.48, transacaoId: 'tx-2x' }),
      linha({ id: 'l1', transacaoId: 'tx-outro' }),
    ], hora)
    expect(v.has('e1')).toBe(false)
  })
})
