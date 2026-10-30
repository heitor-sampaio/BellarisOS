import { describe, it, expect } from 'vitest'
import { EVENTOS, NODES } from '@estetica-os/types'
import type { ConfigCondicaoSe, ConfigGatilhoEvento, GrafoDeAutomacao } from '@estetica-os/types'
import { MODELOS_DE_AUTOMACAO, modeloDeAutomacao } from '@/lib/automacoes/modelos'
import { validarGrafo } from '@/lib/automacoes/validar'

/**
 * D-4: modelos prontos de automação, ao lado do "começar vazia". O modelo usa
 * só gatilhos, condições e ações que já existem no catálogo, e nasce com o
 * fluxo inteiro LIGADO — o que falta é só o que é da clínica decidir.
 */
describe('os modelos prontos de automação', () => {
  it('há o de aniversário, o de retorno depois do atendimento e o de lembrete antes do agendamento', () => {
    const chaves = MODELOS_DE_AUTOMACAO.map(m => m.chave)
    expect(chaves).toEqual(expect.arrayContaining(['aniversario', 'retorno-depois-do-atendimento', 'lembrete-antes-do-agendamento']))
    for (const m of MODELOS_DE_AUTOMACAO) {
      expect(m.nome.length, m.chave).toBeGreaterThan(3)
      expect(m.descricao.length, m.chave).toBeGreaterThan(20)
    }
  })

  it.each(MODELOS_DE_AUTOMACAO.map(m => [m.chave]))('%s: um gatilho só, nada solto, nada circular, sem nome repetido', chave => {
    const grafo = modeloDeAutomacao(chave)!.grafo()
    const erros = validarGrafo(grafo).filter(p => p.grau === 'erro').map(p => p.mensagem)
    const estruturais = erros.filter(m => /gatilho|não está ligado|volta para si|dois passos|não leva a lugar/.test(m))
    expect(estruturais).toEqual([])
  })

  it.each(MODELOS_DE_AUTOMACAO.map(m => [m.chave]))('%s: o evento do gatilho existe no catálogo', chave => {
    const grafo = modeloDeAutomacao(chave)!.grafo()
    const gatilho = grafo.nos.find(n => n.tipo === NODES.GATILHO_EVENTO)
    if (gatilho) {
      expect(Object.values(EVENTOS)).toContain((gatilho.config as ConfigGatilhoEvento).evento)
    }
  })

  it('o de aniversário roda pelo relógio e busca as aniversariantes do dia', () => {
    const grafo = modeloDeAutomacao('aniversario')!.grafo()
    expect(grafo.nos.map(n => n.tipo)).toEqual([NODES.GATILHO_AGENDA, NODES.BUSCAR_CLIENTES, NODES.ACAO_MENSAGEM])
    expect(grafo.nos[1]!.config).toMatchObject({ aniversarioHoje: true })
  })

  it('o de retorno começa no atendimento concluído e pergunta o procedimento no "Se", não no gatilho', () => {
    const grafo = modeloDeAutomacao('retorno-depois-do-atendimento')!.grafo()
    const gatilho = grafo.nos.find(n => n.tipo === NODES.GATILHO_EVENTO)!
    expect(gatilho.config).toEqual({ evento: 'agendamento.concluido' })
    const se = grafo.nos.find(n => n.tipo === NODES.CONDICAO_SE)!
    const regra = (se.config as ConfigCondicaoSe).grupo.regras[0]!
    expect(regra.campo).toMatch(/procedimento/i)
    // A saída Sim segue para a espera; o procedimento fica para a clínica escolher.
    expect(grafo.ligacoes.find(l => l.de === se.id)?.saida).toBe('sim')
  })

  it('a regra do "Se" sem valor não deixa ligar: a clínica escolhe o procedimento antes', () => {
    const grafo = modeloDeAutomacao('retorno-depois-do-atendimento')!.grafo()
    const erros = validarGrafo(grafo).filter(p => p.grau === 'erro').map(p => p.mensagem)
    expect(erros.some(m => /sem o valor|Procedimento/.test(m))).toBe(true)
  })

  it('cada chamada devolve um grafo novo (editar um não muda o modelo)', () => {
    const a = modeloDeAutomacao('aniversario')!.grafo()
    const b = modeloDeAutomacao('aniversario')!.grafo()
    expect(a).not.toBe(b)
    ;(a as GrafoDeAutomacao).nos.pop()
    expect(b.nos).toHaveLength(3)
  })

  it('chave desconhecida não tem modelo', () => {
    expect(modeloDeAutomacao('nao-existe')).toBeNull()
  })
})

describe('regra de condição sem valor', () => {
  const grafoCom = (valor: unknown, operador = 'igual'): GrafoDeAutomacao => ({
    nos: [
      { id: 'g', tipo: NODES.GATILHO_EVENTO, pos: { x: 0, y: 0 }, config: { evento: 'agendamento.concluido' } },
      { id: 's', tipo: NODES.CONDICAO_SE, pos: { x: 1, y: 0 },
        config: { grupo: { juncao: 'e', regras: [{ campo: 'agendamento.procedimento', operador, valor }] } } },
      { id: 'a', tipo: NODES.ACAO_ANOTAR, pos: { x: 2, y: 0 }, config: { texto: 'x' } },
    ],
    ligacoes: [{ id: 'l1', de: 'g', para: 's' }, { id: 'l2', de: 's', para: 'a', saida: 'sim' }],
  } as GrafoDeAutomacao)
  const erros = (g: GrafoDeAutomacao) => validarGrafo(g).filter(p => p.grau === 'erro').map(p => p.mensagem)

  it('"é" sem valor é erro; "está vazio" não precisa de valor', () => {
    expect(erros(grafoCom('')).some(m => /sem o valor/.test(m))).toBe(true)
    expect(erros(grafoCom([], 'em')).some(m => /sem o valor/.test(m))).toBe(true)
    expect(erros(grafoCom(undefined, 'vazio')).some(m => /sem o valor/.test(m))).toBe(false)
    expect(erros(grafoCom('Toxina')).some(m => /sem o valor/.test(m))).toBe(false)
  })
})
