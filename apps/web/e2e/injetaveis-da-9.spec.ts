import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os injetáveis na 9ª simulação (2026-11-07), da F42:
 * - D14: "Registrar aplicação" gravava de novo a cada clique (a Marina ficou com
 *   2 aplicações iguais de 56 UI, e o "Finalizar" somava as duas). Registrada,
 *   o botão vira "Atualizar a aplicação registrada", e o servidor não duplica o
 *   mesmo mapa no mesmo atendimento.
 * - A10: o mapa ficava fora da sessão — era preciso ir ao menu Injetáveis. A
 *   tela do atendimento abre e cria o mapa ali mesmo ("Injetáveis").
 * - D17: `/injetaveis` sem o prontuário respondia HTTP 500 (a trava no LAYOUT,
 *   fora do Suspense da página); as outras telas negadas dão 200.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Uma cliente com um atendimento em curso da profissional e, se pedido, um mapa dela. */
async function atendimento(rotulo: string, comMapa = true) {
  const cliente = await rede!.criarCliente(rotulo)
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  let mapa = ''
  if (comMapa) {
    const m = await db().from('injectable_maps').insert({
      tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, name: `[e2e] Toxina ${rotulo} ${marca}`, view: 'rosto_f',
      points: [{ id: 'p1', x: 0.5, y: 0.3, product: 'Toxina', dose: 28, unit: 'UI', applied: null, view: 'rosto_f' },
        { id: 'p2', x: 0.4, y: 0.3, product: 'Toxina', dose: 28, unit: 'UI', applied: null, view: 'rosto_f' }],
    }).select('id').single<{ id: string }>()
    expect(m.error).toBeNull()
    mapa = m.data!.id
  }
  return { id: ag!.id, cliente, mapa }
}

const aplicacoes = async (appointmentId: string) =>
  ((await db().from('injectable_applications').select('id, map_id, totals').eq('appointment_id', appointmentId)).data ?? []) as
    { id: string; map_id: string; totals: { applied: number; planned: number }[] }[]

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ij9${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`ij9p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  recepcao = await criarMembro(`ij9r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data: cs } = await db().from('clients').select('id').eq('tenant_id', rede.tenantId)
    for (const c of cs ?? []) await db().from('injectable_applications').delete().eq('client_id', c.id)
    await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await profissional?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('D14: registrada a aplicação, o botão vira "Atualizar", e o mesmo mapa não se registra duas vezes no atendimento', async ({ browser }) => {
  const { id, mapa } = await atendimento('Marina')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('main').getByRole('button', { name: 'Planejamento' }).click()
    const janela = p.getByRole('dialog')
    await janela.getByText('Injetáveis', { exact: true }).click()
    await janela.getByText(`Toxina Marina ${marca}`).click()
    await janela.getByRole('button', { name: 'Registrar aplicação' }).click()
    await expect(janela.getByText('Aplicação registrada neste atendimento.')).toBeVisible()
    await expect(janela.getByRole('button', { name: 'Registrar aplicação' })).toHaveCount(0)
    await janela.getByRole('button', { name: 'Atualizar a aplicação registrada' }).click()
    await expect(janela.getByText('Aplicação deste atendimento atualizada.')).toBeVisible()
  })
  expect((await aplicacoes(id)).length, 'uma aplicação do mapa neste atendimento').toBe(1)

  // O servidor também: dois "Registrar" ao mesmo tempo, direto na action, gravam uma.
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const valor = { view: 'rosto_f', points: [{ id: 'p1', x: 0.5, y: 0.3, product: 'Toxina', dose: 56, unit: 'UI', applied: 56, view: 'rosto_f' }] }
    const [a, b] = await Promise.all([1, 2].map(() =>
      chamarAcao(p, 'actions/injectable-map.ts', 'registrarAplicacao', `/${slug}/agenda/${id}`, [mapa, id, valor, null, slug])))
    expect([a!.status, b!.status]).toEqual([200, 200])
    expect(a!.texto + b!.texto, 'nenhuma das duas recusou').not.toContain('Erro ao registrar')
  })
  const depois = await aplicacoes(id)
  expect(depois.length).toBe(1)
  expect(depois[0]!.totals[0]!.applied, 'a última gravação vale').toBe(56)
})

test('A10: a tela do atendimento abre e cria o mapa de injetáveis sem sair dela', async ({ browser }) => {
  const { id, cliente } = await atendimento('Carolina', false)
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('main').getByRole('button', { name: 'Mapa de injetáveis' }).click()
    const janela = p.getByRole('dialog')
    await expect(janela.getByText('Nenhum planejamento de injetáveis ainda.')).toBeVisible()
    await janela.getByRole('button', { name: 'Novo planejamento' }).click()
    await expect(janela.getByRole('button', { name: 'Salvar planejamento' })).toBeVisible()
  })
  const { data } = await db().from('injectable_maps').select('client_id').eq('client_id', cliente)
  expect(data, 'o mapa nasce ligado à cliente do atendimento').toHaveLength(1)
})

test('D17: /injetaveis sem o prontuário responde a tela de sem acesso, sem HTTP 500', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    const r = await p.goto(`/${slug}/injetaveis`)
    expect(r?.status(), 'como /financeiro e /team: 200 com a tela de sem acesso').toBe(200)
    await expect(p.getByText('Você não tem acesso a esta área')).toBeVisible()
  })
})
