import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D13 da simulação de 2026-10-20 (decisão do Heitor, 2026-10-22): o
 * atendimento concluído ANTES da hora marcada ficava fora dos indicadores até
 * essa hora — o eixo era `scheduled_at` e o período em andamento fecha em
 * "agora". Agora o atendimento conta quando ACONTECEU: na hora marcada, ou na
 * da conclusão se ela veio antes (`appointments.aconteceu_em`). O concluído
 * DEPOIS da hora (a profissional finalizou no dia seguinte) continua no dia
 * marcado — não muda de dia nem de mês.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
const agora = Date.now()
const em = (min: number) => new Date(agora + min * 60_000).toISOString()

test.beforeAll(async () => {
  rede = await criarOutraRede(`d13${marca}`)
  const cliente = await rede.criarCliente('Adiantada')
  const base = { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId, source: 'INTERNAL', duration_min: 30 }
  const { error } = await db().from('appointments').insert([
    // Marcado para daqui a 2h e concluído há 10 min: aconteceu agora.
    { ...base, status: 'COMPLETED', price: 180, scheduled_at: em(120), completed_at: em(-10) },
    // Marcado para ontem e concluído há 5 min (finalizou atrasado): é de ontem.
    { ...base, status: 'COMPLETED', price: 90, scheduled_at: em(-25 * 60), completed_at: em(-5) },
  ])
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await rede?.limpar()
})

test('o concluído antes da hora conta já; o concluído atrasado fica no dia marcado', async () => {
  const janela = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: em(-60), p_to: em(0) }

  const { data: core, error } = await db().rpc('metrics_core', janela)
  expect(error).toBeNull()
  expect(core?.[0]).toMatchObject({ appointments_completed: 1, service_revenue: 180 })

  const { data: prof } = await db().rpc('metrics_top_professionals', { ...janela, p_limit: 5 })
  expect(prof).toEqual([expect.objectContaining({ appointments: 1, revenue: 180 })])

  const { data: porUnidade } = await db().rpc('metrics_by_branch', { p_tenant: rede!.tenantId, p_from: janela.p_from, p_to: janela.p_to })
  expect(porUnidade?.find((b: { branch_id: string }) => b.branch_id === rede!.branchId)).toMatchObject({ appointments_completed: 1, service_revenue: 180 })

  const { data: vendas } = await db().rpc('metrics_vendas', janela)
  expect((vendas ?? []).filter((v: { tipo: string }) => v.tipo === 'PROCEDIMENTO')).toEqual([expect.objectContaining({ valor: 180 })])
})
