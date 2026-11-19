import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { juntarEmRajada } from '@estetica-os/nucleo/lib/sinais-em-rajada'

/**
 * A tela que recarrega por sinal (o inbox, os sinos) espera a rajada passar
 * antes de ir ao servidor (19/11, ao Heitor: "o inbox que pode ter muita
 * atualização e vai atualizar toda rede"). Uma campanha de 300 mensagens são
 * centenas de sinais em poucos segundos: sem juntar, cada tela aberta faria
 * uma consulta por sinal. Juntando, faz uma por janela — e o último sinal da
 * rajada nunca se perde (é ele que dispara).
 */

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('juntarEmRajada', () => {
  it('uma rajada de sinais vira UMA chamada, depois da janela', () => {
    const fn = vi.fn()
    const r = juntarEmRajada(fn, 1000)
    for (let i = 0; i < 50; i++) { r.chamar(); vi.advanceTimersByTime(10) }
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('o sinal que chega depois da janela pede outra chamada (nada se perde)', () => {
    const fn = vi.fn()
    const r = juntarEmRajada(fn, 1000)
    r.chamar()
    vi.advanceTimersByTime(1000)
    r.chamar()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('uma rajada sem fim não adia para sempre: chama ao menos uma vez por janela', () => {
    const fn = vi.fn()
    const r = juntarEmRajada(fn, 1000)
    // Um sinal a cada 100 ms, por 5 s: a tela não pode ficar 5 s parada.
    for (let i = 0; i < 50; i++) { r.chamar(); vi.advanceTimersByTime(100) }
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(fn.mock.calls.length).toBeLessThanOrEqual(6)
  })

  it('cancelar descarta a chamada pendente (a tela saiu)', () => {
    const fn = vi.fn()
    const r = juntarEmRajada(fn, 1000)
    r.chamar()
    r.cancelar()
    vi.advanceTimersByTime(5000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('janela zero chama na hora', () => {
    const fn = vi.fn()
    const r = juntarEmRajada(fn, 0)
    r.chamar()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
