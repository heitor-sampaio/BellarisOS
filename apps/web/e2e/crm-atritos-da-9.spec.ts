import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { dayKeyTZ } from '../lib/datetime'

/**
 * O CRM da 9ª simulação (2026-11-07), pelas regras de sempre:
 * - D11: a oportunidade criada com o telefone de uma cliente nascia sem aviso
 *   e sem ligar à ficha (o inverso — cadastrar a cliente com o telefone de um
 *   lead — já perguntava "É a mesma pessoa?").
 * Numa rede [e2e] própria.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const fim = String(Date.now()).slice(-4)
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let sdr: MembroDeTeste
let funil = ''
const etapa: Record<'novo' | 'negociacao' | 'ganho' | 'perdido', string> = { novo: '', negociacao: '', ganho: '', perdido: '' }
let camila = ''
const foneDaCamila = `(48) 9${fim}-3131`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr9${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: f } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'Vendas', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  funil = f!.id
  const etapas = [['novo', 'Novo', 'OPEN'], ['negociacao', 'Em negociação', 'OPEN'], ['ganho', 'Fechado', 'WON'], ['perdido', 'Perdido', 'LOST']] as const
  for (const [i, [k, n, o]] of etapas.entries()) {
    const { data } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: funil, name: n, color: '#c34d6b', position: i, outcome: o }).select('id').single<{ id: string }>()
    etapa[k] = data!.id
  }
  const { data: c, error } = await db().from('clients').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, name: nome('Camila Duarte'), phone: foneDaCamila,
  }).select('id').single<{ id: string }>()
  expect(error, 'a ficha da Camila').toBeNull()
  camila = c!.id
  sdr = await criarMembro(`cr9s${marca}`, {
    tenant: rede.tenantId, rotulo: 'SDR',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await sdr?.limpar()
  await rede?.limpar()
})

test('D11: o lead com o telefone de uma cliente pergunta se é ela e, com o "Sim", nasce ligado à ficha', async ({ browser }) => {
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    await p.getByRole('button', { name: 'Nova oportunidade' }).click()
    const janela = p.locator('dialog[open]')
    await janela.getByLabel('Nome *').fill(nome('Camila D. (repetida)'))
    await janela.getByLabel('Telefone').fill(foneDaCamila)
    const pergunta = janela.locator('[data-ficha-do-telefone]')
    await expect(pergunta).toContainText(`Este telefone é da ficha de ${nome('Camila Duarte')}`)

    // Sem responder, não cria — e diz o que falta.
    await janela.getByRole('button', { name: 'Criar oportunidade' }).click()
    await expect(janela).toContainText('Responda antes de criar')
    expect((await db().from('leads').select('id').eq('tenant_id', rede.tenantId).eq('name', nome('Camila D. (repetida)'))).data).toEqual([])

    await pergunta.getByRole('button', { name: 'Sim, é ela' }).click()
    await janela.getByRole('button', { name: 'Criar oportunidade' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0)
  })
  await expect.poll(async () => (await db().from('leads').select('client_id')
    .eq('tenant_id', rede.tenantId).eq('name', nome('Camila D. (repetida)')).maybeSingle()).data?.client_id,
  { message: 'a oportunidade nasce ligada à ficha' }).toBe(camila)
})

async function lead(rotulo: string, campos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome(rotulo), phone: `5548${fim}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    crm_stage_id: etapa.novo, ...campos,
  }).select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(error, `criar o lead ${rotulo}`).toBeNull()
  return data!.id
}

test('A43: "Ir para a conversa" numa clínica sem WhatsApp diz que não há canal, e não cria conversa', async ({ browser }) => {
  const id = await lead('Instagram A43', { source: 'Instagram' })
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    await p.locator(`[data-lead-id="${id}"]`).click()
    const janela = p.locator('dialog[open]')
    await janela.getByRole('button', { name: 'Ir para a conversa' }).click()
    await expect(janela).toContainText('não tem um WhatsApp conectado')
    await expect(p).toHaveURL(/\/admin\/oportunidades/)
  })
  const { data: l } = await db().from('leads').select('contato_id').eq('id', id).single<{ contato_id: string }>()
  const { data: conversas } = await db().from('conversations').select('id').eq('tenant_id', rede.tenantId).eq('contato_id', l!.contato_id)
  expect(conversas, 'nenhuma conversa de WhatsApp nasce sem canal').toEqual([])
})

test('A44: o resumo diz a base da conversão, e "1 perdido" leva à coluna Perdido', async ({ browser }) => {
  await lead('Perdido A44', { crm_stage_id: etapa.perdido, perdido_em: new Date().toISOString() })
  await como(browser, sdr, async p => {
    await p.setViewportSize({ width: 1100, height: 800 })
    await p.goto('/admin/oportunidades')
    const resumo = p.locator('[data-resumo-do-quadro]')
    await expect(resumo).toContainText('ganhas de')
    await expect(resumo).toContainText('oportunidades do funil (abertas, ganhas e perdidas)')
    const coluna = p.locator('[data-coluna-desfecho="LOST"]')
    await expect(coluna).not.toBeInViewport({ ratio: 0.9 })
    await resumo.getByRole('button', { name: /1 perdido/ }).click()
    await expect(coluna).toBeInViewport({ ratio: 0.9 })
  })
})

test('A42: o lembrete de retorno se marca no card, com o dia e o que fazer, e o card diz quando', async ({ browser }) => {
  const id = await lead('Retorno A42')
  const hoje = dayKeyTZ(new Date())
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    await p.locator(`[data-lead-id="${id}"]`).click()
    const janela = p.locator('dialog[open]')
    await janela.getByLabel('Retornar em').fill(hoje)
    await janela.getByLabel('O que fazer no retorno').fill('Ligar para falar do orçamento')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0)
    await expect(p.locator(`[data-lead-id="${id}"] [data-retornar-em]`)).toContainText('Retornar hoje')
  })
  const { data } = await db().from('leads').select('retornar_em, retornar_obs, crm_stage_id').eq('id', id).single()
  expect(data).toEqual({ retornar_em: hoje, retornar_obs: 'Ligar para falar do orçamento', crm_stage_id: etapa.novo })
})
