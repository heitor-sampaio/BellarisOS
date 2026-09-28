import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, filiaisAtivas, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Três ações que existiam no servidor e nenhuma tela chamava (2026-09-28):
 *  - excluir automação (`excluirAutomacao`);
 *  - editar campanha (`updateCampaign`);
 *  - parar o push do navegador ao sair do portal (`removeWebPushSubscription`).
 */

const marca = Date.now().toString(36)
const db = () => banco()

let outra: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null

test.beforeAll(async () => {
  outra = await criarOutraRede(`lig${marca}`)
  gestor = await criarMembro(`lig${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestão',
    permissoes: [{ modulo: 'automations', nivel: 'MANAGE' }, { modulo: 'marketing', nivel: 'MANAGE' }],
  })
  cliente = await clienteComSessao(`lig${marca}`, (await filiaisAtivas())[0]!)
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  if (outra) {
    olhar('automações', await b.from('automations').delete().eq('tenant_id', outra.tenantId))
    olhar('campanhas', await b.from('notification_campaigns').delete().eq('tenant_id', outra.tenantId))
  }
  if (cliente) olhar('inscrições', await b.from('web_push_subscriptions').delete().eq('client_id', cliente.clientId))
  await cliente?.limpar()
  await gestor?.limpar()
  await outra?.limpar()
  expect(falhas).toEqual([])
})

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function automacao(status: 'RASCUNHO' | 'ATIVA'): Promise<string> {
  const { data, error } = await db().from('automations').insert({
    tenant_id: outra!.tenantId, nome: `${PREFIXO} Automação ${status} ${marca}`, status,
    gatilhos: ['cliente.criado'],
    grafo: { nos: [{ id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, config: { evento: 'cliente.criado' } }], ligacoes: [] },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test('excluir automação: desligada sai pela tela; ligada nem oferece o botão', async ({ browser }) => {
  const desligada = await automacao('RASCUNHO')
  const ligada    = await automacao('ATIVA')
  await como(browser, gestor!.estado, async p => {
    await p.goto(`/admin/automacoes/${ligada}`)
    await expect(p.getByRole('button', { name: 'Desligar' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Excluir automação' }), 'ligada não se exclui').toHaveCount(0)

    await p.goto(`/admin/automacoes/${desligada}`)
    await p.getByRole('button', { name: 'Excluir automação' }).click()
    const dialogo = p.locator('dialog[open]')
    await expect(dialogo.getByText('Excluir automação?')).toBeVisible()
    await dialogo.getByRole('button', { name: 'Excluir', exact: true }).click()
    await expect(p).toHaveURL(/\/admin\/automacoes$/)
  })
  const { data } = await db().from('automations').select('id').in('id', [desligada, ligada])
  expect((data ?? []).map(a => a.id)).toEqual([ligada])
})

test('editar campanha: abre preenchida, salva e continua rascunho, sem mudar o tipo', async ({ browser }) => {
  const { data, error } = await db().from('notification_campaigns').insert({
    tenant_id: outra!.tenantId, status: 'DRAFT', type: 'IMMEDIATE', channels: ['in_app'],
    name: `${PREFIXO} Campanha ${marca}`, title: 'Olá {{first_name}}', body: 'Corpo original',
    notification_type: 'promotion', audience_rules: {},
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const id = data!.id
  const novoNome = `${PREFIXO} Campanha editada ${marca}`

  await como(browser, gestor!.estado, async p => {
    await p.goto(`/admin/notificacoes/${id}`)
    await p.getByRole('link', { name: 'Editar' }).click()
    await expect(p).toHaveURL(new RegExp(`/admin/notificacoes/${id}/editar`))
    await p.getByRole('button', { name: /Próximo/ }).click()
    const campoNome = p.getByPlaceholder('ex: Aniversariantes de julho')
    await expect(campoNome, 'abre com o nome que já tinha').toHaveValue(`${PREFIXO} Campanha ${marca}`)
    await campoNome.fill(novoNome)
    await p.getByRole('button', { name: /Próximo/ }).click()
    await p.getByRole('button', { name: /Próximo/ }).click()
    await p.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(p).toHaveURL(new RegExp(`/admin/notificacoes/${id}$`))
  })
  const { data: c } = await db().from('notification_campaigns').select('name, body, status, type').eq('id', id).single()
  expect(c).toEqual({ name: novoNome, body: 'Corpo original', status: 'DRAFT', type: 'IMMEDIATE' })
})

test('sair do portal: a inscrição de push deste navegador sai; a de outro navegador fica', async ({ browser }) => {
  const b = db()
  const keys = { p256dh: 'e2e', auth: 'e2e' }
  const deste = `https://push.e2e.invalido/deste-${marca}`
  const doOutro = `https://push.e2e.invalido/outro-${marca}`
  const { error } = await b.from('web_push_subscriptions').insert([
    { client_id: cliente!.clientId, endpoint: deste, keys },
    { client_id: cliente!.clientId, endpoint: doOutro, keys },
  ])
  expect(error).toBeNull()

  await como(browser, cliente!.estado, async p => {
    // O que o botão "Sair da conta" chama com o endpoint do navegador (o
    // navegador de teste não tem push de verdade para inscrever).
    await chamarAcao(p, 'actions/push-subscriptions.ts', 'removeWebPushSubscription', `/${cliente!.slug}/cliente/perfil`, [deste])
    await p.goto(`/${cliente!.slug}/cliente/perfil`)
    await p.getByRole('button', { name: 'Sair da conta' }).click()
    await expect(p).toHaveURL(/\/login/)
  })
  const { data } = await b.from('web_push_subscriptions').select('endpoint').eq('client_id', cliente!.clientId)
  expect((data ?? []).map(s => s.endpoint)).toEqual([doOutro])
})
