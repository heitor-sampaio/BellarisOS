import { describe, it, expect } from 'vitest'
import { EntradaDaConfig, configDaLinha, CONFIG_PADRAO } from '@/lib/fidelidade/config'
import { formatarPontos, pontosEmReais, rotuloDoLancamento } from '@/lib/fidelidade/formato'

describe('EntradaDaConfig', () => {
  const valida = {
    enabled: true, earn_mode: 'POR_REAL', points_per_real: '1.5', commission_base: 'PRECO',
    redeem_points_value: '0.01', redeem_min_points: '0', redeem_max_pct: '100',
    expiry_months: null as string | null, scope_per_branch: false,
    birthday_bonus: '0', first_access_bonus: '0', client_redeem: false, expiry_notice_days: null as string | null,
  }

  it('aceita a config da tela e converte o número', () => {
    const r = EntradaDaConfig.parse(valida)
    expect(r.points_per_real).toBe(1.5)
  })

  it('recusa taxa zero, negativa ou absurda', () => {
    for (const taxa of ['0', '-1', '1001', 'abc']) {
      expect(EntradaDaConfig.safeParse({ ...valida, points_per_real: taxa }).success, taxa).toBe(false)
    }
  })

  it('recusa regras de resgate fora do limite', () => {
    expect(EntradaDaConfig.safeParse({ ...valida, redeem_points_value: '0' }).success).toBe(false)
    expect(EntradaDaConfig.safeParse({ ...valida, redeem_min_points: '1.5' }).success).toBe(false)
    expect(EntradaDaConfig.safeParse({ ...valida, redeem_max_pct: '0' }).success).toBe(false)
    expect(EntradaDaConfig.safeParse({ ...valida, redeem_max_pct: '101' }).success).toBe(false)
  })

  it('opcionais: bônus de 0 a 1.000.000 inteiros; aviso nulo ou 1 a 90 dias', () => {
    const ok = EntradaDaConfig.parse({ ...valida, birthday_bonus: '200', first_access_bonus: '50', client_redeem: true, expiry_notice_days: '7' })
    expect([ok.birthday_bonus, ok.first_access_bonus, ok.client_redeem, ok.expiry_notice_days]).toEqual([200, 50, true, 7])
    for (const b of ['-1', '1.5', '1000001']) expect(EntradaDaConfig.safeParse({ ...valida, birthday_bonus: b }).success, b).toBe(false)
    for (const d of ['0', '91', '2.5']) expect(EntradaDaConfig.safeParse({ ...valida, expiry_notice_days: d }).success, d).toBe(false)
  })

  it('validade: nula (não vence) ou 1 a 120 meses', () => {
    expect(EntradaDaConfig.parse(valida).expiry_months).toBeNull()
    expect(EntradaDaConfig.parse({ ...valida, expiry_months: '6' }).expiry_months).toBe(6)
    for (const m of ['0', '121', '1.5']) expect(EntradaDaConfig.safeParse({ ...valida, expiry_months: m }).success, m).toBe(false)
  })

  it('recusa modo e base de comissão fora da lista', () => {
    expect(EntradaDaConfig.safeParse({ ...valida, earn_mode: 'POR_VISITA' }).success).toBe(false)
    expect(EntradaDaConfig.safeParse({ ...valida, commission_base: 'METADE' }).success).toBe(false)
  })
})

describe('configDaLinha', () => {
  it('sem linha: tudo desligado, com os valores padrão', () => {
    expect(configDaLinha(null)).toEqual(CONFIG_PADRAO)
    expect(configDaLinha(null).enabled).toBe(false)
  })

  it('numeric chega como string do banco e vira número', () => {
    const c = configDaLinha({ enabled: true, earn_mode: 'POR_PROCEDIMENTO', points_per_real: '2.5000', redeem_points_value: '0.0200', expiry_months: 6, commission_base: 'VALOR_PAGO' })
    expect(c).toMatchObject({ enabled: true, earn_mode: 'POR_PROCEDIMENTO', points_per_real: 2.5, redeem_points_value: 0.02, expiry_months: 6, commission_base: 'VALOR_PAGO' })
  })

  it('valor desconhecido cai no padrão seguro', () => {
    const c = configDaLinha({ enabled: 'sim', earn_mode: 'OUTRO', commission_base: 'OUTRA' })
    expect(c.enabled).toBe(false)
    expect(c.earn_mode).toBe('POR_REAL')
    expect(c.commission_base).toBe('PRECO')
  })
})

describe('formato', () => {
  it('pontos em pt-BR, singular e negativo', () => {
    expect(formatarPontos(1240)).toBe('1.240 pontos')
    expect(formatarPontos(1)).toBe('1 ponto')
    expect(formatarPontos(-30)).toBe('−30 pontos')
  })

  it('R$ dos pontos, nunca negativo', () => {
    expect(pontosEmReais(333, 0.01)).toBe(3.33)
    expect(pontosEmReais(-10, 0.01)).toBe(0)
    expect(pontosEmReais(10, 0)).toBe(0)
  })

  it('todo tipo do extrato tem rótulo', () => {
    for (const k of ['GANHO', 'ESTORNO_GANHO', 'AJUSTE', 'RESGATE', 'ESTORNO_RESGATE', 'VOUCHER', 'VOUCHER_CANCELADO', 'EXPIRACAO', 'BONUS']) {
      expect(rotuloDoLancamento(k)).not.toBe('Lançamento')
    }
  })

  it('o bônus se rotula pela descrição do banco', () => {
    expect(rotuloDoLancamento('BONUS', 'Bônus de aniversário')).toBe('Bônus de aniversário')
    expect(rotuloDoLancamento('BONUS')).toBe('Bônus')
    expect(rotuloDoLancamento('GANHO', 'qualquer')).toBe('Ganho no pagamento')
  })
})
