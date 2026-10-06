import { describe, it, expect } from 'vitest'
import { motivoDoBloqueio, redeBloqueada, rotuloDaRede, ehSituacaoDoPlano } from '@/lib/redes/situacao'
import { centavosDe, reaisDe, campoDeReais } from '@/lib/redes/valor'
import { paraSlug, soDigitos } from '@/lib/redes/criar'

describe('situação da rede', () => {
  it('bloqueada = desligada OU suspensa OU cancelada', () => {
    expect(motivoDoBloqueio({ ativa: false, planStatus: 'active' })).toBe('desligada')
    expect(motivoDoBloqueio({ ativa: true, planStatus: 'suspended' })).toBe('suspensa')
    expect(motivoDoBloqueio({ ativa: true, planStatus: 'canceled' })).toBe('cancelada')
    expect(redeBloqueada({ ativa: true, planStatus: 'past_due' })).toBe(false)
    expect(redeBloqueada({ ativa: true, planStatus: 'trial' })).toBe(false)
    expect(redeBloqueada({ ativa: true, planStatus: null })).toBe(false)
  })

  it('desligada vence a assinatura no rótulo', () => {
    expect(rotuloDaRede({ ativa: false, planStatus: 'active' })).toBe('Desligada')
    expect(rotuloDaRede({ ativa: true, planStatus: 'past_due' })).toBe('Em atraso')
    expect(ehSituacaoDoPlano('pago')).toBe(false)
  })
})

describe('dinheiro em centavos', () => {
  it('lê o que a tela escreve', () => {
    expect(centavosDe('199,90')).toBe(19990)
    expect(centavosDe('R$ 1.240,00')).toBe(124000)
    expect(centavosDe('0')).toBe(0)
    expect(centavosDe('-3')).toBeNull()
    expect(centavosDe('abc')).toBeNull()
    expect(centavosDe('')).toBeNull()
  })

  it('escreve para a tela', () => {
    expect(campoDeReais(19990)).toBe('199,90')
    expect(reaisDe(124000).replace(/\s/g, ' ')).toBe('R$ 1.240,00')
    expect(reaisDe(null)).toBe('—')
  })
})

describe('nova rede', () => {
  it('slug sem acento nem espaço', () => {
    expect(paraSlug('Clínica Bella Estética!')).toBe('clinica-bella-estetica')
    expect(paraSlug('   ')).toBe('clinica')
  })
  it('documento só com dígitos', () => {
    expect(soDigitos('12.345.678/0001-90')).toBe('12345678000190')
    expect(soDigitos('')).toBeNull()
  })
})

// Os dois portais viraram dois HOSTS (2026-10-06): tests/plataforma-hosts.test.ts.

