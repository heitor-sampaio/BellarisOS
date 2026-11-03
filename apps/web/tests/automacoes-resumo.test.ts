import { describe, it, expect } from 'vitest'
import { NODES } from '@estetica-os/types'
import { resumoDoNo, rotuloDaSaida } from '@/lib/automacoes/resumo'

/**
 * J-15: o card do quadro dizia "1 dias" e as alças do "Se" mostravam a chave
 * crua do grafo ("sim", "nao"). O card é lido por quem opera a clínica, não por
 * quem escreveu o grafo.
 */
describe('o resumo do card concorda o número com a unidade', () => {
  it('esperar 1 dia, 2 dias, 1 hora, 1 minuto', () => {
    expect(resumoDoNo(NODES.ESPERA_DURACAO, { quantidade: 1, unidade: 'dias' })).toBe('1 dia')
    expect(resumoDoNo(NODES.ESPERA_DURACAO, { quantidade: 2, unidade: 'dias' })).toBe('2 dias')
    expect(resumoDoNo(NODES.ESPERA_DURACAO, { quantidade: 1, unidade: 'horas' })).toBe('1 hora')
    expect(resumoDoNo(NODES.ESPERA_DURACAO, { quantidade: 1, unidade: 'minutos' })).toBe('1 minuto')
    expect(resumoDoNo(NODES.ESPERA_DURACAO, { quantidade: 30, unidade: 'minutos' })).toBe('30 minutos')
  })

  it('buscar quem está sem retorno há 1 dia', () => {
    expect(resumoDoNo(NODES.BUSCAR_CLIENTES, { semRetornoHaDias: 1 })).toBe('sem retorno há 1 dia')
    expect(resumoDoNo(NODES.BUSCAR_CLIENTES, { semRetornoHaDias: 90 })).toBe('sem retorno há 90 dias')
  })

  it('a cada 1 minuto', () => {
    expect(resumoDoNo(NODES.GATILHO_AGENDA, { frequencia: 'minutos', intervalo: 1 })).toBe('a cada 1 minuto')
  })
})

describe('as alças do "Se" falam português', () => {
  it('"sim" vira Sim e "nao" vira Não', () => {
    expect(rotuloDaSaida('sim')).toBe('Sim')
    expect(rotuloDaSaida('nao')).toBe('Não')
  })

  it('o caso padrão do "Escolher por" também', () => {
    expect(rotuloDaSaida('padrao')).toBe('Padrão')
  })

  it('a chave de um caso escrito pela clínica passa como está', () => {
    expect(rotuloDaSaida('botox')).toBe('botox')
  })
})

/**
 * A14 da 5ª simulação: o card do "Se o procedimento" mostrava o campo cru
 * ("evento.dados.procedimentoNome é Botox").
 */
describe('o card do "Se" mostra o rótulo do campo, não o caminho', () => {
  it('campo do evento vira o rótulo do catálogo', () => {
    const grupo = { juncao: 'e' as const, regras: [{ campo: 'evento.dados.procedimentoNome', operador: 'igual' as const, valor: 'Botox' }] }
    expect(resumoDoNo(NODES.CONDICAO_SE, { grupo })).toBe('Procedimento é Botox')
  })
  it('campo de entidade leva o nome da entidade', () => {
    const grupo = { juncao: 'e' as const, regras: [{ campo: 'agendamento.status', operador: 'preenchido' as const }] }
    expect(resumoDoNo(NODES.CONDICAO_SE, { grupo })).toBe('Situação do agendamento está preenchido')
  })
  it('expressão escrita à mão passa como está', () => {
    const grupo = { juncao: 'e' as const, regras: [{ campo: "contem(evento.dados.texto, 'preço')", operador: 'preenchido' as const }] }
    expect(resumoDoNo(NODES.CONDICAO_SE, { grupo })).toBe("contem(evento.dados.texto, 'preço') está preenchido")
  })
})

describe('o card da mensagem diz o canal pelo nome', () => {
  it('push é "Aviso no celular", whatsapp é "WhatsApp"', () => {
    expect(resumoDoNo(NODES.ACAO_MENSAGEM, { canal: 'push', texto: 'Oi' })).toBe('Aviso no celular: Oi')
    expect(resumoDoNo(NODES.ACAO_MENSAGEM, { canal: 'whatsapp', texto: 'Oi' })).toBe('WhatsApp: Oi')
  })
})
