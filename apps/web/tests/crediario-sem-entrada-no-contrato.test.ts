import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pagamentoValido, pedeAFormaAgora } from '@/lib/checkout/pagamento-valido'
import { EntradaDoPagamento } from '@/lib/checkout/lancamentos'
import { TETO_DO_CREDIARIO } from '@/lib/financeiro/parcelas-do-crediario'

// D2 da 35ª: o crediário SEM entrada era recusado no contrato do plano com
// "Forma de pagamento inválida." — a tela manda `metodo: null` (nada entra
// agora), e o validador do contrato exigia a forma no PARCELADO. CR-01 / PDV8
// (o Heitor, 13/11: "o crediario é uma forma de pagamento"): sem entrada,
// nenhuma forma é pedida; com entrada, a forma da entrada.
describe('o crediário sem entrada passa no contrato, como no PDV (CR-01)', () => {
  const venc = '2026-12-10T15:00:00.000Z'
  const sem = { forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 4, primeiroVencimento: venc }

  it('sem entrada, sem forma: válido (o mesmo que o PDV aceita)', () => {
    expect(EntradaDoPagamento.safeParse(sem).success).toBe(true)
    expect(pagamentoValido(sem, TETO_DO_CREDIARIO)).toBe(true)
    expect(pagamentoValido({ forma: 'PARCELADO', entrada: 0, parcelas: 4, primeiroVencimento: venc }, TETO_DO_CREDIARIO)).toBe(true)
  })

  it('com entrada, a forma dela continua pedida; o resto da forma, conferido', () => {
    expect(pagamentoValido({ ...sem, entrada: 100 }, TETO_DO_CREDIARIO)).toBe(false)
    expect(pagamentoValido({ ...sem, entrada: 100, metodo: 'PIX' }, TETO_DO_CREDIARIO)).toBe(true)
    expect(pagamentoValido({ ...sem, metodo: 'PIX', entrada: -5 }, TETO_DO_CREDIARIO)).toBe(false)
    expect(pagamentoValido({ ...sem, parcelas: 0 }, TETO_DO_CREDIARIO)).toBe(false)
    expect(pagamentoValido({ ...sem, primeiroVencimento: 'x' }, TETO_DO_CREDIARIO)).toBe(false)
    expect(pagamentoValido({ forma: 'AVISTA', metodo: null }, TETO_DO_CREDIARIO)).toBe(false)
  })

  it('o que entra agora pede a forma: o à vista e a entrada; o crediário sem entrada e o a receber, não', () => {
    expect(pedeAFormaAgora({ forma: 'AVISTA', metodo: 'PIX' })).toBe(true)
    expect(pedeAFormaAgora({ forma: 'PARCELADO', metodo: null, entrada: 50, parcelas: 2, primeiroVencimento: venc })).toBe(true)
    expect(pedeAFormaAgora({ forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 2, primeiroVencimento: venc })).toBe(false)
    expect(pedeAFormaAgora({ forma: 'A_RECEBER', vencimento: null })).toBe(false)
    expect(pedeAFormaAgora(null)).toBe(false)
  })

  it('o recebimento do plano (checkoutTreatmentPlan) pede a forma só do que entra agora', () => {
    const src = readFileSync(join(__dirname, '..', 'actions', 'treatment-plans.ts'), 'utf8')
    expect(src).toMatch(/if \(pedeAFormaAgora\(pagamento\) && !pagamento\.metodo\) return \{ error: 'Escolha a forma de pagamento\.' \}/)
    expect(src).not.toMatch(/pagamento\.forma !== 'A_RECEBER' && !pagamento\.metodo/)
  })

  it('o contrato usa o validador de lib/checkout (sem cópia própria em actions/documentos.ts)', () => {
    const src = readFileSync(join(__dirname, '..', 'actions', 'documentos.ts'), 'utf8')
    expect(src).not.toMatch(/function pagamentoValido/)
    expect(src).toMatch(/import \{[^}]*pagamentoValido[^}]*\} from '@\/lib\/checkout\/pagamento-valido'/)
  })
})
