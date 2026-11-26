import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A5 da 31ª simulação (vendas-financeiro:CR-05, AC-01; princípio 3), no app da
 * cliente: a parcela do plano seguia "Plano de tratamento — parcela 1/2", sem
 * dizer de quê. O PDV já diz os procedimentos (`lib/pdv/parcelas-da-cliente.ts`);
 * o Financeiro do app passa a dizer o mesmo, depois do nome do atendimento.
 */
const pagina = readFileSync(join(__dirname, '..', 'app/[slug]/cliente/financeiro/page.tsx'), 'utf8')

describe('A5: a parcela do plano no app diz os procedimentos do plano', () => {
  it('lê o plano do lançamento e os procedimentos dele', () => {
    const select = pagina.slice(pagina.indexOf(".from('financial_transactions')"), pagina.indexOf("'carregar os lançamentos do cliente'"))
    expect(select).toMatch(/treatment_plan_id/)
    expect(pagina).toMatch(/import \{ procedimentosDosPlanos \} from '@\/lib\/financeiro\/procedimentos-do-plano'/)
    expect(pagina).toMatch(/procedimentosDosPlanos\(\(data \?\? \[\]\)/)
  })
  it('o nome da linha: o do atendimento; sem ele, o do plano com os procedimentos', () => {
    expect(pagina).toMatch(/nomeDaLinhaDoLancamento\([^)]*\{ numero: r\.parcela_numero, total: r\.parcela_total, descricao: r\.description \}\)\s*\n?\s*\?\? \(r\.treatment_plan_id \? nomeDaLinhaDoPlano\(dosPlanos\.get\(r\.treatment_plan_id\) \?\? \[\], r\.description\) : null\)/)
  })
})
