import { describe, it, expect, vi } from 'vitest'
import type { TenantContext } from '@estetica-os/types'

// O primeiro import() de actions/appointments carrega o núcleo e o Supabase.
vi.setConfig({ testTimeout: 60_000 })

/**
 * A refazer da B13 (Decisão B da 34ª simulação; PV-04, o Heitor, 2026-11-23: o
 * PDV recebe): com o PDV tirado do cargo e a tela do Receber ainda aberta, a
 * próxima ação recebe a recusa em texto ("Seu cargo não recebe pagamentos.") —
 * nunca "Algo deu errado". Nada lança: o Receber devolve `{ error }` (a tela
 * o mostra no `useActionState`), e o que a tela lê ao abrir devolve nulo.
 */
const semOPdv = { tenantId: 't1', branchId: 'b1', unidades: ['b1'], isNetworkAdmin: false, permissions: { financial: 'VIEW' } } as unknown as TenantContext

vi.mock('@/lib/auth', async orig => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getTenantContext: async () => semOPdv,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { throw new Error('sem o PDV, nada se lê do banco') },
}))

describe('o Receber sem o PDV no cargo', () => {
  it('confirmPayment devolve a recusa, sem lançar', async () => {
    const { confirmPayment } = await import('@/actions/appointments')
    const fd = new FormData()
    fd.set('appointment_id', '00000000-0000-4000-8000-000000000001')
    fd.set('payment_method', 'PIX')
    await expect(confirmPayment(null, fd)).resolves.toEqual({ error: 'Seu cargo não recebe pagamentos.' })
  })
  it('o que a tela lê ao abrir devolve nulo, sem lançar', async () => {
    const { previaDoPagamento } = await import('@/actions/appointments')
    const { trocaDePontosDoAtendimento } = await import('@/actions/fidelidade')
    const { abaterDoPacote } = await import('@/actions/a-receber')
    await expect(previaDoPagamento('00000000-0000-4000-8000-000000000001')).resolves.toBeNull()
    await expect(trocaDePontosDoAtendimento('00000000-0000-4000-8000-000000000001')).resolves.toBeNull()
    await expect(abaterDoPacote('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'))
      .resolves.toEqual({ error: 'Seu cargo não recebe pagamentos.' })
  })
})
