import { describe, it, expect } from 'vitest'
import { base32, hotp, totp } from '../e2e/apoio/totp'

/**
 * O TOTP que o E2E calcula para passar pela verificação em duas etapas do
 * /suporte. Os vetores são os da própria RFC (segredo "12345678901234567890",
 * SHA-1) — os de 8 dígitos da RFC 6238, cortados nos 6 que o Auth usa.
 */
const SEGREDO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' // "12345678901234567890" em base32

describe('TOTP do E2E', () => {
  it('decodifica base32', () => {
    expect(base32(SEGREDO).toString('ascii')).toBe('12345678901234567890')
  })

  it('HOTP bate com a RFC 4226', () => {
    const chave = Buffer.from('12345678901234567890', 'ascii')
    expect(hotp(chave, 0)).toBe('755224')
    expect(hotp(chave, 1)).toBe('287082')
    expect(hotp(chave, 9)).toBe('520489')
  })

  it('TOTP bate com a RFC 6238 (6 últimos dígitos)', () => {
    expect(totp(SEGREDO, 59 * 1000)).toBe('287082')
    expect(totp(SEGREDO, 1111111109 * 1000)).toBe('081804')
    expect(totp(SEGREDO, 1234567890 * 1000)).toBe('005924')
    expect(totp(SEGREDO, 20000000000 * 1000)).toBe('353130')
  })
})
