import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { totaisQueSeComparam, divergenciasDaBaixa } from '@/lib/injetaveis/dose'

/**
 * A1 da 33ª simulação e a Decisão A (decisão do Claude, 26/11, princípio 5:
 * "Sem execução, sem valor"): na Avaliação da A01, o "Finalizar" oferecia
 * "Incluir 50 UI na baixa" com o planejamento da Toxina, que era para outro
 * agendamento. O planejamento não é consumo: sem aplicação registrada neste
 * atendimento (PT-13), ele só se compara com o insumo que ESTE atendimento tem
 * no cartão (o planejamento da Toxina numa sessão de Toxina, A36 da 5ª,
 * `e2e/injetaveis-produto-do-estoque.spec.ts`). O produto que o atendimento não
 * usa é planejamento para outro dia: nem aviso, nem "Incluir na baixa". A
 * aplicação registrada aqui se compara sempre (PT-18).
 */
const toxina = { product: 'Toxina', unit: 'UI', total: 50 }
const estoque = [{ id: 'tx', name: 'Toxina', unit: 'UI' }, { id: 'luva', name: 'Luva', unit: 'par' }]

describe('totaisQueSeComparam', () => {
  it('o planejamento da Toxina numa Avaliação (sem a Toxina no cartão) não se compara', () => {
    const totais = totaisQueSeComparam([{ ...toxina, origem: 'PLANEJAMENTO' }], [{ name: 'Luva' }])
    expect(totais).toEqual([])
    expect(divergenciasDaBaixa(totais, [], estoque), 'sem "Incluir 50 UI na baixa"').toEqual([])
  })
  it('o planejamento numa sessão que usa o produto (no cartão, marcado ou não) segue comparado', () =>
    expect(totaisQueSeComparam([{ ...toxina, origem: 'PLANEJAMENTO' }], [{ name: ' toxina ' }])).toEqual([toxina]))
  it('a aplicação registrada neste atendimento se compara sempre', () =>
    expect(totaisQueSeComparam([{ ...toxina, origem: 'APLICACAO' }], [])).toEqual([toxina]))
})

describe('a janela do "Finalizar" e as doses do mapa', () => {
  const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
  it('a janela compara só os totais que se comparam, com os insumos do cartão', () => {
    const tela = ler('components/branch/appointment-session.tsx')
    expect(tela).toMatch(/divergenciasDaBaixa\(totaisQueSeComparam\(totaisDoMapa, insumosDoCartao\), insumos, estoque\)/)
    expect(tela).toMatch(/insumosDoCartao=\{insumos\}/)
  })
  it('as doses do mapa dizem de onde vêm (a aplicação ou o planejamento)', () => {
    const acao = ler('actions/injectable-map.ts')
    const i = acao.indexOf('export async function dosesDoMapaDoAtendimento')
    const corpo = acao.slice(i, acao.indexOf('\nexport ', i + 10))
    expect(corpo).toMatch(/origem: 'APLICACAO'/)
    expect(corpo).toMatch(/origem: 'PLANEJAMENTO'/)
  })
})
