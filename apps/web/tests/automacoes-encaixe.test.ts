import { describe, it, expect } from 'vitest'
import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'
import { encaixarPasso } from '@/lib/automacoes/encaixe'

/** J-14: o passo novo nasce ligado ao anterior, sem desfazer nada que já existe. */

const no = (id: string, tipo: string, x = 0, y = 0) => ({ id, tipo, pos: { x, y }, config: {} }) as GrafoDeAutomacao['nos'][number]

describe('encaixarPasso', () => {
  it('o primeiro passo nasce solto', () => {
    expect(encaixarPasso({ nos: [], ligacoes: [] }, NODES.GATILHO_EVENTO, null)).toEqual({ pos: { x: 80, y: 120 } })
  })

  it('liga ao anterior aberto no painel, à direita dele', () => {
    const g = { nos: [no('g', NODES.GATILHO_EVENTO, 80, 120), no('x', NODES.ACAO_ANOTAR, 80, 400)], ligacoes: [] }
    expect(encaixarPasso(g, NODES.CONDICAO_SE, 'g')).toEqual({ pos: { x: 360, y: 120 }, ligacao: { de: 'g' } })
  })

  it('sem nenhum aberto, o anterior é o último que entrou', () => {
    const g = { nos: [no('g', NODES.GATILHO_EVENTO), no('s', NODES.CONDICAO_SE, 280, 0)], ligacoes: [{ id: 'l', de: 'g', para: 's' }] }
    expect(encaixarPasso(g, NODES.ACAO_ANOTAR, null).ligacao).toEqual({ de: 's', saida: 'sim' })
  })

  it('no "Se", a Sim primeiro e depois a Não, cada uma na sua altura', () => {
    const g: GrafoDeAutomacao = {
      nos: [no('s', NODES.CONDICAO_SE, 0, 0), no('a', NODES.ACAO_ANOTAR, 280, 0)],
      ligacoes: [{ id: 'l', de: 's', para: 'a', saida: 'sim' }],
    }
    expect(encaixarPasso(g, NODES.ACAO_ANOTAR, 's')).toEqual({ pos: { x: 280, y: 150 }, ligacao: { de: 's', saida: 'nao' } })
  })

  it('gatilho não tem entrada: nasce solto', () => {
    const g = { nos: [no('a', NODES.ACAO_ANOTAR)], ligacoes: [] }
    expect(encaixarPasso(g, NODES.GATILHO_EVENTO, 'a').ligacao).toBeUndefined()
  })

  it('saída já usada não é trocada: nasce solto, abaixo do que já está lá', () => {
    const g: GrafoDeAutomacao = {
      nos: [no('g', NODES.GATILHO_EVENTO, 0, 0), no('a', NODES.ACAO_ANOTAR, 280, 0)],
      ligacoes: [{ id: 'l', de: 'g', para: 'a' }],
    }
    expect(encaixarPasso(g, NODES.ACAO_ANOTAR, 'g')).toEqual({ pos: { x: 280, y: 150 } })
  })
})
