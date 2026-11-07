import { describe, it, expect } from 'vitest'
import { enderecoComNumero } from '@/lib/unidades/endereco-com-numero'

// A7 da 9ª simulação: o número do endereço da unidade nova.
describe('enderecoComNumero', () => {
  it('o número vem depois do logradouro, antes do bairro', () => {
    expect(enderecoComNumero('Rua Padre Chagas — Moinhos de Vento', '123')).toBe('Rua Padre Chagas, 123 — Moinhos de Vento')
    expect(enderecoComNumero('Rua Padre Chagas', '123')).toBe('Rua Padre Chagas, 123')
  })
  it('sem número, como está; sem nada, nulo', () => {
    expect(enderecoComNumero('Rua A', '')).toBe('Rua A')
    expect(enderecoComNumero('', '')).toBeNull()
  })
})
