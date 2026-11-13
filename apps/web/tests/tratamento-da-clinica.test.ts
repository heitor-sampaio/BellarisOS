import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { TenantContext } from '@estetica-os/types'
import { alcancaOTratamento, alcancaOCaixaDoTratamento } from '@/lib/tratamento/alcance'

/**
 * F73 (D3 da 14ª simulação; H5, CLAUDE.md §5): o tratamento que a cliente
 * comprou — pacote, plano fechado, pré-pago — é da CLÍNICA. Ver e agendar as
 * sessões vale em qualquer unidade da rede; cancelar e estornar seguem presos
 * à unidade do caixa. As duas regras moram em `lib/tratamento/alcance.ts`, e
 * cada action escolhe UMA pelo nome — a que voltar a usar `alcancaUnidade`
 * com a unidade da venda para listar ou agendar é a sobra de volta.
 */
const RAIZ = path.resolve(__dirname, '..')

/** O corpo de uma função de primeiro nível do arquivo (até a próxima do mesmo nível). */
function corpo(arquivo: string, nome: string): string {
  const texto = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8')
  const m = new RegExp(`\\n(export )?(async )?function ${nome}\\b`).exec(texto)
  if (!m) throw new Error(`${arquivo}: função ${nome} não encontrada`)
  const resto = texto.slice(m.index + 1)
  const fim = resto.slice(1).search(/\n(export )?(async )?function |\nexport const |\nconst [A-Z]/)
  return fim < 0 ? resto : resto.slice(0, fim + 1)
}

const VER_E_AGENDAR: [string, string][] = [
  ['actions/appointments.ts', 'getPlannedSessionAppointments'],
  ['actions/appointments.ts', 'getClientPackageSessions'],
  ['actions/appointments.ts', 'schedulePackageSessionInterno'],
  ['actions/appointments.ts', 'schedulePlanSessionInterno'],
  ['actions/pre-pago.ts', 'agendarUnidadePrePaga'],
  ['actions/treatment-plans.ts', 'planoDaClinica'],
]

const O_DINHEIRO: [string, string][] = [
  ['actions/pacotes.ts', 'pacoteDaClienteAoAlcance'],
  ['actions/treatment-plans.ts', 'planoFechadoAoAlcance'],
  ['actions/pre-pago.ts', 'unidadeAoAlcance'],
]

describe('ver e agendar as sessões é da clínica; o dinheiro, do caixa', () => {
  it.each(VER_E_AGENDAR)('%s → %s confere a REDE (alcancaOTratamento), não a unidade da venda', (arquivo, nome) => {
    const c = corpo(arquivo, nome)
    expect(c, 'use alcancaOTratamento (lib/tratamento/alcance.ts)').toMatch(/alcancaOTratamento\(/)
    expect(c, 'a unidade da venda não tranca ver nem agendar (H5)').not.toMatch(/alcancaUnidade\(/)
  })

  it.each(O_DINHEIRO)('%s → %s confere o CAIXA (alcancaOCaixaDoTratamento)', (arquivo, nome) => {
    expect(corpo(arquivo, nome)).toMatch(/alcancaOCaixaDoTratamento\(/)
  })

  it('a ficha de tratamento (a lista das sessões do plano) lê pelo plano da clínica', () => {
    expect(corpo('actions/treatment-plans.ts', 'getTreatmentPlanDetails')).toMatch(/planoDaClinica\(/)
  })
})

function ctx(over: Partial<TenantContext>): TenantContext {
  return { tenantId: 'rede-1', branchId: null, ...over } as TenantContext
}

describe('as duas regras', () => {
  it('ver e agendar: qualquer membro da rede, de qualquer unidade', () => {
    expect(alcancaOTratamento(ctx({ branchId: 'pampulha' }), 'rede-1')).toBe(true)
    expect(alcancaOTratamento(ctx({ branchId: null }), 'rede-1')).toBe(true)
    expect(alcancaOTratamento(ctx({ branchId: 'pampulha' }), 'outra-rede')).toBe(false)
    expect(alcancaOTratamento(ctx({ branchId: 'pampulha' }), null)).toBe(false)
  })

  it('o dinheiro: só quem alcança a unidade da venda', () => {
    expect(alcancaOCaixaDoTratamento(ctx({ branchId: 'pampulha' }), 'rede-1', 'savassi')).toBe(false)
    expect(alcancaOCaixaDoTratamento(ctx({ branchId: 'savassi' }), 'rede-1', 'savassi')).toBe(true)
    expect(alcancaOCaixaDoTratamento(ctx({ branchId: null }), 'rede-1', 'savassi')).toBe(true)
    expect(alcancaOCaixaDoTratamento(ctx({ branchId: null }), 'outra-rede', 'savassi')).toBe(false)
  })
})
