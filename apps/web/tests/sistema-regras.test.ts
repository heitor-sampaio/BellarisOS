import { describe, it, expect } from 'vitest'
import { motivoDoBloqueio, redeBloqueada, rotuloDaRede, ehSituacaoDoPlano } from '@/lib/redes/situacao'
import { centavosDe, reaisDe, campoDeReais } from '@/lib/redes/valor'
import { paraSlug, soDigitos } from '@/lib/redes/criar'
import { emailsDoPrimeiroAdmin, ehEmailDoPrimeiroAdmin } from '@/lib/plataforma/primeiro-admin'
import { inicioDaPlataforma, ehPortalDaPlataforma, ehPortalDoSistema } from '@/lib/plataforma/destino'
import { tokenDoWebhookConfere } from '@/lib/asaas/webhook'

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

describe('primeiro admin por variável', () => {
  it('aceita vários e-mails, sem diferença de caixa', () => {
    const lista = emailsDoPrimeiroAdmin(' Heitor+Suporte@Exemplo.com , outro@x.com,lixo')
    expect(lista).toEqual(['heitor+suporte@exemplo.com', 'outro@x.com'])
    expect(ehEmailDoPrimeiroAdmin('HEITOR+suporte@exemplo.com', lista)).toBe(true)
    expect(ehEmailDoPrimeiroAdmin('heitor@exemplo.com', lista)).toBe(false)
    expect(ehEmailDoPrimeiroAdmin(null, lista)).toBe(false)
  })
  it('sem variável, ninguém', () => {
    expect(emailsDoPrimeiroAdmin('')).toEqual([])
    expect(emailsDoPrimeiroAdmin(undefined)).toEqual([])
  })
})

describe('os dois portais da plataforma', () => {
  it('ADMIN começa no /sistema; SUPORTE no /suporte', () => {
    expect(inicioDaPlataforma('ADMIN')).toBe('/sistema')
    expect(inicioDaPlataforma('SUPORTE')).toBe('/suporte')
    expect(inicioDaPlataforma(null)).toBe('/suporte')
  })
  it('reconhece os prefixos sem pegar parecidos', () => {
    expect(ehPortalDaPlataforma('/sistema/redes')).toBe(true)
    expect(ehPortalDaPlataforma('/suporte')).toBe(true)
    expect(ehPortalDaPlataforma('/sistemas')).toBe(false)
    expect(ehPortalDoSistema('/suporte/redes')).toBe(false)
  })
})

describe('token do webhook do Asaas', () => {
  const certo = 'x'.repeat(40)
  it('confere em tempo constante', () => {
    expect(tokenDoWebhookConfere(certo, certo)).toBe(true)
    expect(tokenDoWebhookConfere('y'.repeat(40), certo)).toBe(false)
    expect(tokenDoWebhookConfere(null, certo)).toBe(false)
  })
  it('sem token configurado (ou curto), recusa tudo — vazio não vale', () => {
    expect(tokenDoWebhookConfere('', '')).toBe(false)
    expect(tokenDoWebhookConfere('curto', 'curto')).toBe(false)
    expect(tokenDoWebhookConfere(certo, undefined)).toBe(false)
  })
})
