import { test, expect, type Browser, type Page } from '@playwright/test'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'

/**
 * As explicações saem da tela e vão para a dica, também no SISTEMA (o Heitor,
 * 2026-11-16: "pode tirar esse monte de aviso e explicação, se quiser manter
 * bota em um tooltipzinho que só aparece se passar o mouse em cima. Aproveita e
 * faz esse ajuste pra todo sistema").
 *
 * A tela mostra o título, o dado e o caminho para agir; o subtítulo de
 * apresentação e o "por que" ficam no "i" ao lado do rótulo, que abre ao passar
 * o mouse. O componente é o do núcleo (`@estetica-os/nucleo/components/dica`):
 * os apps da plataforma não importam do app da rede.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const SIS = () => urlDaPlataforma('sistema')
let admin: AtendenteDeTeste

test.beforeAll(async () => {
  test.setTimeout(120_000)
  admin = await criarAtendente(`dica${marca}`, { papel: 'ADMIN' })
})
test.afterAll(async () => { await admin?.limpar() })

async function com(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O texto não está à vista; passa o mouse na dica, aparece; sai, some. */
async function moraNaDica(p: Page, rotulo: string, texto: RegExp) {
  await expect(p.getByRole('button', { name: rotulo })).toBeVisible({ timeout: 20_000 })
  await expect(p.getByText(texto)).toBeHidden()
  await p.getByRole('button', { name: rotulo }).hover()
  await expect(p.getByRole('tooltip').filter({ hasText: texto })).toBeVisible()
  await p.mouse.move(0, 0)
  await expect(p.getByText(texto)).toBeHidden()
}

test('os subtítulos das páginas do sistema moram na dica do título, e o título não muda de nome', async ({ browser }) => {
  await com(browser, admin.estado, async p => {
    for (const [caminho, titulo, rotulo, texto] of [
      ['/equipe', 'Equipe da plataforma', 'Sobre a equipe da plataforma', /Quem atende as redes/],
      ['/auditoria', 'Auditoria da plataforma', 'Sobre a auditoria', /Os 200 registros mais recentes/],
      ['/planos', 'Planos', 'Sobre os planos', /O que o BellarisOS vende/],
      ['/redes/nova', 'Nova rede', 'Sobre a nova rede', /O responsável recebe um e-mail para definir a senha/],
    ] as const) {
      await p.goto(`${SIS()}${caminho}`)
      // A dica fica fora do h1: o nome exato do título continua o mesmo.
      await expect(p.getByRole('heading', { name: titulo, exact: true }), caminho).toBeVisible({ timeout: 20_000 })
      await moraNaDica(p, rotulo, texto)
    }
  })
})

test('Configurações: a apresentação, o webhook do Asaas, a carência e a verificação, cada um na sua dica', async ({ browser }) => {
  await com(browser, admin.estado, async p => {
    await p.goto(`${SIS()}/configuracoes`)
    await expect(p.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible({ timeout: 20_000 })
    await moraNaDica(p, 'Sobre as configurações', /As regras da assinatura, o acesso da equipe/)
    await moraNaDica(p, 'Como ligar o webhook do Asaas', /No painel do Asaas, o webhook vai para/)
    await moraNaDica(p, 'Sobre a carência', /passada a carência, o acesso é suspenso sozinho/)
    await moraNaDica(p, 'Sobre a verificação em duas etapas', /Ligada, quem é da plataforma só entra/)
    // Os campos seguem ligados aos rótulos (a dica fica fora do <label>).
    await expect(p.getByLabel('Dias de carência (atraso até suspender)')).toBeVisible()
    await expect(p.getByLabel('Exigir a verificação em duas etapas de toda a equipe')).toBeVisible()
    // O dado continua à vista.
    await expect(p.getByText(/Último webhook recebido/)).toBeVisible()
  })
})

test('Planos e Nova rede: a cota do Copilot, os adicionais e a nota do valor moram na dica', async ({ browser }) => {
  await com(browser, admin.estado, async p => {
    await p.goto(`${SIS()}/planos`)
    await moraNaDica(p, 'Sobre a cota do Copilot', /Um pedido comum gasta de 3 a 10 mil tokens/)
    await moraNaDica(p, 'Sobre os adicionais à venda', /Quem já contratou mantém o preço da época/)
    await moraNaDica(p, 'A quem vale a mudança do plano', /não muda as redes que já o assinam/)

    await p.goto(`${SIS()}/redes/nova`)
    await moraNaDica(p, 'Sobre o valor mensal', /Mude só para um preço especial desta rede/)
    await expect(p.getByLabel('Valor mensal (R$)')).toBeVisible()
    // O "Já cobrando" não abre parágrafo: o que ele faz está na dica do "Como começa".
    await p.getByRole('button', { name: 'Já cobrando', exact: true }).first().click()
    await expect(p.getByText(/a cobrança mensal liga no Asaas/)).toBeHidden()
    await p.getByRole('button', { name: 'Sobre como a rede começa' }).hover()
    await expect(p.getByText(/a cobrança mensal liga no Asaas/)).toBeVisible()
  })
})

test('Uso do Copilot: o "como se calcula o custo" mora na dica do título', async ({ browser }) => {
  await com(browser, admin.estado, async p => {
    await p.goto(`${SIS()}/copilot`)
    await expect(p.getByRole('heading', { name: 'Uso do Copilot', exact: true })).toBeVisible({ timeout: 20_000 })
    await moraNaDica(p, 'Como se calcula o custo do Copilot', /Custo estimado pelo preço público de cada modelo/)
  })
})

// O defeito da 1ª versão (2026-11-16): a dica era um <button>, e dentro do
// <fieldset disabled> da tela só de leitura (o GERENTE vê, não edita) ela não
// abria no clique, no toque nem no teclado. Explicar não é editar: abre sempre.
test('quem só vê o sistema abre a dica no clique e no teclado, dentro da tela só de leitura', async ({ browser }) => {
  const gerente = await criarAtendente(`dicg${marca}`, { papel: 'GERENTE' })
  try {
    await com(browser, gerente.estado, async p => {
      await p.goto(`${SIS()}/planos`)
      const dica = p.getByRole('button', { name: 'Sobre a cota do Copilot' })
      await expect(dica).toBeVisible({ timeout: 20_000 })
      await expect(p.locator('fieldset[disabled]').first()).toBeAttached()
      await dica.click()
      await expect(p.getByRole('tooltip').filter({ hasText: /Um pedido comum gasta de 3 a 10 mil tokens/ })).toBeVisible()
      await p.keyboard.press('Escape')
      await expect(p.getByRole('tooltip')).toHaveCount(0)
      await dica.focus()
      await p.keyboard.press('Enter')
      await expect(p.getByRole('tooltip').filter({ hasText: /Um pedido comum gasta de 3 a 10 mil tokens/ })).toBeVisible()
    })
  } finally { await gerente.limpar() }
})
