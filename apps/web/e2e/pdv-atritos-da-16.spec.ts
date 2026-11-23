import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os atritos do PDV e do Financeiro na 16ª simulação (2026-11-15).
 *
 * - A1 (princípio 7): a comanda do crediário dizia "R$ 800,00 em aberto (4
 *   parcelas…)" e não tinha botão. A parcela se recebia em Nova venda →
 *   escolher a cliente, e ninguém a achou ali. A comanda traz as parcelas
 *   dela, com o mesmo "Receber esta parcela".
 * - A2 (princípio 3): no Financeiro → A receber, o botão da conta a receber se
 *   chamava "Pagar", e o modal pedia só a forma, sem o valor nem a cliente.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let slug = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const daqui30 = () => new Date(Date.now() + 30 * 86_400_000)

test.beforeAll(async () => {
  rede = await criarOutraRede(`pdv16${marca}`)
  expect((await db().from('procedures').update({ price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  caixa = await criarMembro(`pdv16c${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (!rede) return
  const b = db()
  const { data: vendas } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
  const ids = (vendas ?? []).map(v => v.id as string)
  if (ids.length) {
    await b.from('financial_transactions').update({ procedure_sale_id: null }).in('procedure_sale_id', ids)
    await b.from('commission_lines').update({ procedure_sale_id: null }).in('procedure_sale_id', ids)
    await b.from('procedure_sales').delete().in('id', ids)
  }
  await caixa?.limpar()
  await rede.limpar()
})

async function vendaNoCrediario(p: Page, cliente: string) {
  const r = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`, [
    cliente, rede!.procedureId, rede!.branchId, 3, null,
    { forma: 'PARCELADO', entrada: 0, parcelas: 3, primeiroVencimento: daqui30().toISOString() }, null, null, null,
  ])
  expect(r.texto, 'a venda no crediário passou').toContain('saleId')
}

test('A1: a comanda do crediário recebe a parcela ali mesmo', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Parcela ${marca}`)
  await como(caixa!, browser, async p => {
    await vendaNoCrediario(p, cliente)
    await p.goto(`/${slug}/pdv?ver=PAGAS`)
    await p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Parcela ${marca}` }).click()
    const comanda = p.locator('[data-comanda-aberta]')
    await expect(comanda.locator('[data-comanda-em-aberto]')).toContainText(/R\$\s600,00 em aberto/)
    const parcelas = comanda.locator('[data-parcela-em-aberto]')
    await expect(parcelas).toHaveCount(3)
    await parcelas.first().getByRole('button', { name: 'Receber esta parcela' }).click()
    const janela = p.getByRole('dialog', { name: 'Receber a parcela' })
    await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
    await janela.getByRole('button', { name: /^Receber R\$\s200,00$/ }).click()
    await expect.poll(async () => {
      const { data } = await db().from('financial_transactions').select('parcela_numero, is_paid')
        .eq('branch_id', rede!.branchId).eq('client_id', cliente).not('parcela_numero', 'is', null).order('parcela_numero')
      return (data ?? []).map(t => `${t.parcela_numero}:${t.is_paid}`)
    }, { message: 'a 1ª parcela recebida pela comanda' }).toEqual(['1:true', '2:false', '3:false'])
    await expect(comanda.locator('[data-parcela-em-aberto]')).toHaveCount(2)
  })
})

test('A2: a conta a receber tem "Receber", e o modal diz quanto e de quem', async ({ browser }) => {
  const nomeDaCliente = `Receber ${marca}`
  const cliente = await rede!.criarCliente(nomeDaCliente)
  await como(caixa!, browser, async p => {
    await vendaNoCrediario(p, cliente)
    const { data: parcela } = await db().from('financial_transactions').select('id')
      .eq('client_id', cliente).eq('parcela_numero', 1).single<{ id: string }>()
    await p.goto(`/${slug}/financeiro?aba=a-receber`)
    const linha = p.locator(`[data-lancamento="${parcela!.id}"]`)
    await expect(linha.getByRole('button', { name: 'Pagar', exact: true })).toHaveCount(0)
    await linha.getByRole('button', { name: 'Receber', exact: true }).click()
    const receber = p.getByRole('dialog', { name: 'Receber' })
    const quanto = receber.locator('[data-receber-quanto]')
    await expect(quanto).toContainText(/R\$\s200,00/)
    await expect(quanto).toContainText(nomeDaCliente)
  })
})
