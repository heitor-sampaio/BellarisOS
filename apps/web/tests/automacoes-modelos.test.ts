import { describe, it, expect } from 'vitest'
import { EVENTOS, NODES } from '@estetica-os/types'
import type { ConfigCondicaoSe, ConfigGatilhoEvento, GrafoDeAutomacao } from '@estetica-os/types'
import { MODELOS_DE_AUTOMACAO, modeloDeAutomacao, semWhatsapp } from '@/lib/automacoes/modelos'
import { validarGrafo } from '@/lib/automacoes/validar'
import { filtrosDaBusca } from '@/lib/automacoes/tempo'
import { resumoDoNo } from '@/lib/automacoes/resumo'

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

  it('o de agendou leva o card: começa no agendamento criado e pede a etapa antes de ligar (crm-05)', () => {
    // "Não existe movimento automático padrão nos funis" — quem quer o card
    // andando ao agendar liga este modelo e escolhe a etapa do SEU funil.
    const grafo = modeloDeAutomacao('agendou-move-o-card')!.grafo()
    expect(grafo.nos.map(n => n.tipo)).toEqual([NODES.GATILHO_EVENTO, NODES.ACAO_MOVER_ETAPA])
    expect(grafo.nos[0]!.config).toEqual({ evento: 'agendamento.criado' })
    const erros = validarGrafo(grafo).filter(p => p.grau === 'erro').map(p => p.mensagem)
    expect(erros.some(m => /etapa de destino/.test(m))).toBe(true)
  })

  it('a regra do "Se" sem valor não deixa ligar: a rede escolhe o procedimento antes', () => {
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

/**
 * AU1 (a revisão do Heitor, 2026-11-13: "concordo"): os gatilhos da campanha
 * automática que saiu (MK1) viram modelos aqui — vencimento de pacote,
 * confirmação, cancelamento e pontos de fidelidade (aniversário, lembrete e
 * pós-visita já existiam). Cada um usa só fatos e passos do catálogo, nasce
 * rascunho (princípio 6) e manda mensagem à cliente pelo canal da rede.
 */
describe('AU1: os modelos que chegam da campanha automática', () => {
  const doFato = (chave: string) => {
    const grafo = modeloDeAutomacao(chave)!.grafo()
    return { grafo, gatilho: grafo.nos.find(n => n.tipo === NODES.GATILHO_EVENTO)?.config as ConfigGatilhoEvento | undefined }
  }

  it('existem os quatro', () => {
    const chaves = MODELOS_DE_AUTOMACAO.map(m => m.chave)
    expect(chaves).toEqual(expect.arrayContaining([
      'vencimento-de-pacote', 'confirmacao-do-agendamento', 'cancelamento-do-agendamento', 'pontos-de-fidelidade',
    ]))
  })

  it.each([
    ['confirmacao-do-agendamento', EVENTOS.AGENDAMENTO_CONFIRMADO],
    ['cancelamento-do-agendamento', EVENTOS.AGENDAMENTO_CANCELADO],
    ['pontos-de-fidelidade', EVENTOS.FIDELIDADE_PONTOS_GANHOS],
  ])('%s começa no fato %s e manda a mensagem à cliente', (chave, evento) => {
    const { grafo, gatilho } = doFato(chave)
    expect(gatilho).toEqual({ evento })
    expect(grafo.nos.map(n => n.tipo)).toEqual([NODES.GATILHO_EVENTO, NODES.ACAO_MENSAGEM])
    const erros = validarGrafo(grafo).filter(p => p.grau === 'erro')
    expect(erros, 'nasce pronto: só falta a rede ligar').toEqual([])
  })

  it('a mensagem dos pontos diz quantos ganhou e o saldo, pelos campos do fato', () => {
    const { grafo } = doFato('pontos-de-fidelidade')
    const texto = (grafo.nos.find(n => n.tipo === NODES.ACAO_MENSAGEM)!.config as { texto: string }).texto
    expect(texto).toContain('{{evento.dados.pontos}}')
    expect(texto).toContain('{{evento.dados.saldo}}')
  })

  it('o vencimento de pacote roda pelo relógio e busca quem tem pacote vencendo daqui a N dias', () => {
    const { grafo } = doFato('vencimento-de-pacote')
    expect(grafo.nos.map(n => n.tipo)).toEqual([NODES.GATILHO_AGENDA, NODES.BUSCAR_CLIENTES, NODES.ACAO_MENSAGEM])
    expect(grafo.nos[0]!.config).toMatchObject({ frequencia: 'diaria', hora: '09:00' })
    expect(grafo.nos[1]!.config).toMatchObject({ pacoteVenceEmDias: 7 })
    // O texto não promete o número de dias: a rede muda a busca, e a mensagem
    // não pode passar a mentir (princípio 3).
    const texto = (grafo.nos[2]!.config as { texto: string }).texto
    expect(texto).not.toMatch(/\d+ dias/)
    expect(validarGrafo(grafo).filter(p => p.grau === 'erro')).toEqual([])
  })
})

describe('AU1: o passo "Buscar clientes" acha quem tem pacote vencendo', () => {
  it('o filtro é o dia de daqui a N dias, inteiro, no relógio da rede', () => {
    const agora = new Date('2026-11-14T15:00:00Z') // 12:00 em Brasília
    const f = filtrosDaBusca({ pacoteVenceEmDias: 7 }, 'America/Sao_Paulo', agora)
    expect(f.pacote_vence_de).toBe('2026-11-21T03:00:00.000Z')
    expect(f.pacote_vence_ate).toBe('2026-11-22T02:59:59.999Z')
    expect(filtrosDaBusca({}, 'America/Sao_Paulo', agora).pacote_vence_de).toBeUndefined()
  })

  it('o card do passo diz o que a busca faz', () => {
    expect(resumoDoNo(NODES.BUSCAR_CLIENTES, { pacoteVenceEmDias: 7 })).toBe('pacote vencendo daqui a 7 dias')
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

/** A14: a rede sem WhatsApp conectado recebe o modelo com o aviso no celular. */
describe('o modelo numa rede sem WhatsApp', () => {
  it('troca o canal whatsapp por push em todas as mensagens, e só nelas', () => {
    for (const m of MODELOS_DE_AUTOMACAO) {
      const grafo = semWhatsapp(m.grafo())
      for (const no of grafo.nos.filter(n => n.tipo === NODES.ACAO_MENSAGEM)) {
        expect((no.config as { canal: string }).canal, m.chave).toBe('push')
      }
      expect(grafo.nos.length).toBe(m.grafo().nos.length)
    }
  })
})
