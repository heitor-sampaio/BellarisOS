import { describe, it, expect } from 'vitest'
import { situacaoDoPremio, textoDoIndiqueUmaAmiga } from '@/lib/fidelidade/indicacao'
import { EntradaDaConfig } from '@/lib/fidelidade/config'

const base = { id: 'x', nome: 'Marina', premioEm: null, estornadoEm: null, jaPagou: false }
const ligado = { fidelidadeLigada: true, premio: 'PONTOS' as const }

describe('a indicação que premia: os textos', () => {
  it('a ficha de quem indicou diz o prêmio dado, o estornado, o que espera e o que não vem', () => {
    expect(situacaoDoPremio({ ...base, premioEm: '2026-11-10T15:00:00Z' }, ligado)).toBe('prêmio dado em 10/11')
    expect(situacaoDoPremio({ ...base, estornadoEm: '2026-11-12T15:00:00Z' }, ligado)).toMatch(/^prêmio estornado em 12\/11/)
    expect(situacaoDoPremio(base, ligado)).toBe('prêmio quando ela fizer o primeiro pagamento')
    expect(situacaoDoPremio({ ...base, jaPagou: true }, ligado)).toMatch(/^sem prêmio/)
  })
  it('com a fidelidade desligada, nenhum sinal; com o prêmio desligado, só o que já foi dado', () => {
    expect(situacaoDoPremio({ ...base, premioEm: '2026-11-10T15:00:00Z' }, { fidelidadeLigada: false, premio: 'PONTOS' })).toBeNull()
    expect(situacaoDoPremio(base, { fidelidadeLigada: true, premio: 'DESLIGADO' })).toBeNull()
    expect(situacaoDoPremio({ ...base, premioEm: '2026-11-10T15:00:00Z' }, { fidelidadeLigada: true, premio: 'DESLIGADO' })).toBe('prêmio dado em 10/11')
  })
  it('"Indique uma amiga" só com o prêmio ligado, e diz o prêmio', () => {
    expect(textoDoIndiqueUmaAmiga({ premio: 'PONTOS', pontos: 300, recompensa: null })).toContain('300 pontos')
    expect(textoDoIndiqueUmaAmiga({ premio: 'RECOMPENSA', pontos: 0, recompensa: 'Desconto de R$ 50' })).toContain('Desconto de R$ 50')
    expect(textoDoIndiqueUmaAmiga({ premio: 'DESLIGADO', pontos: 300, recompensa: null })).toBeNull()
    expect(textoDoIndiqueUmaAmiga({ premio: 'RECOMPENSA', pontos: 0, recompensa: null })).toBeNull()
  })
})

describe('a configuração do prêmio por indicação', () => {
  const valida = {
    enabled: true, earn_mode: 'POR_REAL', points_per_real: 1, redeem_points_value: 0.01, redeem_min_points: 0,
    redeem_max_pct: 100, expiry_months: null, birthday_bonus: 0, first_access_bonus: 0,
    client_redeem: false, expiry_notice_days: null,
  }
  it('nasce desligado para o chamador que não manda o campo', () => {
    expect(EntradaDaConfig.parse(valida).indicacao_premio).toBe('DESLIGADO')
  })
  it('em pontos pede os pontos; em recompensa, a recompensa', () => {
    expect(EntradaDaConfig.safeParse({ ...valida, indicacao_premio: 'PONTOS', indicacao_pontos: 0 }).success).toBe(false)
    expect(EntradaDaConfig.safeParse({ ...valida, indicacao_premio: 'PONTOS', indicacao_pontos: '300' }).success).toBe(true)
    expect(EntradaDaConfig.safeParse({ ...valida, indicacao_premio: 'RECOMPENSA', indicacao_recompensa_id: null }).success).toBe(false)
    expect(EntradaDaConfig.safeParse({ ...valida, indicacao_premio: 'RECOMPENSA', indicacao_recompensa_id: '7f3c2a1e-0b1d-4c5e-9f8a-1b2c3d4e5f60' }).success).toBe(true)
  })
})
