import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * com-04 da revisão das decisões (2026-11-02). O Heitor: "a comissão devida é
 * sempre pelo valor pago, quando pago. Se foi vendido um pacote de 900, Renata
 * recebe a comissão sobre o valor do pacote, no momento em que o pagamento
 * integral do pacote foi realizado (...) mas devemos manter o sistema com a
 * maior flexibilidade possível e a rede define como operar."
 *
 * O cadastro do pacote ganha, na comissão de quem atende, a opção "Valor do
 * pacote": em vez de uma linha por sessão feita, UMA linha sobre o valor do
 * pacote, para a PROFISSIONAL RESPONSÁVEL escolhida na venda, que libera
 * quando o pacote está pago inteiro (o crediário espera a última parcela; o
 * cartão em N vezes é na hora — H4). Sem responsável, a venda avisa e pede
 * confirmação; confirmada, ninguém recebe essa comissão.
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let pacote = ''
const NOME = `${PREFIXO} Pacote responsável ${marca}`
const vence = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
/** A linha da responsável do pacote vendido, e quanto ela deve agora (a soma do extrato). */
async function daResponsavel(cp: string) {
  const { data: linhas, error } = await db().from('commission_lines')
    .select('id, origem, professional_id, regra_tipo, regra_valor, preco, pacote_responsavel').eq('client_package_id', cp).eq('pacote_responsavel', true)
  expect(error).toBeNull()
  const linha = (linhas ?? [])[0] ?? null
  if (!linha) return { linha: null, devido: 0 }
  const { data } = await db().from('commissions').select('amount').eq('line_id', linha.id)
  return { linha, devido: Math.round((data ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100 }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`cpr${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ name: `${PREFIXO} Limpeza ${marca}`, price: 225 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: null }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('commission_configs').upsert({
    tenant_id: rede.tenantId, modo: 'INTEGRAL', desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  cliente = await rede.criarCliente('Pacote da responsável')
  gestor = await criarMembro(`cpr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [
      { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    await b.from('commission_lines').delete().eq('tenant_id', rede.tenantId)
    const { data: cps } = await b.from('client_packages').select('id').eq('client_id', cliente)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      await b.from('package_sessions').delete().in('client_package_id', ids)
      await b.from('financial_transactions').delete().in('client_package_id', ids)
      await b.from('client_packages').delete().in('id', ids)
    }
    await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
    await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
    await b.from('envios_unicos').delete().eq('tenant_id', rede.tenantId)
  }
  await gestor?.limpar()
  await rede?.limpar()
})

test('o cadastro do pacote: a comissão de quem atende "Valor do pacote", em %', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/pacotes')
    const card = p.locator('[aria-label="Pacotes"]')
    await card.getByRole('button', { name: 'Novo pacote' }).click()
    await card.getByLabel('Nome do pacote').fill(NOME)
    await card.getByLabel('Procedimento 1', { exact: true }).selectOption(rede!.procedureId)
    await card.getByLabel('Sessões do procedimento 1').fill('4')
    await card.getByLabel('Preço do pacote').fill('900')
    const comissao = card.getByRole('group', { name: 'Comissão do pacote' })
    await comissao.getByRole('group', { name: 'Comissão de execução' }).getByRole('button', { name: 'Valor do pacote' }).click()
    await expect(comissao.getByText(/profissional responsável/)).toBeVisible()
    await comissao.getByRole('group', { name: 'Comissão sobre o pacote' }).getByRole('button', { name: 'Percentual' }).click()
    await comissao.getByLabel('Valor da comissão sobre o pacote').fill('10')
    await card.getByRole('button', { name: 'Salvar pacote' }).click()
    await expect(card.locator('[data-pacote]', { hasText: NOME })).toContainText('Execução: 10% do pacote, para a profissional responsável')
  })
  const { data, error } = await db().from('service_packages')
    .select('id, comissao_execucao, comissao_responsavel_tipo, comissao_responsavel_valor').eq('tenant_id', rede!.tenantId).eq('name', NOME).single()
  expect(error).toBeNull()
  pacote = data!.id as string
  expect({ e: data!.comissao_execucao, t: data!.comissao_responsavel_tipo, v: n(data!.comissao_responsavel_valor) })
    .toEqual({ e: 'NENHUMA', t: 'PERCENTAGE', v: 10 })
})

