import { describe, it, expect } from 'vitest'
import { NODES, type ConfigCondicaoSe } from '@estetica-os/types'
import { MODELOS_DE_AUTOMACAO, modeloDeAutomacao } from '@/lib/automacoes/modelos'
import { validarGrafo } from '@/lib/automacoes/validar'
import { resumoDoNo } from '@/lib/automacoes/resumo'

// A18 da 11ª simulação (2026-11-10): o modelo "Lembrete antes do agendamento"
// mostrava "Esperar até 1d antes de evento.dados.agendadoPara" e "Situação não
// é nenhum de CANCELLED, NO_SHOW, COMPLETED", e avisava "Só um lado da condição
// está ligado" num modelo que a tela diz pronto (princípio 3).
describe('A18 da 11ª: o modelo diz em português o que faz', () => {
  const grafo = modeloDeAutomacao('lembrete-antes-do-agendamento')!.grafo()
  const espera = grafo.nos.find(n => n.tipo === NODES.ESPERA_ATE)!
  const se = grafo.nos.find(n => n.tipo === NODES.CONDICAO_SE)!

  it('a espera diz o campo pelo nome e o tempo por extenso', () => {
    const t = resumoDoNo(NODES.ESPERA_ATE, espera.config as Record<string, unknown>)
    expect(t).toBe('1 dia antes de “Data e hora do agendamento”')
    expect(resumoDoNo(NODES.ESPERA_ATE, { campo: 'evento.dados.agendadoPara', minutos: 120 })).toBe('2 horas depois de “Data e hora do agendamento”')
  })
  it('a condição diz as situações em português', () => {
    const t = resumoDoNo(NODES.CONDICAO_SE, se.config as Record<string, unknown>)
    expect(t).toContain('Cancelado, Não compareceu, Concluído')
    expect(t).not.toMatch(/CANCELLED|NO_SHOW|COMPLETED/)
  })
  it('nenhum modelo pronto avisa "só um lado ligado" quando o outro lado termina de propósito', () => {
    for (const m of MODELOS_DE_AUTOMACAO) {
      const avisos = validarGrafo(m.grafo()).filter(p => /Só um lado da condição/.test(p.mensagem))
      expect(avisos, m.chave).toEqual([])
    }
  })
  it('o fluxo montado à mão com um lado solto continua avisando', () => {
    const solto = { ...grafo, nos: grafo.nos.map(n => n.tipo === NODES.CONDICAO_SE ? { ...n, config: { grupo: (se.config as ConfigCondicaoSe).grupo } } : n) }
    expect(validarGrafo(solto).some(p => /Só um lado da condição/.test(p.mensagem))).toBe(true)
  })
})

// A19 da 11ª: não havia modelo de reativação — a Marta montou uma campanha
// que só sairia no aniversário de quem sumiu (D8). O modelo nasce como todo
// modelo: RASCUNHO, desligado (princípio 6).
describe('A19 da 11ª: o modelo de reativação', () => {
  it('existe, roda pelo relógio uma vez por mês e busca quem está sem visita há mais de 60 dias', () => {
    const m = modeloDeAutomacao('reativacao')
    expect(m).toBeTruthy()
    const grafo = m!.grafo()
    expect(grafo.nos.map(n => n.tipo)).toEqual([NODES.GATILHO_AGENDA, NODES.BUSCAR_CLIENTES, NODES.ACAO_MENSAGEM])
    expect(grafo.nos[0]!.config).toMatchObject({ frequencia: 'mensal', diaDoMes: 1, hora: '09:00' })
    expect(grafo.nos[1]!.config).toMatchObject({ semRetornoHaDias: 60 })
    expect(m!.descricao).toMatch(/mês seguinte/)
    expect(validarGrafo(grafo).filter(p => p.grau === 'erro')).toEqual([])
  })
})
