import { describe, it, expect } from 'vitest'
import { notaDaTransferencia, notaDeTransferenciaSemNome } from '@/lib/estoque/transferencia'

// D12 da 8ª simulação: as notas antigas da transferência ganham o nome da unidade na tela.
describe('a nota da transferência', () => {
  it('as antigas, sem observação', () => {
    expect(notaDaTransferencia('TRANSFER_OUT', 'Transferência para filial destino.', 'Batel')).toBe('Transferência para Batel.')
    expect(notaDaTransferencia('TRANSFER_IN', 'Transferência da filial de origem.', 'Água Verde')).toBe('Transferência de Água Verde.')
  })
  it('as antigas, com observação', () => {
    expect(notaDaTransferencia('TRANSFER_OUT', 'Transferência → destino. reposição', 'Batel')).toBe('Transferência para Batel. reposição')
    expect(notaDaTransferencia('TRANSFER_IN', 'Transferência ← origem. reposição', 'Água Verde')).toBe('Transferência de Água Verde. reposição')
  })
  it('a nova e a de outro tipo ficam como vieram; sem a outra unidade, também', () => {
    expect(notaDaTransferencia('TRANSFER_OUT', 'Transferência para Batel. x', 'Batel')).toBe('Transferência para Batel. x')
    expect(notaDaTransferencia('PURCHASE', 'Transferência → destino.', 'Batel')).toBe('Transferência → destino.')
    expect(notaDaTransferencia('TRANSFER_OUT', 'Transferência → destino.', null)).toBe('Transferência → destino.')
  })
  it('diz quando a nota precisa da outra perna', () => {
    expect(notaDeTransferenciaSemNome('TRANSFER_IN', 'Transferência ← origem.')).toBe(true)
    expect(notaDeTransferenciaSemNome('TRANSFER_IN', 'Transferência de Batel.')).toBe(false)
  })
})
