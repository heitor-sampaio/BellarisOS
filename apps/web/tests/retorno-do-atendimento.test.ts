import { describe, it, expect } from 'vitest'
import { lerRetornoEmDias, RETORNO_MAXIMO_DIAS } from '@/lib/atendimento/retorno'
import { EVENTOS, ROTULOS_DE_EVENTO, CAMPOS_DO_EVENTO } from '@estetica-os/types'

/**
 * D-12 (decisão do Heitor, 2026-10-29): "Fazer o campo 'Retorno em N dias' no
 * atendimento. Ele vira lembrete à recepção e gatilho de automação."
 */
describe('o campo "Retorno em N dias"', () => {
  it('vazio é sem retorno (o campo é opcional)', () => {
    expect(lerRetornoEmDias('')).toEqual({ dias: null })
    expect(lerRetornoEmDias(null)).toEqual({ dias: null })
    expect(lerRetornoEmDias('   ')).toEqual({ dias: null })
  })

  it('um número inteiro de dias', () => {
    expect(lerRetornoEmDias('15')).toEqual({ dias: 15 })
    expect(lerRetornoEmDias(' 30 ')).toEqual({ dias: 30 })
  })

  it('zero, negativo, fracionado, texto ou mais de dois anos são recusados', () => {
    for (const v of ['0', '-3', '1.5', '2,5', 'quinze', String(RETORNO_MAXIMO_DIAS + 1)]) {
      expect(lerRetornoEmDias(v), v).toHaveProperty('erro')
    }
    expect(lerRetornoEmDias(String(RETORNO_MAXIMO_DIAS))).toEqual({ dias: RETORNO_MAXIMO_DIAS })
  })
})

describe('o gatilho "Retorno vencendo"', () => {
  it('está no catálogo de eventos, com o rótulo do Heitor', () => {
    expect(EVENTOS.AGENDAMENTO_RETORNO_VENCENDO).toBe('agendamento.retorno_vencendo')
    expect(ROTULOS_DE_EVENTO['agendamento.retorno_vencendo']).toBe('Retorno vencendo')
  })

  it('carrega o procedimento — é por ele que o "Se" decide', () => {
    const campos = CAMPOS_DO_EVENTO['agendamento.retorno_vencendo'].map(c => c.caminho)
    expect(campos).toContain('evento.dados.procedimentoNome')
    expect(campos).toContain('evento.dados.retornoEmDias')
    expect(campos).toContain('evento.dados.retornoPara')
  })
})
