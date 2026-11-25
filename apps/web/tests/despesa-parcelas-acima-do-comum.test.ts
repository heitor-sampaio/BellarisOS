import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  lerQuantidadeDaDespesa,
  recusaDasParcelasDaDespesa, avisoDasParcelasDaDespesa,
  recusaDasRepeticoesDaDespesa, avisoDasRepeticoesDaDespesa, limiteDasRepeticoes,
} from '@/lib/financeiro/despesa-agendada'
import { lancamentosDoPagamento } from '@/lib/checkout/lancamentos'

/**
 * O princípio 2 na despesa (o Heitor, 25/11, à pergunta se o "no máximo,
 * avisar" vale para os limites da despesa): "Se não for impossível, ainda que
 * improvável, pode ser feito."
 *
 * A despesa parcelada recusava acima de 48 parcelas, e a recorrente acima de 60
 * repetições. Agora acima disso (o comum) a tela AVISA e o servidor GRAVA. O
 * impossível (decisão do Claude, 25/11): menos de 2, fração, e acima de 1.200
 * — cada parcela ou repetição é um lançamento com a sua data, e 1.200 meses são
 * 100 anos (`LIMITE_DE_MESES`).
 *
 * E o banco: `financial_transactions_parcela_coerente` prendia `parcela_total`
 * em 48 — o crediário, que a rede já pode fazer em 60, seria recusado ao gravar.
 */

const RAIZ = join(__dirname, '..', '..', '..')
const fonte = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('a despesa parcelada: acima de 48 avisa, não recusa', () => {
  it('60 parcelas passam, com aviso; 48, sem aviso', () => {
    expect(recusaDasParcelasDaDespesa(60)).toBeNull()
    expect(avisoDasParcelasDaDespesa(60)).toBe('Acima do comum (mais de 48 parcelas). Confira: o valor vale como está.')
    expect(avisoDasParcelasDaDespesa(48)).toBeNull()
    expect(recusaDasParcelasDaDespesa(1200)).toBeNull()
  })
  it('o impossível continua recusado: 0, 1, fração, acima de 1.200', () => {
    for (const n of [0, 1, 1.5, -3, Number.NaN, 1201]) expect(recusaDasParcelasDaDespesa(n), String(n)).not.toBeNull()
    expect(recusaDasParcelasDaDespesa(1201)).toMatch(/1\.200/)
  })
})

describe('a despesa recorrente: acima de 60 avisa, não recusa', () => {
  it('120 repetições passam, com aviso; 60, sem aviso', () => {
    expect(recusaDasRepeticoesDaDespesa(120)).toBeNull()
    expect(avisoDasRepeticoesDaDespesa(120)).toBe('Acima do comum (mais de 60 repetições). Confira: o valor vale como está.')
    expect(avisoDasRepeticoesDaDespesa(60)).toBeNull()
    expect(recusaDasRepeticoesDaDespesa(1200)).toBeNull()
  })
  it('o impossível continua recusado: 0, 1, fração, acima de 1.200', () => {
    for (const n of [0, 1, 1.5, -3, Number.NaN, 1201]) expect(recusaDasRepeticoesDaDespesa(n), String(n)).not.toBeNull()
    expect(recusaDasRepeticoesDaDespesa(1201)).toMatch(/1\.200/)
  })
  // O impossível é a ÚLTIMA data passar de 100 anos, e isso depende da frequência: 1.200 repetições semanais são
  // 23 anos (improvável, não impossível); 1.200 anuais, 1.200 anos.
  it('o limite das repetições são 100 anos na frequência escolhida', () => {
    expect(limiteDasRepeticoes('weekly')).toBe(5214)
    expect(limiteDasRepeticoes('biweekly')).toBe(2607)
    expect(limiteDasRepeticoes('monthly')).toBe(1200)
    expect(limiteDasRepeticoes('bimonthly')).toBe(600)
    expect(limiteDasRepeticoes('quarterly')).toBe(400)
    expect(limiteDasRepeticoes('yearly')).toBe(100)
    expect(recusaDasRepeticoesDaDespesa(2000, 'weekly')).toBeNull()
    expect(recusaDasRepeticoesDaDespesa(101, 'yearly')).toBe('No máximo 100 repetições anuais (100 anos, o limite das datas).')
    expect(recusaDasRepeticoesDaDespesa(5215, 'weekly')).toBe('No máximo 5.214 repetições semanais (100 anos, o limite das datas).')
  })
  it('a action confere pela frequência escolhida, e o campo para no limite dela', () => {
    expect(fonte('actions', 'financial.ts')).toContain('recusaDasRepeticoesDaDespesa(count, freq)')
    expect(fonte('components', 'branch', 'financial-transaction-modal.tsx')).toContain('max={limiteDasRepeticoes(recurringFreq)}')
  })
})

