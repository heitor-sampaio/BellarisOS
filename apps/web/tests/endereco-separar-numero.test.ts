import { describe, it, expect } from 'vitest'
import { enderecoComNumero, separarNumero } from '@/lib/unidades/endereco-com-numero'

/**
 * D9 da 13ª simulação (F70): o detalhe da unidade não tinha o campo Número —
 * a unidade nova tinha, e gravava "Rua X, 123 — Bairro" no endereço. Para
 * editar, o endereço gravado se separa de novo no logradouro e no número.
 */
describe('separar o número do endereço da unidade', () => {
  it('é o inverso de enderecoComNumero', () => {
    for (const [e, n] of [['Rua Padre Chagas — Moinhos de Vento', '123'], ['Av. Brasil', '45A'], ['Rua Sem Bairro', 's/n']] as const) {
      expect(separarNumero(enderecoComNumero(e, n))).toEqual({ endereco: e, numero: n })
    }
  })
  it('sem número, o endereço como está', () => {
    expect(separarNumero('Rua das Flores — Centro')).toEqual({ endereco: 'Rua das Flores — Centro', numero: '' })
    expect(separarNumero(null)).toEqual({ endereco: '', numero: '' })
  })
  it('vírgula que não é número fica no logradouro', () => {
    expect(separarNumero('Rua Sete, sala 2')).toEqual({ endereco: 'Rua Sete, sala 2', numero: '' })
  })
})
