import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { montarSessoesDoPlano } from '@/lib/checkout/sessoes-do-plano'
import { totalDoPlanoNaLista } from '@/lib/plano-de-tratamento/desconto-combinado'

const raiz = path.join(__dirname, '..')
const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

/** O corpo de uma função exportada (até o próximo `export` do arquivo). */
function corpo(texto: string, nome: string): string {
  const i = texto.indexOf(`export async function ${nome}(`)
  expect(i, nome).toBeGreaterThanOrEqual(0)
  const fim = texto.indexOf('\nexport ', i + 10)
  return texto.slice(i, fim < 0 ? undefined : fim)
}

/**
 * D3 da 25ª: quem tem o PDV em Gerenciar e não tem o Atendimento não recebia o
 * plano — o checkout lia as sessões por `getTreatmentPlanSessions`, que pede o
 * Atendimento em Ver, e lançava "sem acesso". O PDV é de quem recebe
 * (`podeReceber`, PDV1): quem chama já conferiu; a leitura não confere de novo
 * pelo módulo do atendimento.
 */
describe('D3: o checkout do plano não depende do Atendimento', () => {
  it('montarCheckoutPlan lê as sessões sem a trava do Atendimento', () => {
    const t = ler('lib/checkout/plano-para-checkout.ts')
    expect(t).not.toMatch(/getTreatmentPlanSessions/)
    expect(t).toMatch(/sessoesDoPlanoParaCheckout\(/)
  })
  it('checkoutTreatmentPlan (o receber) também', () => {
    const t = corpo(ler('actions/treatment-plans.ts'), 'checkoutTreatmentPlan')
    expect(t).not.toMatch(/getTreatmentPlanSessions\(/)
  })
})

/**
 * D2 da 25ª (princípio 3; atendimento.md, o desconto combinado): o valor do
 * plano divergia entre telas — 480 na lista e no checkout, 420 no contrato e no
 * recebido.
 * - A lista somava o preço das sessões (o de TABELA antes do aceite) sem o
 *   combinado.
 * - O checkout mostrava as sessões já rateadas (420) e "Total: 480" (o
 *   subtotal de tabela, de onde o desconto parte).
 */
describe('D2: o mesmo valor do plano em toda tela', () => {
  const raw = [{
    id: 's1', sort_order: 0, appointment_id: null,
    treatment_plan_session_procedures: [
      { procedure_id: 'p1', price: 210, preco_tabela: 240, sort_order: 0, products: [], procedures: { name: 'A', duration_min: 30 } },
      { procedure_id: 'p2', price: 210, preco_tabela: 240, sort_order: 1, products: [], procedures: { name: 'B', duration_min: 30 } },
    ],
  }]
  it('no checkout, as sessões vêm ao preço de TABELA — fecham com o subtotal', () => {
    const [s] = montarSessoesDoPlano(raw, new Map(), new Map(), { precoDeTabela: true })
    expect(s!.totalPrice).toBe(480)
    expect(s!.procedures.map(p => p.price)).toEqual([240, 240])
  })
  it('no receber (o rateio), o preço gravado', () => {
    const [s] = montarSessoesDoPlano(raw, new Map(), new Map())
    expect(s!.totalPrice).toBe(420)
  })
  it('montarCheckoutPlan pede o preço de tabela', () => {
    expect(ler('lib/checkout/plano-para-checkout.ts')).toMatch(/precoDeTabela: true/)
  })
  it('o passo "Plano" do checkout diz o desconto e o total que fica', () => {
    const t = ler('components/branch/checkout-wizard.tsx')
    expect(t).toMatch(/data-desconto-do-plano/)
    expect(t).toMatch(/Total: \{fmtBRL\(contaDesc\.liquido\)\}/)
  })
  it('a lista: o plano ainda aberto vale com o combinado; o aceito, o gravado', () => {
    expect(totalDoPlanoNaLista('PROPOSED', 480, { tipo: 'VALOR', valor: 60 })).toBe(420)
    expect(totalDoPlanoNaLista('DRAFT', 1520, { tipo: 'VALOR', valor: 100 })).toBe(1420)
    expect(totalDoPlanoNaLista('PROPOSED', 480, null)).toBe(480)
    // Do aceite em diante o preço gravado já é o vendido (`plano_aceitar`).
    expect(totalDoPlanoNaLista('ACCEPTED', 420, { tipo: 'VALOR', valor: 60 })).toBe(420)
  })
  it('as duas listas usam a conta', () => {
    const t = ler('actions/treatment-plans.ts')
    expect(corpo(t, 'getPlanosDoCliente')).toMatch(/totalDoPlanoNaLista\(/)
    expect(corpo(t, 'listarPlanejamentos')).toMatch(/totalDoPlanoNaLista\(/)
  })
})
