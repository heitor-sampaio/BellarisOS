import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { EntradaDaConfig, avisoDaFidelidade } from '@/lib/fidelidade/config'
import { EntradaDaRecompensa, avisoDaValidadeDoVoucher } from '@/lib/fidelidade/recompensa'
import { recusaDoPrazoDaOperadora, avisoDoPrazoDaOperadora } from '@/lib/financeiro/vezes-do-cartao'
import { EntradaDaMaquininha } from '@/lib/financeiro/maquininhas'
import { opcoesDeParcelas, recusaDoMaximoDeParcelas, avisoDoMaximoDeParcelas } from '@/lib/financeiro/parcelas-do-crediario'
import { EntradaDoPagamento, lancamentosDoPagamento } from '@/lib/checkout/lancamentos'
import { avisoAcimaDoComum } from '@/lib/acima-do-comum'

/**
 * O princípio 2 (o Heitor, 2026-11-04): "Não recusar o valor que a rede
 * escolheu (taxa, percentual, preço, prazo): no máximo, avisar. Só o que é
 * impossível (negativo, a rede errada, sem permissão) é recusado."
 *
 * Os tetos da fidelidade, do voucher, do prazo da operadora e do crediário
 * recusavam um valor que a rede escolheu. Agora: o impossível (negativo, zero
 * onde não cabe, fracionário, acima de 100%, acima do que o registro guarda)
 * continua recusado; acima do comum, a tela AVISA e o servidor grava.
 */

const RAIZ = join(__dirname, '..', '..', '..')

const valida = {
  enabled: true, earn_mode: 'POR_REAL', points_per_real: '1.5',
  redeem_points_value: '0.01', redeem_min_points: '0', redeem_max_pct: '100',
  expiry_months: null as string | null,
  birthday_bonus: '0', first_access_bonus: '0', client_redeem: false, expiry_notice_days: null as string | null,
}

describe('o aviso de "acima do comum"', () => {
  it('diz o comum e que o valor vale como está; no comum ou abaixo, nada', () => {
    expect(avisoAcimaDoComum(1001, 1000, 'pontos por R$ 1')).toBe('Acima do comum (mais de 1.000 pontos por R$ 1). Confira: o valor vale como está.')
    expect(avisoAcimaDoComum(1000, 1000, 'pontos por R$ 1')).toBeNull()
    expect(avisoAcimaDoComum(Number.NaN, 1000, 'dias')).toBeNull()
  })
})

describe('a fidelidade: acima do comum avisa, não recusa', () => {
  it('pontos por real acima de 1.000', () => {
    expect(EntradaDaConfig.parse({ ...valida, points_per_real: '5000' }).points_per_real).toBe(5000)
    expect(avisoDaFidelidade('points_per_real', 5000)).toMatch(/^Acima do comum \(mais de 1\.000 pontos por R\$ 1\)/)
    expect(avisoDaFidelidade('points_per_real', 1000)).toBeNull()
  })

  it('o bônus acima de 1.000.000 e o aviso acima de 90 dias', () => {
    const c = EntradaDaConfig.parse({ ...valida, birthday_bonus: '2000000', first_access_bonus: '2000000', expiry_months: '12', expiry_notice_days: '180' })
    expect([c.birthday_bonus, c.first_access_bonus, c.expiry_notice_days]).toEqual([2_000_000, 2_000_000, 180])
    expect(avisoDaFidelidade('birthday_bonus', 2_000_000)).not.toBeNull()
    expect(avisoDaFidelidade('expiry_notice_days', 180)).toMatch(/mais de 90 dias/)
    expect(avisoDaFidelidade('expiry_notice_days', 90)).toBeNull()
  })

  it('a validade dos pontos acima de 120 meses', () => {
    expect(EntradaDaConfig.parse({ ...valida, expiry_months: '240' }).expiry_months).toBe(240)
    expect(avisoDaFidelidade('expiry_months', 240)).toMatch(/mais de 120 meses/)
  })

  it('o valor do ponto, o mínimo e os pontos da indicação, acima do comum', () => {
    const c = EntradaDaConfig.parse({ ...valida, redeem_points_value: '2000', redeem_min_points: '2000000', indicacao_premio: 'PONTOS', indicacao_pontos: '2000000' })
    expect([c.redeem_points_value, c.redeem_min_points, c.indicacao_pontos]).toEqual([2000, 2_000_000, 2_000_000])
  })

  it('o impossível continua recusado: zero, negativo, fracionário, acima de 100% e acima do registro', () => {
    for (const taxa of ['0', '-1', 'abc', '100000000']) {
      expect(EntradaDaConfig.safeParse({ ...valida, points_per_real: taxa }).success, taxa).toBe(false)
    }
    expect(EntradaDaConfig.safeParse({ ...valida, redeem_max_pct: '101' }).success).toBe(false)
    for (const m of ['0', '1.5', '2147483648']) expect(EntradaDaConfig.safeParse({ ...valida, expiry_months: m }).success, m).toBe(false)
    for (const b of ['-1', '1.5', '2147483648']) expect(EntradaDaConfig.safeParse({ ...valida, birthday_bonus: b }).success, b).toBe(false)
    for (const d of ['0', '2.5']) expect(EntradaDaConfig.safeParse({ ...valida, expiry_notice_days: d }).success, d).toBe(false)
  })

  it('a tela mostra o aviso ao lado do campo', () => {
    const tela = readFileSync(join(__dirname, '..', 'components', 'admin', 'fidelidade-config.tsx'), 'utf8')
    expect(tela).toContain("aviso={avisoDaFidelidade('points_per_real'")
    expect(tela).toContain("aviso={avisoDaFidelidade('expiry_months'")
    expect(tela).toContain("aviso={avisoDaFidelidade('expiry_notice_days'")
    expect(tela).not.toContain('De 1 a 90 dias.')
  })
})