test('a venda pela ficha escolhe a responsável; no Pix, os 10% de R$ 900 (R$ 90) são dela na hora — e as sessões não geram comissão', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await p.getByRole('button', { name: 'Vender' }).first().click()
    const janela = p.getByRole('dialog', { name: 'Vender' })
    const aba = janela.getByRole('button', { name: 'Pacote', exact: true })
    if (await aba.count()) await aba.click()
    await janela.getByLabel('Pacote', { exact: true }).selectOption(pacote)
    await janela.getByLabel('Profissional responsável').selectOption(rede!.professionalId)
    await janela.getByLabel('Meio de pagamento').selectOption('PIX')
    await janela.getByRole('button', { name: /^Vender por R\$\s900,00$/ }).click()
    await expect(janela).toBeHidden()
  })
  const { data: cp } = await db().from('client_packages').select('id, responsavel_id, comissao_execucao')
    .eq('client_id', cliente).order('purchased_at', { ascending: false }).limit(1).single()
  expect({ r: cp!.responsavel_id, e: cp!.comissao_execucao }).toEqual({ r: rede!.professionalId, e: 'NENHUMA' })
  const { linha, devido } = await daResponsavel(cp!.id as string)
  expect(linha && { o: linha.origem, p: linha.professional_id, t: linha.regra_tipo, v: n(linha.regra_valor), preco: n(linha.preco) })
    .toEqual({ o: 'PACOTE_VENDA', p: rede!.professionalId, t: 'PERCENTAGE', v: 10, preco: 900 })
  expect(devido, 'pago no Pix: libera na hora').toBe(90)
})

test('no crediário (entrada + 2 parcelas), a comissão da responsável aguarda — e libera com a última parcela (H4)', async ({ browser }) => {
  const rota = `/${slug}/clients/${cliente}`
  let cpId = ''
  await como(browser, async p => {
    await p.goto(rota)
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota, [
      cliente, pacote, rede!.branchId, { forma: 'PARCELADO', metodo: 'PIX', entrada: 300, parcelas: 2, primeiroVencimento: vence() }, null, null,
      { responsavelId: rede!.professionalId },
    ])
    cpId = /"clientPackageId":"([0-9a-f-]{36})"/.exec(r!.texto)?.[1] ?? ''
  })
  expect(cpId, 'vendeu').not.toBe('')
  expect((await daResponsavel(cpId)).devido, 'com a entrada só, nada').toBe(0)
  const { data: parcelas } = await db().from('financial_transactions').select('id, parcela_numero')
    .eq('client_package_id', cpId).eq('is_paid', false).order('parcela_numero')
  expect((parcelas ?? []).length).toBe(2)
  await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX' }).eq('id', parcelas![0]!.id)
  expect((await daResponsavel(cpId)).devido, 'falta uma parcela').toBe(0)
  await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX' }).eq('id', parcelas![1]!.id)
  expect((await daResponsavel(cpId)).devido, 'a última parcela libera os R$ 90').toBe(90)
})

test('sem responsável, a venda pergunta; confirmada, vende — e ninguém recebe essa comissão', async ({ browser }) => {
  const rota = `/${slug}/clients/${cliente}`
  const antes = (await db().from('client_packages').select('id').eq('client_id', cliente)).data!.length
  await como(browser, async p => {
    await p.goto(rota)
    const pergunta = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota,
      [cliente, pacote, rede!.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, {}])
    expect(pergunta!.texto).toContain('Ninguém foi marcado como responsável')
    expect((await db().from('client_packages').select('id').eq('client_id', cliente)).data!.length, 'sem a resposta, não vende').toBe(antes)
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota,
      [cliente, pacote, rede!.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { semResponsavel: true }])
    expect(r!.texto).toContain('clientPackageId')
  })
  const { data: cp } = await db().from('client_packages').select('id, responsavel_id')
    .eq('client_id', cliente).order('purchased_at', { ascending: false }).limit(1).single()
  expect(cp!.responsavel_id).toBeNull()
  expect((await daResponsavel(cp!.id as string)).linha, 'nenhuma linha de responsável').toBeNull()
})