describe('o número do formulário se lê sem arredondar', () => {
  it('"1.5" não vira 1 (o parseInt cortava a fração calado)', () => {
    expect(lerQuantidadeDaDespesa('60')).toBe(60)
    expect(lerQuantidadeDaDespesa(' 120 ')).toBe(120)
    expect(Number.isInteger(lerQuantidadeDaDespesa('1.5'))).toBe(false)
    expect(Number.isNaN(lerQuantidadeDaDespesa(''))).toBe(true)
    expect(Number.isNaN(lerQuantidadeDaDespesa(null))).toBe(true)
    expect(Number.isNaN(lerQuantidadeDaDespesa('abc'))).toBe(true)
  })
})

describe('o servidor grava acima do comum', () => {
  const acao = fonte('actions', 'financial.ts')
  it('a action não tem mais o teto de 48 nem o de 60', () => {
    expect(acao).not.toContain('count > 48')
    expect(acao).not.toContain('count > 60')
    expect(acao).not.toContain('(2–48)')
    expect(acao).not.toContain('(2–60)')
  })
  it('a action confere pela regra única, lendo o número sem arredondar', () => {
    expect(acao).toContain('recusaDasParcelasDaDespesa(')
    expect(acao).toContain('recusaDasRepeticoesDaDespesa(')
    expect(acao).not.toMatch(/parseInt\(str\(formData, '(installment|recurring)_count'\)/)
  })
})

describe('a tela avisa ao lado do campo', () => {
  const tela = fonte('components', 'branch', 'financial-transaction-modal.tsx')
  it('os campos não param em 48 nem em 60', () => {
    expect(tela).not.toContain('max={48}')
    expect(tela).not.toContain('max={60}')
  })
  it('o aviso das parcelas e o das repetições', () => {
    expect(tela).toContain('avisoDasParcelasDaDespesa(')
    expect(tela).toContain('avisoDasRepeticoesDaDespesa(')
  })
})

describe('o banco não recusa a parcela acima de 48', () => {
  const dir = join(RAIZ, 'supabase', 'migrations')
  it('a migration solta o teto da trava da parcela e fica com o coerente', () => {
    const nova = readFileSync(join(dir, '20261206900001_despesa_e_crediario_parcelas_acima_do_comum.sql'), 'utf8')
    expect(nova).toContain('drop constraint if exists financial_transactions_parcela_coerente')
    expect(nova).toContain('parcela_total >= 1 and parcela_numero between 1 and parcela_total')
    expect(nova).not.toMatch(/between 1 and 48/)
    expect(nova).not.toMatch(/create policy/i)
    expect(nova.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('o crediário em 60 vezes cabe na ÚLTIMA definição da trava', () => {
    const p = { forma: 'PARCELADO' as const, metodo: null, entrada: 0, parcelas: 60, primeiroVencimento: '2026-12-10T15:00:00.000Z' }
    const maior = Math.max(...lancamentosDoPagamento(6000, p, 'X').map(l => Number(l.parcela_total ?? 0)))
    expect(maior).toBe(60)
    const ultima = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
      .map(f => readFileSync(join(dir, f), 'utf8'))
      .filter(sql => /add constraint financial_transactions_parcela_coerente/.test(sql))
      .at(-1)!
    const teto = ultima.match(/parcela_total between \d+ and (\d+)/)
    expect(teto === null || Number(teto[1]) >= maior, `a trava prende em ${teto?.[1]}`).toBe(true)
  })
})

describe('o contrato do plano aceita o crediário acima de 48', () => {
  it('a forma do pagamento não para em 48 (o limite é o da rede, conferido depois)', () => {
    const docs = fonte('actions', 'documentos.ts')
    expect(docs).not.toMatch(/x\.parcelas as number\) <= 48/)
    expect(docs).toContain('TETO_DO_CREDIARIO')
  })
})