describe('o voucher: validade acima de 365 dias avisa, não recusa', () => {
  const base = { name: 'Limpeza grátis', points_cost: '100', validity_days: '30', is_active: true, type: 'DESCONTO_VALOR', discount_value: 10 }
  it('400 dias passa, com aviso', () => {
    expect(EntradaDaRecompensa.parse({ ...base, validity_days: '400' }).validity_days).toBe(400)
    expect(avisoDaValidadeDoVoucher(400)).toMatch(/mais de 365 dias/)
    expect(avisoDaValidadeDoVoucher(365)).toBeNull()
  })
  it('zero e acima do registro, não', () => {
    expect(EntradaDaRecompensa.safeParse({ ...base, validity_days: '0' }).success).toBe(false)
    expect(EntradaDaRecompensa.safeParse({ ...base, validity_days: '2147483648' }).success).toBe(false)
  })
  it('o campo da tela não tem mais o máximo de 365', () => {
    const tela = readFileSync(join(__dirname, '..', 'components', 'admin', 'fidelidade-catalogo.tsx'), 'utf8')
    expect(tela).not.toContain('max={365}')
    expect(tela).toContain('avisoDaValidadeDoVoucher(')
  })
})

describe('o prazo da operadora: acima de 120 dias avisa, não recusa', () => {
  it('180 dias passa, com aviso; zero e acima do registro, não', () => {
    expect(recusaDoPrazoDaOperadora(180)).toBeNull()
    expect(avisoDoPrazoDaOperadora(180)).toMatch(/mais de 120 dias/)
    expect(avisoDoPrazoDaOperadora(120)).toBeNull()
    expect(recusaDoPrazoDaOperadora(0)).toBe('O prazo da operadora é de pelo menos 1 dia.')
    expect(recusaDoPrazoDaOperadora(40000)).toMatch(/limite do registro/)
  })
  it('a maquininha grava 180 dias', () => {
    const r = EntradaDaMaquininha.safeParse({ nome: 'Stone', taxas: {}, maxVezes: null, prazoDias: 180, cobraPorBandeira: false, porBandeira: {} })
    expect(r.success).toBe(true)
  })
})

describe('o crediário: acima de 48 parcelas avisa, não recusa', () => {
  it('a rede escolhe 60 parcelas', () => {
    expect(recusaDoMaximoDeParcelas(60)).toBeNull()
    expect(avisoDoMaximoDeParcelas(60)).toMatch(/mais de 48 parcelas/)
    expect(avisoDoMaximoDeParcelas(48)).toBeNull()
    expect(recusaDoMaximoDeParcelas(0)).not.toBeNull()
    expect(recusaDoMaximoDeParcelas(1.5)).not.toBeNull()
    expect(opcoesDeParcelas(60)).toHaveLength(60)
  })
  it('a venda em 60 parcelas passa no schema e gera as 60', () => {
    const p = { forma: 'PARCELADO' as const, metodo: null, entrada: 0, parcelas: 60, primeiroVencimento: '2026-12-10T15:00:00.000Z' }
    expect(EntradaDoPagamento.safeParse(p).success).toBe(true)
    expect(lancamentosDoPagamento(6000, p, 'X')).toHaveLength(60)
  })
  it('o seletor da configuração não para em 48', () => {
    const tela = readFileSync(join(__dirname, '..', 'components', 'admin', 'settings-comissoes.tsx'), 'utf8')
    expect(tela).not.toContain('opcoesDeParcelas(TETO_DO_CREDIARIO)')
    expect(tela).toContain('avisoDoMaximoDeParcelas(')
  })
})

describe('o banco também não recusa acima do comum', () => {
  const dir = join(RAIZ, 'supabase', 'migrations')
  const sql = readdirSync(dir).filter(f => f.startsWith('202612042')).map(f => readFileSync(join(dir, f), 'utf8')).join('\n')
  it('as faixas viram só o impossível', () => {
    expect(sql).toContain('check (crediario_max_parcelas >= 1)')
    expect(sql).toContain('check (prazo_dias >= 1)')
    expect(sql).toContain('check (cartao_prazo_dias >= 1)')
    expect(sql).toContain('check (validity_days >= 1)')
    expect(sql).toContain('check (expiry_months is null or expiry_months >= 1)')
    expect(sql).toContain('check (expiry_notice_days is null or expiry_notice_days >= 1)')
    expect(sql).toContain('check (birthday_bonus >= 0)')
    expect(sql).toContain('check (first_access_bonus >= 0)')
    expect(sql).toContain('check (indicacao_pontos >= 0)')
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
