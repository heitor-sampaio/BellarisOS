import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext } from '@estetica-os/types'

// O primeiro import() de actions/appointments carrega o núcleo e o Supabase.
vi.setConfig({ testTimeout: 60_000 })

/**
 * O "próximo horário livre" procura com a duração INTEIRA do atendimento
 * (princípio 3: cortar em silêncio é defeito). O procedimento não tem duração
 * máxima, e o agendamento soma as durações — mas a busca cortava em 8 h
 * (`Math.min(…, 480)`): o atendimento de 10 h recebia como "livre" um horário
 * em que só cabiam 8. A busca continua terminando: são 14 dias, no máximo
 * (`lib/agenda/proximo-livre.ts`).
 */

const duracoesPedidas: number[] = []
vi.mock('@/lib/appointments/core', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/core')>()),
  conferirPecasDoAgendamento: async () => null,
  computeAvailableSlots: async (_a: unknown, _b: string, _p: string, data: string, duracao: number) => {
    duracoesPedidas.push(duracao)
    return data === '2026-12-11' ? ['08:00'] : []
  },
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
  lerFusoDaUnidade: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/auth', async orig => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getTenantContext: async () => ({ tenantId: 't1', branchId: null, unidades: null, isNetworkAdmin: true } as unknown as TenantContext),
  assertPermission: () => {},
  alcancaUnidade: () => true,
}))

describe('proximoHorarioLivre (a action do Agendar)', () => {
  beforeEach(() => { duracoesPedidas.length = 0 })

  it('o atendimento de 10 h procura horário em que cabem as 10 h', async () => {
    vi.useFakeTimers({ now: new Date('2026-12-10T12:00:00-03:00'), toFake: ['Date'] })
    try {
      const { proximoHorarioLivre } = await import('@/actions/appointments')
      expect(await proximoHorarioLivre('b1', 'u1', 600)).toBe('2026-12-11T08:00')
      expect(duracoesPedidas.length).toBeGreaterThan(0)
      expect(new Set(duracoesPedidas)).toEqual(new Set([600]))
    } finally {
      vi.useRealTimers()
    }
  })

  it('sem livre nenhum, a busca termina (14 dias) e devolve nulo', async () => {
    vi.useFakeTimers({ now: new Date('2026-12-20T12:00:00-03:00'), toFake: ['Date'] })
    try {
      const { proximoHorarioLivre } = await import('@/actions/appointments')
      expect(await proximoHorarioLivre('b1', 'u1', 30 * 60)).toBeNull()
      expect(duracoesPedidas).toHaveLength(14)
      expect(new Set(duracoesPedidas)).toEqual(new Set([1800]))
    } finally {
      vi.useRealTimers()
    }
  })
})
