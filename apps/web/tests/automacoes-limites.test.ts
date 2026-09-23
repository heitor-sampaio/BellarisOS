import { describe, it, expect } from 'vitest'
import { noSilencio, limitesDe } from '@/lib/automacoes/limites'

/**
 * O silêncio noturno.
 *
 * A faixa padrão (21:00 → 08:00) **atravessa a meia-noite**, e é aí que a
 * aritmética ingênua erra: comparar sempre com `>=` e `<=` daria "nunca é
 * noite" justamente no caso normal, e a automação mandaria mensagem às três da
 * manhã sem nada acusar.
 *
 * As horas são construídas em UTC e lidas no fuso do negócio: 00:00Z é 21:00
 * em São Paulo, que é exatamente o começo do silêncio.
 */

/** Um instante a partir da hora de BRASÍLIA (UTC-3). */
function emBrasilia(hora: number, minuto = 0): Date {
  return new Date(Date.UTC(2026, 8, 24, hora + 3, minuto))
}

const padrao = limitesDe({})

describe('noSilencio — faixa que atravessa a meia-noite', () => {
  it('21:00 já é silêncio; 20:59 ainda não', () => {
    expect(noSilencio(padrao, emBrasilia(21, 0)).dentro).toBe(true)
    expect(noSilencio(padrao, emBrasilia(20, 59)).dentro).toBe(false)
  })

  it('a madrugada continua sendo silêncio', () => {
    expect(noSilencio(padrao, emBrasilia(3)).dentro).toBe(true)
    expect(noSilencio(padrao, emBrasilia(7, 59)).dentro).toBe(true)
  })

  it('08:00 libera', () => {
    expect(noSilencio(padrao, emBrasilia(8, 0)).dentro).toBe(false)
    expect(noSilencio(padrao, emBrasilia(14)).dentro).toBe(false)
  })

  it('a hora de liberar é a próxima 08:00, não amanhã cedo por engano', () => {
    // 23h de hoje → faltam 9 horas.
    const r = noSilencio(padrao, emBrasilia(23))
    expect(r.dentro).toBe(true)
    expect(r.liberaEm!.getTime() - emBrasilia(23).getTime()).toBe(9 * 3600 * 1000)

    // 03h da madrugada → faltam 5 horas, no mesmo dia.
    const madrugada = noSilencio(padrao, emBrasilia(3))
    expect(madrugada.liberaEm!.getTime() - emBrasilia(3).getTime()).toBe(5 * 3600 * 1000)
  })
})

describe('noSilencio — faixa dentro do mesmo dia', () => {
  // Uma clínica que não queira mandar nada no horário de almoço.
  const almoco = limitesDe({ silencioDe: '12:00', silencioAte: '14:00' })

  it('respeita o intervalo sem dar a volta no dia', () => {
    expect(noSilencio(almoco, emBrasilia(13)).dentro).toBe(true)
    expect(noSilencio(almoco, emBrasilia(11, 59)).dentro).toBe(false)
    expect(noSilencio(almoco, emBrasilia(14)).dentro).toBe(false)
    expect(noSilencio(almoco, emBrasilia(23)).dentro).toBe(false)
  })
})

describe('noSilencio — configuração ausente ou inválida', () => {
  it('sem faixa configurada, nunca há silêncio', () => {
    expect(noSilencio({}, emBrasilia(3)).dentro).toBe(false)
  })

  it('hora malformada não vira silêncio permanente', () => {
    // O contrário seria pior que não ter limite: a automação nunca mandaria
    // nada, e o sintoma seria idêntico ao de "o gatilho não dispara".
    expect(noSilencio({ silencioDe: '25:00', silencioAte: '08:00' }, emBrasilia(3)).dentro).toBe(false)
    expect(noSilencio({ silencioDe: 'noite', silencioAte: 'manhã' }, emBrasilia(3)).dentro).toBe(false)
  })
})

describe('limitesDe', () => {
  it('preenche com o padrão conservador', () => {
    // Automação recém-criada não deveria depender de alguém lembrar de
    // configurar isto para não acordar cliente de madrugada.
    expect(limitesDe({})).toEqual({
      silencioDe: '21:00', silencioAte: '08:00', tetoPorClienteDia: 3,
    })
  })

  it('o que a clínica configurou vence o padrão', () => {
    expect(limitesDe({ tetoPorClienteDia: 1 }).tetoPorClienteDia).toBe(1)
  })
})
