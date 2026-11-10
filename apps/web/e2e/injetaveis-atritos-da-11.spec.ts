import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A27 da 11ª simulação (2026-11-10, a Dra. Renata no celular): no mapa de
 * injetáveis, marcar um ponto rolava a folha até o formulário, e o toque
 * seguinte errava o alvo; a dica dizia "Role o mouse sobre a ilustração"; e o
 * botão de zoom cobria o "Masculino". Numa rede [e2e] própria, a 360 px com
 * toque.
 */

test.setTimeout(180_000)
test.use({ viewport: { width: 360, height: 860 }, hasTouch: true, isMobile: true })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let renata: MembroDeTeste
let mapa = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`inj11${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data, error } = await db().from('injectable_maps').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, name: `[e2e] Mapa A27 ${marca}`, view: 'rosto_f', points: [],
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  mapa = data!.id
  renata = await criarMembro(`inj11r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Medica',
    permissoes: [{ modulo: 'medical_records', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await renata?.limpar()
  await rede?.limpar()
})

const sobrepoe = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('A27: no celular, marcar pontos não rola a folha, a dica fala de toque e o zoom não cobre o "Masculino"', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: renata.estado, viewport: { width: 360, height: 860 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  try {
    await p.goto(`/admin/injetaveis/${mapa}`)
    const svg = p.locator('svg:has(image)').first()
    await expect(svg).toBeVisible()

    // O zoom não fica por cima da escolha "Masculino".
    const masculino = await p.getByRole('button', { name: 'Masculino' }).boundingBox()
    const zoom = await p.getByRole('button', { name: 'Aproximar' }).boundingBox()
    expect(masculino && zoom && !sobrepoe(masculino, zoom), 'o zoom cobre o "Masculino"').toBe(true)

    // A dica fala de toque, não de mouse.
    await expect(p.locator('[data-dica-do-mapa]')).toContainText('Toque')
    await expect(p.locator('[data-dica-do-mapa]')).not.toContainText('Role o mouse')

    // Dois toques seguidos: a ilustração fica onde estava, e os dois marcam.
    await svg.scrollIntoViewIfNeeded()
    const antes = await svg.boundingBox()
    await svg.tap({ position: { x: antes!.width * 0.4, y: antes!.height * 0.35 } })
    await expect(p.locator('[data-ponto-do-mapa]')).toHaveCount(1)
    const depois = await svg.boundingBox()
    expect(Math.abs(depois!.y - antes!.y), 'a folha rolou depois do toque').toBeLessThan(4)
    await svg.tap({ position: { x: antes!.width * 0.6, y: antes!.height * 0.35 } })
    await expect(p.locator('[data-ponto-do-mapa]')).toHaveCount(2)
  } finally {
    await ctx.close()
  }
})

test('A27: na folha do atendimento (o celular da médica), marcar não rola a folha e o próximo toque acerta', async ({ browser }) => {
  const slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const prof = await criarMembro(`inj11p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  try {
    expect((await db().from('users').update({ provides_services: true }).eq('id', prof.userId)).error).toBeNull()
    const cliente = await rede.criarCliente('Patricia A27')
    const { data: ag, error } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: prof.userId,
      status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
      scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    expect((await db().from('injectable_maps').insert({
      tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, name: `[e2e] Toxina A27 ${marca}`, view: 'rosto_f', points: [],
    })).error).toBeNull()

    const ctx = await browser.newContext({ storageState: prof.estado, viewport: { width: 360, height: 860 }, hasTouch: true, isMobile: true })
    const p = await ctx.newPage()
    try {
      await p.goto(`/${slug}/agenda/${ag!.id}`)
      await p.getByRole('main').getByRole('button', { name: 'Mapa de injetáveis' }).click()
      const janela = p.getByRole('dialog')
      await janela.getByText(`Toxina A27 ${marca}`).click()
      const svg = janela.locator('svg:has(image)').first()
      await expect(svg).toBeVisible()
      const masculino = await janela.getByRole('button', { name: 'Masculino' }).boundingBox()
      const zoom = await janela.getByRole('button', { name: 'Aproximar' }).boundingBox()
      expect(masculino && zoom && !sobrepoe(masculino, zoom), 'o zoom cobre o "Masculino"').toBe(true)
      await svg.scrollIntoViewIfNeeded()
      const antes = await svg.boundingBox()
      await svg.tap({ position: { x: antes!.width * 0.4, y: antes!.height * 0.35 } })
      await expect(janela.locator('[data-ponto-do-mapa]')).toHaveCount(1)
      const depois = await svg.boundingBox()
      expect(Math.abs(depois!.y - antes!.y), 'a folha rolou depois do toque').toBeLessThan(4)
      await svg.tap({ position: { x: antes!.width * 0.6, y: antes!.height * 0.35 } })
      await expect(janela.locator('[data-ponto-do-mapa]')).toHaveCount(2)
    } finally {
      await ctx.close()
    }
  } finally {
    await prof.limpar()
  }
})

test('A28: na folha do atendimento, a tela diz o que cada botão do mapa faz', async ({ browser }) => {
  const slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const prof = await criarMembro(`inj11q${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  try {
    const cliente = await rede.criarCliente('Helena A28')
    const { data: ag } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: prof.userId,
      status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
      scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    }).select('id').single<{ id: string }>()
    expect((await db().from('injectable_maps').insert({
      tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, name: `[e2e] Toxina A28 ${marca}`, view: 'rosto_f',
      points: [{ id: 'p1', x: 0.5, y: 0.3, product: 'Toxina', dose: 4, unit: 'UI', applied: null, view: 'rosto_f' }],
    })).error).toBeNull()
    const ctx = await browser.newContext({ storageState: prof.estado, viewport: { width: 1280, height: 900 } })
    const p = await ctx.newPage()
    try {
      await p.goto(`/${slug}/agenda/${ag!.id}`)
      await p.getByRole('main').getByRole('button', { name: 'Mapa de injetáveis' }).click()
      const janela = p.getByRole('dialog')
      await janela.getByText(`Toxina A28 ${marca}`).click()
      const linha = janela.locator('[data-o-que-cada-botao-faz]')
      await expect(linha).toContainText('Salvar planejamento guarda os pontos')
      await expect(linha).toContainText('Registrar aplicação grava neste atendimento')
      await expect(linha).toContainText('Confirmar aplicação copia a dose prevista')
    } finally {
      await ctx.close()
    }
  } finally {
    await prof.limpar()
  }
})
