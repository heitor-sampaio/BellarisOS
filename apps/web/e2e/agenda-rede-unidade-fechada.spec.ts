import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A26 da 6ª simulação (2026-11-04): a agenda da REDE (/admin/agenda) não
 * sombreava a madrugada da Casa Forte, que estava fechada, ao lado da Boa
 * Viagem 24 h — e o encaixe das 03:00 ficava sem destaque nenhum depois.
 *
 * Agora cada coluna de unidade sombreia o que é fora do horário DELA, e o
 * agendamento que cai fora do horário da unidade leva "Encaixe".
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
let vinteEQuatro = ''
const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 2 * 86_400_000))
const todoDia = (de: string, ate: string) => ({ dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de, ate }]])) })

async function agendar(unidade: string, hhmm: string): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: unidade, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date(`${dia}T${hhmm}:00-03:00`).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`arf${marca}`)
  expect((await db().from('branches').update({ horario: todoDia('10:00', '18:00') }).eq('id', rede.branchId)).error).toBeNull()
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} 24h ${marca}`, slug: `e2e-arf2-${marca}`, horario: todoDia('00:00', '24:00') })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  vinteEQuatro = b!.id
  gestor = await criarMembro(`arfg${marca}`, { tenant: rede.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }] })
  cliente = await rede.criarCliente('Encaixe')
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().in('branch_id', [rede.branchId, vinteEQuatro])
  if (vinteEQuatro) await db().from('branches').delete().eq('id', vinteEQuatro)
  await gestor?.limpar(); await rede?.limpar()
})

test('cada unidade sombreia o próprio horário fechado, e o encaixe fica marcado', async ({ browser }) => {
  const madrugada = await agendar(rede!.branchId, '03:00')
  const noHorario = await agendar(rede!.branchId, '11:00')
  const na24h     = await agendar(vinteEQuatro, '03:00')
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/agenda?date=${dia}`)
    const fechada = p.locator(`[data-unidade="${rede!.branchId}"]`)
    await expect(fechada.locator('[data-fora-do-horario]').first(), 'a unidade de 10–18 sombreia a madrugada').toBeAttached()
    await expect(p.locator(`[data-unidade="${vinteEQuatro}"] [data-fora-do-horario]`), 'a de 24 h não sombreia nada').toHaveCount(0)

    await expect(p.locator(`[data-agendamento="${madrugada}"]`)).toHaveAttribute('data-encaixe', '')
    await expect(p.locator(`[data-agendamento="${madrugada}"]`)).toContainText('Encaixe')
    await expect(p.locator(`[data-agendamento="${noHorario}"]`)).not.toHaveAttribute('data-encaixe', '')
    await expect(p.locator(`[data-agendamento="${na24h}"]`), 'às 03:00 a 24 h está aberta').not.toHaveAttribute('data-encaixe', '')
  } finally { await ctx.close() }
})
