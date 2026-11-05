import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Sobra da F29 (decisão 2 do Heitor, 7ª simulação, 2026-11-05 — o responsável
 * legal da menor): o pacote da LGPD (o JSON e o PDF) não levava o responsável
 * gravado na ficha (`clients.responsavel_*`). É dado do cadastro dela: vai na
 * parte geral, ao lado dos dados cadastrais. E o documento da estrangeira
 * (passaporte/RNE, decisão 1) também.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
const ANO = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()))

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function doBucket(caminho: string) {
  const { data, error } = await db().storage.from('lgpd-exports').createSignedUrl(caminho, 60)
  expect(error, 'o pacote tem de estar no bucket').toBeNull()
  const r = await fetch(data!.signedUrl)
  expect(r.ok).toBe(true)
  return Buffer.from(await r.arrayBuffer())
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`lr${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`lrc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  expect((await db().from('clients').update({
    birth_date: `${ANO - 16}-03-14`,
    responsavel_nome: 'Marta Lima', responsavel_cpf: '52998224725', responsavel_parentesco: 'Mãe', responsavel_telefone: '(71) 98888-7777',
  }).eq('id', cliente.clientId)).error).toBeNull()
})
test.afterAll(async () => {
  if (cliente) {
    const { data } = await db().from('lgpd_requests').select('export_json_path, export_pdf_path').eq('client_id', cliente.clientId)
    const caminhos = (data ?? []).flatMap(p => [p.export_json_path, p.export_pdf_path]).filter(Boolean) as string[]
    if (caminhos.length) await db().storage.from('lgpd-exports').remove(caminhos)
    await db().from('lgpd_requests').delete().eq('client_id', cliente.clientId)
  }
  await cliente?.limpar(); await rede?.limpar()
})

test('o pacote da menor leva o responsável legal, no JSON e no PDF', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/perfil`)
    await p.getByRole('button', { name: 'Solicitar meus dados' }).click()
  })
  await expect.poll(async () => (await db().from('lgpd_requests').select('status').eq('client_id', cliente!.clientId).single()).data?.status,
    { timeout: 30_000 }).toBe('completed')
  const { data: pedido } = await db().from('lgpd_requests').select('export_json_path, export_pdf_path').eq('client_id', cliente!.clientId).single()
  const pacote = JSON.parse((await doBucket(pedido!.export_json_path as string)).toString('utf-8')) as { cadastro: Record<string, unknown> }
  expect(pacote.cadastro.responsavelLegal).toEqual({ nome: 'Marta Lima', cpf: '529.982.247-25', parentesco: 'Mãe', telefone: '(71) 98888-7777' })
  const pdf = (await doBucket(pedido!.export_pdf_path as string)).toString('latin1')
  expect(pdf).toContain('Responsável legal')
  // Os parênteses saem escapados no texto do PDF: o nome e o parentesco à parte.
  expect(pdf).toContain('Marta Lima')
  expect(pdf).toContain('CPF 529.982.247-25')
})
