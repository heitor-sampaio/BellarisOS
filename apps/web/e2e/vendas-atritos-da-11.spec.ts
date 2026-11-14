import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { abrirVendaNoPdv, receberPlanoNoPdv } from './apoio/vender'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os atritos de venda da 11ª simulação (2026-11-10), numa rede [e2e] própria:
 *
 * - A41: o pacote vendido no crediário (entrada de 150 e 3 × 100) liberava as
 *   sessões sem aviso dos R$ 300 em aberto (decidido pelos princípios: o pacote
 *   segue liberando — princípio 1; a tela avisa, na ficha e ao agendar a
 *   sessão — princípio 2).
 * - A45: o CPF e o telefone sem máscara no checkout ("CPF 00515996270 ·
 *   31997000013") e no atendimento.
 * - A46: o placeholder do "Quem vendeu" saía truncado no celular.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let recepcao: MembroDeTeste
let cliente = ''
let pacote = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async ({ browser }) => {
  rede = await criarOutraRede(`ven11${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('procedures').update({ price: 75 }).eq('id', rede.procedureId)).error).toBeNull()
  recepcao = await criarMembro(`ven11r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }],
  })
  cliente = await rede.criarCliente('Cliente Teste')
  expect((await b.from('clients').update({ document: '00515996270', phone: '31997000013' }).eq('id', cliente)).error).toBeNull()
  const { data: sp, error } = await b.from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: `[e2e] Pacote crediário ${marca}`, total_sessions: 6, price: 450,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  pacote = sp!.id
  expect((await b.from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: pacote, procedure_id: rede.procedureId, quantity: 6 })).error).toBeNull()
  // A venda no crediário: entrada de R$ 150 no Pix e 3 × R$ 100 a receber.
  const rota = `/${slug}/pdv`
  await como(browser, recepcao, async p => {
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota, [
      cliente, pacote, rede.branchId,
      { forma: 'PARCELADO', metodo: 'PIX', entrada: 150, parcelas: 3, primeiroVencimento: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      null, null, { vendedorId: recepcao.userId },
    ])
    expect(r.texto).toContain('clientPackageId')
  })
})

test.afterAll(async () => {
  await recepcao?.limpar()
  await rede?.limpar()
})

test('A41: a ficha e o agendar da sessão dizem os R$ 300,00 em aberto do pacote — e as sessões seguem liberadas', async ({ browser }) => {
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    const aviso = p.locator('[data-pacote-em-aberto]').first()
    await expect(aviso).toContainText(/R\$\s300,00/)
    await expect(aviso).toContainText('seguem liberadas')
    // Ao agendar a sessão: a ficha de tratamento → "Gerenciar sessões".
    await p.locator('[data-tratamento-que-abre]').click()
    await p.getByRole('button', { name: /Gerenciar sessões/ }).click()
    const doAgendar = p.locator('[data-pacote-em-aberto]').first()
    await expect(doAgendar).toContainText(/R\$\s300,00/)
    // Liberadas: a sessão 1 se agenda (o botão existe).
    await expect(p.getByRole('button', { name: /Agendar/ }).first()).toBeVisible()
  })
})

test('A45: o receber do plano (no PDV) mostra o CPF e o telefone com máscara', async ({ browser }) => {
  const plano = await rede.criarPlanoProposto('Checkout A45', { semTermo: true })
  expect((await db().from('clients').update({ document: '12345678909', phone: '31997000013' }).eq('id', plano.clientId)).error).toBeNull()
  await como(browser, recepcao, async p => {
    const janela = await receberPlanoNoPdv(p, `/${slug}`, plano.planId)
    await expect(janela.getByText('CPF 123.456.789-09 · (31) 99700-0013')).toBeVisible()
  })
})

test('A46: o "Quem vendeu" vazio cabe no celular — a explicação fica embaixo', async ({ browser }) => {
  await como(browser, recepcao, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    await expect(dlg.getByLabel('Quem vendeu').locator('option[value=""]')).toHaveText('Escolha quem vendeu')
    await expect(dlg.locator('[data-quem-vendeu-vazio]')).toContainText('sem comissão de venda')
  }, { width: 412, height: 860 })
})
