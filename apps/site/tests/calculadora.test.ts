import { describe, it, expect } from 'vitest'
import { recomendar, orcar, escolhasDaCalculadora, type Necessidade } from '@/lib/calculadora'
import type { PlanoDoSite } from '@/lib/planos'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * A calculadora do site (2026-10-19, pedido do Heitor): a pessoa diz o tamanho
 * da clínica e a página diz o plano. "Mais adequado" é o de MENOR TOTAL por mês
 * que cabe — contando os adicionais que o plano vende (número de WhatsApp
 * extra, Copilot avulso), não só o preço do plano. Os números são os do
 * sistema; aqui, os mesmos planos que estão no ar hoje.
 */
type Funcs = PlanoDoSite['recursos']['funcionalidades']
const todas = FUNCIONALIDADES.map(f => f.chave) as Funcs
const sem = (...fora: string[]) => todas.filter(c => !fora.includes(c)) as Funcs

const starter: PlanoDoSite = {
  nome: 'Starter', descricao: null, valorCentavos: 19900, ordem: 0,
  recursos: {
    funcionalidades: sem('copilot'), limites: { unidades: 1, membros: null, whatsapp: 1 },
    adicionais: { copilot: { valor_centavos: 29900 }, whatsapp: { valor_centavos: 3900 } },
  },
}
const pro: PlanoDoSite = {
  nome: 'PRO', descricao: null, valorCentavos: 29900, ordem: 1,
  recursos: {
    funcionalidades: sem('copilot'), limites: { unidades: 5, membros: null, whatsapp: 5 },
    adicionais: { copilot: { valor_centavos: 24900 }, whatsapp: { valor_centavos: 1900 } },
  },
}
const ultra: PlanoDoSite = {
  nome: 'ULTRA', descricao: null, valorCentavos: 49900, ordem: 2,
  recursos: {
    funcionalidades: todas, limites: { unidades: null, membros: null, whatsapp: 5 },
    adicionais: { whatsapp: { valor_centavos: 990 } },
  },
}
const PLANOS = [starter, pro, ultra]
const n = (o: Partial<Necessidade>): Necessidade => ({ unidades: 1, pessoas: 3, whatsapp: 1, funcionalidades: [], ...o })
const indicado = (o: Partial<Necessidade>) => recomendar(PLANOS, n(o)).indicado

describe('a calculadora indica o plano de menor total que cabe', () => {
  it('a clínica pequena: o Starter, pelo preço dele', () => {
    expect(indicado({})).toMatchObject({ plano: 'Starter', totalCentavos: 19900 })
  })

  it('o número extra conta: com 2 números, o Starter com um extra ainda é o menor', () => {
    const r = indicado({ whatsapp: 2 })
    expect(r).toMatchObject({ plano: 'Starter', totalCentavos: 23800 })
    expect(r!.itens).toEqual([
      { rotulo: 'Plano Starter', centavos: 19900 },
      { rotulo: '1 número de WhatsApp extra', centavos: 3900 },
    ])
  })

  it('com 4 números, os extras do Starter passam do PRO', () => {
    expect(indicado({ whatsapp: 4 })).toMatchObject({ plano: 'PRO', totalCentavos: 29900 })
  })

  it('mais unidades do que os planos com limite: o ULTRA', () => {
    expect(indicado({ unidades: 6, whatsapp: 2 })).toMatchObject({ plano: 'ULTRA', totalCentavos: 49900 })
  })

  it('o Copilot conta: avulso no Starter, ou incluído no ULTRA — o menor total', () => {
    const r = indicado({ funcionalidades: ['copilot'] })
    expect(r).toMatchObject({ plano: 'Starter', totalCentavos: 49800 })
    expect(r!.itens).toContainEqual({ rotulo: 'Copilot', centavos: 29900 })
    // Com duas unidades, o PRO + Copilot (548) passa do ULTRA (499).
    expect(indicado({ unidades: 2, funcionalidades: ['copilot'] })).toMatchObject({ plano: 'ULTRA', totalCentavos: 49900 })
  })

  // Não há teto de números extras (decisão do Heitor, 2026-10-19): passar de 15
  // fazia a indicação sumir — nenhum plano cabia.
  it('o número extra não tem teto: com 16 números, ainda há indicação', () => {
    expect(orcar(starter, n({ whatsapp: 16 }))).toMatchObject({ plano: 'Starter', cabe: true, totalCentavos: 19900 + 15 * 3900 })
    expect(indicado({ whatsapp: 16 })).toMatchObject({ plano: 'PRO', totalCentavos: 29900 + 11 * 1900 })
    expect(indicado({ whatsapp: 60 })).toMatchObject({ plano: 'ULTRA', totalCentavos: 49900 + 55 * 990 })
  })

  it('cada plano que não cabe diz por quê', () => {
    const { todos } = recomendar(PLANOS, n({ unidades: 6 }))
    expect(todos.find(o => o.plano === 'Starter')).toEqual({ plano: 'Starter', cabe: false, motivo: 'Até 1 unidade' })
    expect(todos.find(o => o.plano === 'PRO')).toEqual({ plano: 'PRO', cabe: false, motivo: 'Até 5 unidades' })
  })

  it('o limite de equipe vale quando o plano tem', () => {
    const enxuto = { ...starter, recursos: { ...starter.recursos, limites: { ...starter.recursos.limites, membros: 5 } } }
    expect(orcar(enxuto, n({ pessoas: 8 }))).toEqual({ plano: 'Starter', cabe: false, motivo: 'Até 5 pessoas na equipe' })
  })

  it('funcionalidade fora do plano, sem adicional que a venda: não cabe', () => {
    const semInjetaveis = { ...pro, recursos: { ...pro.recursos, funcionalidades: sem('copilot', 'injetaveis') } }
    expect(orcar(semInjetaveis, n({ funcionalidades: ['injetaveis'] })))
      .toEqual({ plano: 'PRO', cabe: false, motivo: 'Sem Planejador de injetáveis' })
  })

  it('nenhum cabe: nada indicado', () => {
    expect(recomendar([starter], n({ unidades: 2 })).indicado).toBeNull()
  })
})

describe('o que a calculadora pergunta além do tamanho', () => {
  it('só o que muda o preço ou o plano (hoje, o Copilot): algum plano não inclui, e algum oferece', () => {
    expect(escolhasDaCalculadora(PLANOS).map(e => e.chave)).toEqual(['copilot'])
    // Nenhum dos dois inclui, mas os dois vendem à parte: muda o total.
    expect(escolhasDaCalculadora([starter, pro]).map(e => e.chave)).toEqual(['copilot'])
    // Todos incluem tudo: nada a perguntar.
    expect(escolhasDaCalculadora([ultra])).toEqual([])
  })
})
