import { describe, it, expect } from 'vitest'
import { validarGrafo, podeAtivar, gatilhosDoGrafo } from '@/lib/automacoes/validar'
import type { GrafoDeAutomacao } from '@estetica-os/types'

/**
 * A conferência do grafo.
 *
 * É ela que separa "automação ligada" de "automação ligada e quebrada" — e o
 * segundo caso não avisa: o fluxo fica salvo, ativo e silencioso. Os casos
 * daqui são os que a tela não deixa ver de relance: o node solto, o anel, o
 * segundo gatilho.
 */

const gatilho = {
  id: 'g1', tipo: 'gatilho.evento' as const, pos: { x: 0, y: 0 },
  config: { evento: 'cliente.criado' },
}
const acao = {
  id: 'a1', tipo: 'acao.anotar' as const, pos: { x: 200, y: 0 },
  config: { texto: 'oi' },
}

const grafo = (g: Partial<GrafoDeAutomacao>): GrafoDeAutomacao => ({
  nos: [], ligacoes: [], ...g,
}) as GrafoDeAutomacao

describe('validarGrafo', () => {
  it('fluxo mínimo e ligado passa', () => {
    const g = grafo({ nos: [gatilho, acao], ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }] })
    expect(validarGrafo(g)).toEqual([])
    expect(podeAtivar(g)).toBe(true)
  })

  it('sem gatilho não liga', () => {
    const g = grafo({ nos: [acao] })
    expect(podeAtivar(g)).toBe(false)
    expect(validarGrafo(g)[0]!.mensagem).toMatch(/precisa de um gatilho/)
  })

  it('dois gatilhos não ligam', () => {
    // Pareceria "dispara nos dois casos", mas o motor entra por um só e a
    // outra metade do fluxo fica morta.
    const g = grafo({
      nos: [gatilho, { ...gatilho, id: 'g2' }, acao],
      ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }],
    })
    expect(validarGrafo(g).some(p => p.mensagem.includes('mais de um gatilho'))).toBe(true)
  })

  it('node solto é erro, não enfeite', () => {
    const g = grafo({ nos: [gatilho, acao] })
    expect(podeAtivar(g)).toBe(false)
    expect(validarGrafo(g).some(p => p.mensagem.includes('não está ligado ao fluxo'))).toBe(true)
  })

  it('campo obrigatório vazio é erro', () => {
    const g = grafo({
      nos: [{ ...gatilho, config: {} }, acao],
      ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }],
    })
    expect(validarGrafo(g).some(p => p.mensagem.includes('o evento que dispara'))).toBe(true)
  })

  it('anel é recusado antes de rodar', () => {
    // O executor tem teto de passos, mas descobrir o anel só na execução é
    // descobrir depois de repetir a ação até o teto bater.
    const g = grafo({
      nos: [gatilho, acao],
      ligacoes: [
        { id: 'l1', de: 'g1', para: 'a1' },
        { id: 'l2', de: 'a1', para: 'g1' },
      ],
    })
    expect(validarGrafo(g).some(p => p.mensagem.includes('volta para si mesmo'))).toBe(true)
  })

  it('condição sem nenhuma saída ligada é erro; com uma só, aviso', () => {
    const se = { id: 'c1', tipo: 'condicao.se' as const, pos: { x: 100, y: 0 }, config: {} }

    const solta = grafo({
      nos: [gatilho, se], ligacoes: [{ id: 'l1', de: 'g1', para: 'c1' }],
    })
    expect(validarGrafo(solta).some(p => p.grau === 'erro' && p.mensagem.includes('não leva a lugar nenhum'))).toBe(true)

    const umLado = grafo({
      nos: [gatilho, se, acao],
      ligacoes: [
        { id: 'l1', de: 'g1', para: 'c1' },
        { id: 'l2', de: 'c1', para: 'a1', saida: 'sim' },
      ],
    })
    const problemas = validarGrafo(umLado)
    expect(problemas.every(p => p.grau === 'aviso')).toBe(true)
    // Aviso não impede ligar: um IF com só o "sim" ligado é desenho legítimo.
    expect(podeAtivar(umLado)).toBe(true)
  })
})

describe('gatilhosDoGrafo', () => {
  it('extrai os nomes de evento, sem repetir', () => {
    const g = grafo({ nos: [gatilho, { ...gatilho, id: 'g2' }] })
    expect(gatilhosDoGrafo(g)).toEqual(['cliente.criado'])
  })

  it('gatilho sem evento escolhido não vira assinatura', () => {
    // Gravar '' em `gatilhos` faria o motor procurar por um evento de nome
    // vazio — e a automação nunca dispararia, sem dizer por quê.
    expect(gatilhosDoGrafo(grafo({ nos: [{ ...gatilho, config: {} }] }))).toEqual([])
  })
})
