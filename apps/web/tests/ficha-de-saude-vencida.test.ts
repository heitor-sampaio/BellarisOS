import { describe, it, expect } from 'vitest'
import { fichaDeSaudeVencida } from '@/lib/pre-atendimento/validade'

const agora = new Date('2026-11-03T15:00:00.000Z')

describe('fichaDeSaudeVencida (atend-05)', () => {
  it('respondida há 8 meses, com validade de 6, está vencida', () =>
    expect(fichaDeSaudeVencida('2026-03-03T12:00:00.000Z', 6, agora)).toBe(true))
  it('respondida há 1 mês não está', () =>
    expect(fichaDeSaudeVencida('2026-10-03T12:00:00.000Z', 6, agora)).toBe(false))
  it('no limite exato vence (como o gatilho: > now() - N meses é dentro)', () =>
    expect(fichaDeSaudeVencida('2026-05-03T15:00:00.000Z', 6, agora)).toBe(true))
  it('um minuto depois do limite ainda vale', () =>
    expect(fichaDeSaudeVencida('2026-05-03T15:01:00.000Z', 6, agora)).toBe(false))
  it('fim de mês curto: 31/08 menos 6 meses é 28/02', () =>
    expect(fichaDeSaudeVencida('2026-02-28T12:00:00.000Z', 6, new Date('2026-08-31T12:00:00.000Z'))).toBe(true))
  it('sem data ou sem validade, não diz nada', () => {
    expect(fichaDeSaudeVencida(null, 6, agora)).toBe(false)
    expect(fichaDeSaudeVencida('2020-01-01T00:00:00.000Z', 0, agora)).toBe(false)
    expect(fichaDeSaudeVencida('lixo', 6, agora)).toBe(false)
  })
})
