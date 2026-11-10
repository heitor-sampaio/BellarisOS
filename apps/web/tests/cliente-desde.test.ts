import { describe, it, expect } from 'vitest'
import { diaDeClienteDesde, mesDeClienteDesde, dataDeClienteDesde } from '../lib/clientes/cliente-desde'

// D6 da 10ª simulação: "Cliente desde" é o da planilha importada
// (clients.cliente_desde), senão o cadastro — na ficha, no atendimento e no LGPD.
describe('cliente desde', () => {
  it('o da importação vence o cadastro', () => {
    const c = { clienteDesde: '2021-03-12', createdAt: '2026-11-10T05:00:00Z' }
    expect(mesDeClienteDesde(c)).toBe('mar 2021')
    expect(dataDeClienteDesde(c)).toBe('12/03/2021')
  })
  it('o dia da importação se lê como dia (o 01/03 não vira fevereiro)', () => {
    expect(mesDeClienteDesde({ clienteDesde: '2021-03-01' })).toBe('mar 2021')
  })
  it('sem a importação, o cadastro em Brasília', () => {
    // 01/12 às 01:00 UTC ainda é 30/11 em Brasília.
    expect(diaDeClienteDesde({ clienteDesde: null, createdAt: '2026-12-01T01:00:00Z' })).toBe('2026-11-30')
    expect(mesDeClienteDesde({ createdAt: '2026-12-01T01:00:00Z' })).toBe('nov 2026')
  })
  it('sem nada, nada', () => {
    expect(mesDeClienteDesde({})).toBeNull()
    expect(dataDeClienteDesde({ createdAt: 'lixo' })).toBeNull()
  })
})
