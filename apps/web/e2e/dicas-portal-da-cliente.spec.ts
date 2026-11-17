import { test, expect, type Browser, type Page, type BrowserContextOptions } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O portal da cliente também tira as explicações da frente (o Heitor,
 * 2026-11-16: "pode tirar esse monte de aviso e explicação, se quiser manter
 * bota em um tooltipzinho que só aparece se passar o mouse em cima. Aproveita
 * e faz esse ajuste pra todo sistema"; docs/regras/design.md, "A explicação
 * mora na dica").
 *
 * A tela mostra o dado, o estado e o caminho para agir; o "por que" e o
 * "como funciona" ficam no "i" ao lado do título — que abre ao passar o mouse
 * e, no celular (o app Android), no toque.
 *
 * Numa rede [e2e] própria, com a cliente dela.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let aConfirmar = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>, opcoes: BrowserContextOptions = {}) {
  const ctx = await browser.newContext({ storageState: cliente!.estado, ...opcoes })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dpc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`dpcc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  // Um atendimento concluído esperando a confirmação dela (o Início e o Confirmar).
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() - 86_400_000).toISOString(), completed_at: new Date(Date.now() - 86_400_000).toISOString(),
    duration_min: 30, price: 0, status: 'COMPLETED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'o atendimento concluído').toBeNull()
  aConfirmar = data!.id
  // Crédito na ficha (o Financeiro).
  const c = await db().from('internal_credits').insert({ client_id: cliente.clientId, branch_id: rede.branchId, amount: 100, description: '[e2e] Crédito' })
  expect(c.error, 'dar o crédito').toBeNull()
})

// O limpar() da rede leva o atendimento e o crédito junto (docs/regras/e2e.md).
test.afterAll(async () => {
  await cliente?.limpar(); await rede?.limpar()
})

test('Perfil: os dados à vista; quem altera e o que é o pedido de cópia, na dica', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/perfil`)
    await expect(p.getByRole('heading', { name: 'Meus dados pessoais' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Solicitar meus dados' })).toBeVisible()

    // Nenhum parágrafo de explicação à vista.
    await expect(p.getByText('Para alterar esses dados, fale com a equipe.')).toBeHidden()
    await expect(p.getByText(/Você pode pedir uma cópia de tudo/)).toBeHidden()
    await expect(p.getByText(/passa por liberação da equipe/)).toBeHidden()

    // Cada um aparece ao passar o mouse na dica dele.
    await p.getByRole('button', { name: 'Como alterar estes dados' }).hover()
    await expect(p.getByText('Para alterar esses dados, fale com a equipe.')).toBeVisible()
    await p.getByRole('button', { name: 'Sobre a cópia dos seus dados' }).hover()
    await expect(p.getByText(/Você pode pedir uma cópia de tudo/)).toBeVisible()
    await p.getByRole('button', { name: 'Sobre o prontuário no pedido' }).hover()
    await expect(p.getByText(/passa por liberação da equipe/)).toBeVisible()
    await p.mouse.move(0, 0)
    await expect(p.getByText(/passa por liberação da equipe/)).toBeHidden()
  })
})

test('Início e Confirmar: o "é opcional" e o "confirme que foi feito" moram na dica', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const avaliar = p.locator('[data-aguardando-confirmacao]')
    await expect(avaliar).toContainText('Como foram os seus atendimentos')
    await expect(avaliar.getByText(/É opcional/)).toBeHidden()
    await avaliar.getByRole('button', { name: 'Sobre a avaliação' }).hover()
    await expect(avaliar.getByText(/É opcional/)).toBeVisible()

    await p.goto(`/${slug}/cliente/atendimentos/${aConfirmar}/confirmar`)
    await expect(p.getByRole('heading', { name: 'Confirmar atendimento' })).toBeVisible()
    await expect(p.getByText(/Confirme que este atendimento foi realizado/)).toBeHidden()
    await p.getByRole('button', { name: 'Sobre a confirmação' }).hover()
    await expect(p.getByText(/Confirme que este atendimento foi realizado/)).toBeVisible()
  })
})

test('Financeiro e ficha de saúde: o saldo e o vazio à vista; o "como usar" e o "quando aparece", na dica', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    const credito = p.locator('[data-credito-interno]')
    await expect(credito).toContainText(/R\$\s100,00/)
    await expect(credito.getByText(/Use como forma de pagamento/)).toBeHidden()
    await credito.getByRole('button', { name: 'Como usar o crédito' }).hover()
    await expect(credito.getByText(/Use como forma de pagamento/)).toBeVisible()

    await p.goto(`/${slug}/cliente/pre-atendimento`)
    await expect(p.getByText('Nada para responder agora')).toBeVisible()
    await expect(p.getByText(/Quando a equipe precisar de alguma informação/)).toBeHidden()
    await p.getByRole('button', { name: 'Quando a ficha aparece aqui' }).hover()
    await expect(p.getByText(/Quando a equipe precisar de alguma informação/)).toBeVisible()
  })
})

test('no celular (o app), a dica abre no toque', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/perfil`)
    await expect(p.getByText('Para alterar esses dados, fale com a equipe.')).toBeHidden()
    await p.getByRole('button', { name: 'Como alterar estes dados' }).tap()
    await expect(p.getByText('Para alterar esses dados, fale com a equipe.')).toBeVisible()
  }, { viewport: { width: 390, height: 844 }, hasTouch: true })
})
