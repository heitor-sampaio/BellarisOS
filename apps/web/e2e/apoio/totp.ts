import crypto from 'node:crypto'

/**
 * TOTP (RFC 6238 sobre o HOTP da RFC 4226, SHA-1, 6 dígitos, passos de 30 s):
 * o código do autenticador, calculado no teste — a verificação em duas etapas
 * do /suporte é obrigatória, e o E2E não tem celular.
 *
 * Conferido contra os vetores da própria RFC em `tests/suporte-totp.test.ts`.
 */

export function base32(texto: string): Buffer {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const limpo = texto.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = ''
  for (const c of limpo) {
    const v = alfabeto.indexOf(c)
    if (v < 0) throw new Error(`base32 inválido: ${c}`)
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

/** Código HOTP de 6 dígitos para o contador dado. */
export function hotp(chave: Buffer, contador: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(contador))
  const hmac = crypto.createHmac('sha1', chave).update(msg).digest()
  const off = hmac[hmac.length - 1]! & 0x0f
  const n = ((hmac[off]! & 0x7f) << 24) | (hmac[off + 1]! << 16) | (hmac[off + 2]! << 8) | hmac[off + 3]!
  return String(n % 1_000_000).padStart(6, '0')
}

/** O código de agora para um segredo base32. */
export function totp(segredoBase32: string, agoraMs = Date.now()): string {
  return hotp(base32(segredoBase32), Math.floor(agoraMs / 1000 / 30))
}
