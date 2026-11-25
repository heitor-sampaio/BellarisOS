import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O valor do card da oportunidade.
 *
 * D1 [crm-inbox:OP-01, "o card tem … valor"; IM-07, o valor estimado entra
 * com o card; princípios 3 e 4]: o valor estimado (`leads.value`, gravado pela
 * importação e aceito por `updateLead`) nunca aparecia — o card mostrava a
 * soma dos preços dos procedimentos de interesse como se fosse o valor dela, e
 * a janela não tinha campo para informá-lo.
 * D2 [crm-inbox:OP-30, "mostra o valor VENDIDO"]: o card GANHO voltava ao
 * preço do procedimento: o vendido só se calculava com o card aberto
 * (`sugereGanho`), nas duas páginas.
 */

const WEB = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

const comprou = { proximoAgendamento: null, compraEm: '2026-11-20T15:00:00Z', compra: 'Pacote 3 limpezas', compraValor: 510 }
const lead = { created_at: '2026-11-10T12:00:00Z' }

describe('D2: o vendido não depende de o card estar aberto', () => {
  it('aberto: sugere o ganho e diz o vendido', async () => {
    const { compraNoCard } = await import('@/lib/crm/sinais-do-card')
    expect(compraNoCard(lead, comprou, 'OPEN')).toEqual({ compra: 'Pacote 3 limpezas', compraValor: 510 })
  })
  it('GANHO: não sugere mais nada, e segue dizendo o vendido', async () => {
    const { compraNoCard } = await import('@/lib/crm/sinais-do-card')
    expect(compraNoCard(lead, comprou, 'WON')).toEqual({ compra: null, compraValor: 510 })
  })
  it('perdido, ou a compra de antes da oportunidade: nada', async () => {
    const { compraNoCard } = await import('@/lib/crm/sinais-do-card')
    expect(compraNoCard(lead, comprou, 'LOST')).toEqual({ compra: null, compraValor: null })
    expect(compraNoCard({ created_at: '2026-11-21T00:00:00Z' }, comprou, 'WON')).toEqual({ compra: null, compraValor: null })
    expect(compraNoCard(lead, undefined, 'WON')).toEqual({ compra: null, compraValor: null })
  })
  it('as duas páginas usam a mesma função (nenhuma calcula o vendido por conta própria)', () => {
    for (const p of ['app/[slug]/oportunidades/page.tsx', 'app/admin/oportunidades/page.tsx']) {
      const t = fonte(p)
      expect(t, p).toContain('compraNoCard(')
      expect(t, p).not.toMatch(/compra_valor:\s*l\.client_id && sugereGanho/)
    }
  })
})

describe('D1: o valor estimado aparece e se informa', () => {
  it('o card: o vendido, senão o estimado, senão o preço de tabela — e diz qual é', async () => {
    const { valorDoCard } = await import('@/lib/crm/valor-do-card')
    const procs = [{ procedures: { price: 2200 } }]
    expect(valorDoCard({ compra_valor: 510, value: 1600, lead_procedures: procs })).toEqual({ valor: 510, tipo: 'vendido', rotulo: 'vendido' })
    expect(valorDoCard({ compra_valor: null, value: 1600, lead_procedures: procs })).toEqual({ valor: 1600, tipo: 'estimado', rotulo: 'estimado' })
    expect(valorDoCard({ value: '1300.00', lead_procedures: [] })).toEqual({ valor: 1300, tipo: 'estimado', rotulo: 'estimado' })
    expect(valorDoCard({ value: null, lead_procedures: procs })).toEqual({ valor: 2200, tipo: 'tabela', rotulo: 'de tabela' })
    expect(valorDoCard({ value: null, lead_procedures: [{ procedures: null }] })).toBeNull()
  })
  it('o valor digitado: vazio é nulo, o ilegível e o negativo são recusados (não apagam o que estava)', async () => {
    const { lerValorEstimado } = await import('@/lib/crm/valor-do-card')
    expect(lerValorEstimado('1.600,00')).toEqual({ valor: 1600 })
    expect(lerValorEstimado('900')).toEqual({ valor: 900 })
    expect(lerValorEstimado('')).toEqual({ valor: null })
    expect(lerValorEstimado(null)).toEqual({ valor: null })
    expect(lerValorEstimado('12,3x')).toHaveProperty('error')
    expect(lerValorEstimado('-10')).toHaveProperty('error')
  })
  it('as páginas leem o valor, o card o mostra, e a janela tem o campo', () => {
    for (const p of ['app/[slug]/oportunidades/page.tsx', 'app/admin/oportunidades/page.tsx']) {
      expect(fonte(p), p).toMatch(/crm_stage_id, notes, client_id, created_at, value,/)
    }
    const board = fonte('components/branch/crm-board.tsx')
    expect(board).toContain('valorDoCard(lead)')
    expect(board).toContain('data-valor-do-card')
    expect(board).not.toMatch(/const totalValue = lead\.lead_procedures\.reduce/)
    const modal = fonte('components/branch/crm-lead-modal.tsx')
    expect(modal).toMatch(/name="value"/)
    expect(modal).toContain('Valor estimado')
  })
  it('criar e editar a oportunidade gravam o valor (e a linha do tempo diz a troca)', () => {
    const acoes = fonte('actions/leads.ts')
    const criar = acoes.slice(acoes.indexOf('export async function createLead('), acoes.indexOf('export async function fichaDoTelefoneDoLead('))
    expect(criar).toContain("lerValorEstimado(str(formData, 'value'))")
    expect(criar).toMatch(/valor:\s*valorEstimado/)
    expect(fonte('lib/lead-events.ts')).toMatch(/value:\s+'Valor estimado'/)
  })
})
