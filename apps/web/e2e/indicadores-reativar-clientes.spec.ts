import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O dashboard da unidade. O caso de "Reativar clientes" pela função por unidade
 * saiu com ela (o Heitor, 25/11: "ok mas tenha certeza absoluta que não é usada"):
 * a tela usa a da rede, e "cliente nova não é cliente sumida" (2026-10-20) é
 * provado em `e2e/indicadores-reativar-clientes-da-rede.spec.ts`.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => { rede = await criarOutraRede(`rv${marca}`) })
test.afterAll(async () => { await rede?.limpar() })

test('o card do mês no dashboard da unidade: clientes no mês (não "funil de leads"), com o número de cada etapa', async ({ browser }) => {
  const { criarMembro } = await import('./apoio/sessao')
  const membro = await criarMembro(`rvm${marca}`, {
    // A Agenda em Ver: sem ela, o quadro não mostra as etapas da agenda (A32 da 24ª,
    // docs/regras/indicadores.md) — e este teste é do número de cada etapa.
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
  const cliente = await rede!.criarCliente('Do mês')
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date().toISOString(),
  })
  expect(error).toBeNull()
  const { data: un } = await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()
  const ctx = await browser.newContext({ storageState: membro.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${un!.slug}/dashboard`)
    await expect(p.getByRole('heading', { name: 'Clientes no mês' })).toBeVisible()
    await expect(p.getByText('Funil de oportunidades')).toHaveCount(0)
    await expect(p.locator('[data-etapa="Agendamentos"]'), 'o número aparece, fora da barra').toContainText('1')
    await expect(p.locator('[data-etapa="Concluídos"]'), 'o zero também').toContainText('0')
  } finally {
    await ctx.close()
    await membro.limpar()
  }
})
