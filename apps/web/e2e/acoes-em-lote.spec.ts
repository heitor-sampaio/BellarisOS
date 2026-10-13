import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { subirUazapiFalsa, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * Configurações → "Ações em lote" (pedido do Heitor, 2026-10-13): o lugar de
 * acompanhar o que roda em segundo plano e demora — começando pelo histórico
 * do WhatsApp Web, que espera o WhatsApp mandar e depois importa. Mostra a
 * etapa, o progresso ("12 de 80 conversas"), o resultado e o erro; o que ficou
 * sem sinal de vida (o servidor reiniciou no meio) vira "Interrompida" e
 * libera a caixa; e o que falhou se tenta de novo dali.
 *
 * Numa rede `[e2e]` própria, com a uazapi falsa.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let membro: MembroDeTeste
let falsa: UazapiFalsa
const caixas: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' }
const rotulo = (k: string) => `${PREFIXO} Caixa ${k} ${marca}`
const ha = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirUazapiFalsa()
  falsa.historico = { status: { processingComplete: true, diagnosis: [] }, chats: [], mensagens: {} }
  outra = await criarOutraRede(`lote${marca}`)
  membro = await criarMembro(`lote${marca}`, { tenant: outra.tenantId, rotulo: 'Config', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
  for (const k of ['a', 'b', 'c', 'd'] as const) {
    const { data, error } = await db().from('whatsapp_numbers').insert({
      tenant_id: outra.tenantId, provider: 'uazapi', label: rotulo(k), is_active: true,
      config: { token: `e2e-lote-${k}-${marca}`, baseUrl: falsa.url },
    }).select('id').single<{ id: string }>()
    expect(error, `criar a caixa ${k}`).toBeNull()
    caixas[k] = data!.id
  }
  const linha = (k: keyof typeof caixas, x: Record<string, unknown>) => ({
    // Num insert de várias linhas o PostgREST manda null no que uma delas não tem
    // (não o padrão da coluna): todas levam os mesmos campos.
    tenant_id: outra.tenantId, whatsapp_number_id: caixas[k], conversas: 0, mensagens: 0, etapa: null, total_conversas: null, erro: null, concluida_em: null, ...x,
  })
  const { error } = await db().from('whatsapp_historicos').insert([
    linha('a', { status: 'concluida', conversas: 12, mensagens: 340, criada_em: ha(30), iniciada_em: ha(30), concluida_em: ha(25), atualizada_em: ha(25) }),
    linha('b', { status: 'importando', etapa: 'importando', conversas: 12, total_conversas: 80, mensagens: 200, criada_em: ha(3), iniciada_em: ha(3), atualizada_em: ha(0) }),
    linha('c', { status: 'falhou', erro: 'uazapi /chat/find 500: fora do ar', criada_em: ha(10), iniciada_em: ha(10), concluida_em: ha(9), atualizada_em: ha(9) }),
    // Sem sinal de vida há uma hora: o servidor reiniciou no meio.
    linha('d', { status: 'importando', etapa: 'importando', conversas: 5, criada_em: ha(70), iniciada_em: ha(70), atualizada_em: ha(60) }),
  ])
  expect(error, 'criar as importações').toBeNull()
})
test.afterAll(async () => {
  if (outra) {
    await db().from('whatsapp_historicos').delete().eq('tenant_id', outra.tenantId)
    await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
  }
  await membro?.limpar()
  await outra?.limpar()
  await falsa?.fechar()
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const acao = (p: Page, k: string) => p.locator('[data-acao-em-lote]', { hasText: rotulo(k) })

test('a aba mostra cada ação com a etapa, o progresso e o resultado', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=lotes')
    await expect(p.getByRole('link', { name: 'Ações em lote' })).toBeVisible()
    await expect(acao(p, 'a')).toContainText('Histórico do WhatsApp')
    await expect(acao(p, 'a')).toContainText('Concluída')
    await expect(acao(p, 'a')).toContainText('12 conversas, 340 mensagens')
    await expect(acao(p, 'b')).toContainText('Em andamento')
    await expect(acao(p, 'b')).toContainText('12 de 80 conversas')
    await expect(acao(p, 'b').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '15')
    await expect(acao(p, 'c')).toContainText('Falhou')
    await expect(acao(p, 'c')).toContainText('fora do ar')
  })
})

test('a que ficou sem sinal de vida vira "Interrompida" e libera a caixa', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=lotes')
    await expect(acao(p, 'd')).toContainText('Interrompida')
  })
  const { data } = await db().from('whatsapp_historicos').select('status').eq('whatsapp_number_id', caixas.d)
  expect(data?.map(r => r.status)).toEqual(['falhou'])
})

test('a que falhou se tenta de novo dali', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=lotes')
    await acao(p, 'c').getByRole('button', { name: 'Tentar de novo' }).click()
    await expect.poll(async () => ((await db().from('whatsapp_historicos').select('status')
      .eq('whatsapp_number_id', caixas.c).order('criada_em', { ascending: false }).limit(1)).data?.[0]?.status),
    { timeout: 60_000 }).toBe('concluida')
    // A tela acompanha sozinha.
    await expect(acao(p, 'c').first()).toContainText('Concluída', { timeout: 30_000 })
  })
})
