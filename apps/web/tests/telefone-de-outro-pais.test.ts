import { describe, it, expect } from 'vitest'
import { normalizarTelefone, telefoneDaFichaImportada } from '@/lib/importacao/normalizar'
import { cadastrarCliente, atualizarContato, telefoneDoCopilot } from '@/lib/copilot/ferramentas/clientes-escrita'
import { agendar } from '@/lib/copilot/ferramentas/agenda-escrita'

/**
 * cli-06 (revisão do Heitor, 2026-11-02): o telefone de outro país — "+" e o
 * código, 8 a 15 dígitos, a regra de `telefoneDoCadastro` — vale em TODO
 * caminho, não só no cadastro e na aba Dados: a importação e o Copilot também.
 */
describe('o telefone com "+" na importação', () => {
  it('aceita de 8 a 15 dígitos, como o cadastro (o de Andorra tem 9)', () => {
    expect(normalizarTelefone('+376 312 345')).toBe('376312345')
    expect(normalizarTelefone('+351 912 345 678')).toBe('351912345678')
    expect(normalizarTelefone('+1234567')).toBeNull()
    expect(normalizarTelefone('+55 48 99999 0000')).toBe('5548999990000')
  })
  it('a ficha importada guarda o de fora com o "+", e o brasileiro com a máscara', () => {
    expect(telefoneDaFichaImportada('351912345678')).toBe('+351912345678')
    expect(telefoneDaFichaImportada('5548999990000')).toBe('(48) 99999-0000')
    expect(telefoneDaFichaImportada('554833334444')).toBe('(48) 3333-4444')
  })
})

describe('o telefone com "+" no Copilot', () => {
  it('o cadastro, a correção do contato e o cliente novo do agendar usam a regra do cadastro', () => {
    expect(telefoneDoCopilot('+376 312 345')).toEqual({ digitos: '376312345', gravar: '+376 312 345' })
    expect(telefoneDoCopilot('48 99999-0000')).toEqual({ digitos: '48999990000', gravar: '(48) 99999-0000' })
    expect(telefoneDoCopilot('99999-0000')).toEqual({ erro: expect.stringContaining('DDD') })
    expect(cadastrarCliente.parametros.safeParse({ nome: 'Ana', telefone: '+376 312 345' }).success).toBe(true)
    expect(atualizarContato.parametros.safeParse({ cliente: 'Ana', telefone: '+12 345678' }).success).toBe(true)
    const novo = (agendar.parametros as unknown as { shape: { clienteNovo: { safeParse: (v: unknown) => { success: boolean } } } }).shape.clienteNovo
    expect(novo.safeParse({ nome: 'Ana', telefone: '+12 345678' }).success).toBe(true)
  })
})
