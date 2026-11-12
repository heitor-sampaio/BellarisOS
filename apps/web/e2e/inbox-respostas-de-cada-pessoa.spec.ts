import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * C72 (H8 do levantamento das regras, 11/11/2026): as respostas rápidas são
 * de CADA PESSOA. Eram da rede inteira — a recepcionista via, editava e
 * apagava o atalho da colega, e o nome era único na rede ("Já existe um atalho
 * com esse nome" para quem nunca o viu).
 *
 * Pela action, como quem atende: a Bia não vê, não edita nem apaga pelo id o
 * atalho da Ana; e o mesmo nome vale para as duas.
 */

test.setTimeout(150_000)

const marca = Date.now().toString(36)
const db = () => banco()
const ROTA = '/admin/inbox'
let rede: OutraRede
let ana: MembroDeTeste
let bia: MembroDeTeste
let daAna = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { const p = await ctx.newPage(); await p.goto(ROTA); await fn(p) } finally { await ctx.close() }
}

const acao = (p: Page, funcao: string, args: unknown[]) => chamarAcao(p, 'actions/quick-replies.ts', funcao, ROTA, args)

test.beforeAll(async () => {
  rede = await criarOutraRede(`qr${marca}`)
  const crm = [{ modulo: 'crm' as const, nivel: 'MANAGE' as const, escopo: 'ALL' as const }]
  ana = await criarMembro(`qra${marca}`, { tenant: rede.tenantId, rotulo: 'Atendente Ana', permissoes: crm })
  bia = await criarMembro(`qrb${marca}`, { tenant: rede.tenantId, rotulo: 'Atendente Bia', permissoes: crm })
})

test.afterAll(async () => {
  await db().from('quick_replies').delete().eq('tenant_id', rede.tenantId)
  await ana?.limpar(); await bia?.limpar(); await rede?.limpar()
})

test('a resposta rápida é de quem a escreveu', async ({ browser }) => {
  await como(browser, ana, async p => {
    const r = await acao(p, 'saveQuickReply', [{ title: 'Endereço', content: `Texto da Ana ${marca}` }])
    expect(r.texto).toContain('"ok":true')
  })
  const { data } = await db().from('quick_replies').select('id').eq('tenant_id', rede.tenantId).single<{ id: string }>()
  daAna = data!.id

  await como(browser, bia, async p => {
    const lista = await acao(p, 'listQuickReplies', [])
    expect(lista.status).toBe(200)
    expect(lista.texto, 'a Bia não vê o atalho da Ana').not.toContain(`Texto da Ana ${marca}`)

    const mesmoNome = await acao(p, 'saveQuickReply', [{ title: 'Endereço', content: `Texto da Bia ${marca}` }])
    expect(mesmoNome.texto, 'o mesmo nome vale para a Bia').toContain('"ok":true')

    await acao(p, 'saveQuickReply', [{ id: daAna, title: 'Endereço', content: 'a Bia trocou' }])
    await acao(p, 'deleteQuickReply', [daAna])
  })

  const { data: depois } = await db().from('quick_replies').select('content').eq('id', daAna).maybeSingle<{ content: string }>()
  expect(depois?.content, 'o atalho da Ana segue dela, intacto').toBe(`Texto da Ana ${marca}`)

  await como(browser, ana, async p => {
    const lista = await acao(p, 'listQuickReplies', [])
    expect(lista.texto).toContain(`Texto da Ana ${marca}`)
    expect(lista.texto).not.toContain(`Texto da Bia ${marca}`)
  })
})
