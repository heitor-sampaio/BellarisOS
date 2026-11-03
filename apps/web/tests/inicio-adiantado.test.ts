import { describe, it, expect } from 'vitest'
import { perguntaDoInicioAdiantado } from '@/lib/appointments/inicio-adiantado'

const agora = new Date('2026-11-03T14:07:00.000Z') // 11:07 em Brasília

describe('perguntaDoInicioAdiantado (A32)', () => {
  it('1h53 antes: pergunta', () =>
    expect(perguntaDoInicioAdiantado('2026-11-03T16:00:00.000Z', agora)).toBe('O atendimento está marcado para as 13:00 — faltam 1 h 53 min. Iniciar mesmo assim?'))
  it('45 min antes: pergunta', () =>
    expect(perguntaDoInicioAdiantado('2026-11-03T14:52:00.000Z', agora)).toBe('O atendimento está marcado para as 11:52 — faltam 45 min. Iniciar mesmo assim?'))
  it('até 30 min antes: inicia sem perguntar', () => expect(perguntaDoInicioAdiantado('2026-11-03T14:37:00.000Z', agora)).toBeNull())
  it('atrasado: inicia sem perguntar', () => expect(perguntaDoInicioAdiantado('2026-11-03T13:00:00.000Z', agora)).toBeNull())
  it('sem horário: nada', () => expect(perguntaDoInicioAdiantado(null, agora)).toBeNull())
})
