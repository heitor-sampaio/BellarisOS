import { describe, it, expect } from 'vitest'
import { alternarTag, opcoesDeTag, validarNomeDeTag, temTag } from '@/lib/tags/escolha'

/**
 * As tags da rede (2026-10-13): um vocabulário só para a ficha e o CRM,
 * gerenciado em Configurações → Tags. A parte pura — o que a tela oferece e
 * como marca/desmarca sem se confundir com caixa ("VIP" e "vip" são a mesma).
 */
describe('temTag / alternarTag', () => {
  it('compara sem caixa nem espaço nas pontas', () => {
    expect(temTag(['vip', 'Retorno'], 'VIP')).toBe(true)
    expect(temTag(['vip'], ' Vip ')).toBe(true)
    expect(temTag(['vip'], 'Gestante')).toBe(false)
  })
  it('marca com o nome do vocabulário e desmarca qualquer grafia', () => {
    expect(alternarTag(['Retorno'], 'VIP')).toEqual(['Retorno', 'VIP'])
    expect(alternarTag(['vip', 'Retorno'], 'VIP')).toEqual(['Retorno'])
  })
})

describe('opcoesDeTag', () => {
  it('o vocabulário ativo, mais o que a pessoa já tem fora dele (importado, arquivado) — sem as de unidade', () => {
    expect(opcoesDeTag(['VIP', 'Retorno'], ['vip', 'evento-maio', 'Unidade: Centro'])).toEqual(['VIP', 'Retorno', 'evento-maio'])
  })
  it('sem nada marcado, só o vocabulário', () => {
    expect(opcoesDeTag(['VIP'], [])).toEqual(['VIP'])
  })
})

describe('validarNomeDeTag', () => {
  it('apara, recusa vazio, longo e o prefixo de unidade', () => {
    expect(validarNomeDeTag('  Noivas  ')).toEqual({ nome: 'Noivas' })
    expect(validarNomeDeTag('   ')).toEqual({ error: 'Dê um nome à tag.' })
    expect(validarNomeDeTag('x'.repeat(61))).toEqual({ error: 'A tag tem no máximo 60 caracteres.' })
    expect(validarNomeDeTag('Unidade: Norte')).toEqual({ error: 'Tags "Unidade: …" são do sistema (a unidade que o cliente frequenta).' })
  })
})
