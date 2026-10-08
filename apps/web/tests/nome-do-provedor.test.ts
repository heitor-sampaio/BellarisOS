import { describe, it, expect } from 'vitest'
import { nomeDoProvedor } from '@/lib/whatsapp/nome-do-provedor'

/** O nome que a CLÍNICA vê de cada provedor — "uazapi" fica no código (2026-10-08). */
describe('nomeDoProvedor', () => {
  it('a conexão por QR é "WhatsApp Web"; a da Meta, "WhatsApp Oficial"', () => {
    expect(nomeDoProvedor('uazapi')).toBe('WhatsApp Web')
    expect(nomeDoProvedor('official')).toBe('WhatsApp Oficial')
  })

  it('o que não é provedor de WhatsApp passa como veio', () => {
    expect(nomeDoProvedor('meta_ads')).toBe('meta_ads')
  })
})
