import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D14 da simulação de 2026-10-28: no mapa de injetáveis aberto FORA de um
 * atendimento, "Confirmar aplicação" dizia "Aplicação confirmada" — mas era
 * só estado da tela: salvar e recarregar devolvia o botão, e "Aplicações do
 * cliente (0)". É REGRA que a aplicação congelada (`injectable_applications`)
 * só nasce por "Registrar aplicação" DENTRO de um atendimento.
 *
 * Decisão do Heitor: fora do atendimento o mapa não oferece "Confirmar
 * aplicação" (nada de dizer "confirmada" sem gravar); no lugar, uma linha que
 * diz que a aplicação se registra no atendimento. Dentro dele, tudo como era.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let mapa = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ij${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`ijp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  cliente = await rede.criarCliente('Toxina')
  const { data, error } = await db().from('injectable_maps').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, name: `[e2e] Toxina terço superior ${marca}`,
    view: 'rosto_f',
    points: [{ id: 'p1', x: 0.5, y: 0.3, product: 'Toxina botulínica', dose: 20, unit: 'UI', applied: null, view: 'rosto_f' }],
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  mapa = data!.id
})
test.afterAll(async () => {
  if (cliente) await db().from('injectable_applications').delete().eq('client_id', cliente)
  if (rede) {
    await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('fora do atendimento, o mapa não oferece "Confirmar aplicação": diz que a aplicação se registra no atendimento', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/injetaveis/${mapa}`)
    await expect(p.getByText('Aplicações do cliente (0)')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Confirmar aplicação' }), 'nada de "confirmar" que não grava').toHaveCount(0)
    await expect(p.getByText(/A aplicação se registra no atendimento/)).toBeVisible()
    await expect(p.getByText('Aplicação confirmada', { exact: false })).toHaveCount(0)
  })
})

test('dentro do atendimento continua: confirma, ajusta e registra a aplicação', async ({ browser }) => {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${ag!.id}`)
    await p.getByRole('main').getByRole('button', { name: 'Planejamento' }).click()
    const janela = p.getByRole('dialog')
    await janela.getByText('Injetáveis', { exact: true }).click()
    await janela.getByText(`Toxina terço superior ${marca}`).click()
    await janela.getByRole('button', { name: 'Confirmar aplicação' }).click()
    await expect(janela.getByText('Aplicação confirmada', { exact: false })).toBeVisible()
    await janela.getByRole('button', { name: 'Registrar aplicação' }).click()
    await expect(janela.getByText('Aplicação registrada neste atendimento.')).toBeVisible()
  })
  const { data: aplicacoes } = await db().from('injectable_applications').select('appointment_id').eq('client_id', cliente)
  expect(aplicacoes).toEqual([{ appointment_id: ag!.id }])
})
