import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D-1 dos atritos (decisão do Heitor, 2026-10-29): criar e editar funis,
 * etapas e motivos de perda exige Configurações em Gerenciar, como as outras
 * configurações da rede. Mover os cards segue com quem opera o quadro (`crm`).
 *
 * Antes bastava o CRM em Gerenciar: a SDR que opera o quadro renomeava as
 * etapas e apagava motivos de perda da clínica inteira.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let operadora: MembroDeTeste
let configuradora: MembroDeTeste
let slug = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`cfp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  operadora = await criarMembro(`cfpo${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'SDR',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  configuradora = await criarMembro(`cfpc${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'settings', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await operadora?.limpar()
  await configuradora?.limpar()
  await rede?.limpar()
})

const tela = () => `/${slug}/oportunidades`

test('"Configurar funis" só aparece para quem tem Configurações em Gerenciar', async ({ browser }) => {
  await como(browser, operadora, async p => {
    await p.goto(tela())
    await expect(p.getByRole('heading', { name: 'Oportunidades' })).toBeVisible()
    await expect(p.getByTitle('Configurar funis'), 'quem só opera o quadro').toHaveCount(0)
  })
  await como(browser, configuradora, async p => {
    await p.goto(tela())
    await expect(p.getByTitle('Configurar funis'), 'controle: com Configurações').toBeVisible()
  })
})

test('sem Configurações, as actions de funil, etapa e motivo de perda recusam', async ({ browser }) => {
  const funil = `${PREFIXO} Funil ${marca}`
  const motivo = `${PREFIXO} Motivo ${marca}`
  // O funil padrão nasce no primeiro acesso ao quadro.
  await como(browser, operadora, async p => { await p.goto(tela()); await expect(p.getByRole('heading', { name: 'Oportunidades' })).toBeVisible() })
  const { data: etapa } = await db().from('crm_stages').select('id, name').eq('tenant_id', rede.tenantId).limit(1).single<{ id: string; name: string }>()
  const { data: umMotivo } = await db().from('crm_motivos_perda').select('id').eq('tenant_id', rede.tenantId).eq('ativo', true).limit(1).single<{ id: string }>()
  expect(etapa, 'o funil padrão existe').toBeTruthy()

  await como(browser, operadora, async p => {
    await p.goto(tela())
    const r = await chamarAcaoComFormulario(p, 'actions/crm-funnels.ts', 'createFunnel', tela(), [undefined], { name: funil, _slug: slug })
    expect(r.texto, 'chegou à action').not.toContain('Server action not found')
    await chamarAcao(p, 'actions/crm-stages.ts', 'renameStage', tela(), [etapa!.id, 'invasão', slug])
    await chamarAcao(p, 'actions/crm-motivos.ts', 'criarMotivoDePerda', tela(), [motivo])
    await chamarAcao(p, 'actions/crm-motivos.ts', 'alternarMotivoDePerda', tela(), [umMotivo!.id, false])
  })
  expect((await db().from('crm_funnels').select('id').eq('tenant_id', rede.tenantId).eq('name', funil)).data, 'o funil não nasceu').toEqual([])
  expect((await db().from('crm_stages').select('name').eq('id', etapa!.id).single<{ name: string }>()).data!.name, 'a etapa não mudou').toBe(etapa!.name)
  expect((await db().from('crm_motivos_perda').select('id').eq('tenant_id', rede.tenantId).eq('nome', motivo)).data, 'o motivo não nasceu').toEqual([])
  expect((await db().from('crm_motivos_perda').select('ativo').eq('id', umMotivo!.id).single<{ ativo: boolean }>()).data!.ativo, 'o motivo segue ativo').toBe(true)

  // Controle: com Configurações, cria.
  await como(browser, configuradora, async p => {
    await p.goto(tela())
    await chamarAcaoComFormulario(p, 'actions/crm-funnels.ts', 'createFunnel', tela(), [undefined], { name: funil, _slug: slug })
    await chamarAcao(p, 'actions/crm-motivos.ts', 'criarMotivoDePerda', tela(), [motivo])
  })
  expect((await db().from('crm_funnels').select('id').eq('tenant_id', rede.tenantId).eq('name', funil)).data, 'controle: o funil nasceu').toHaveLength(1)
  expect((await db().from('crm_motivos_perda').select('id').eq('tenant_id', rede.tenantId).eq('nome', motivo)).data, 'controle: o motivo nasceu').toHaveLength(1)
})
