import { test, expect, devices, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os defeitos da tela do atendimento na 10ª simulação (2026-11-10), da F49:
 * - D1: no celular (Pixel 7, 412 px) a linha de ações do topo media 744 px, e o
 *   "Finalizar atendimento" ficava em x=461, fora da tela e sem rolagem — a dona
 *   que atende sozinha só concluía com um clique por JavaScript.
 * - A3: na mesma linha, o título quebrava uma palavra por linha e o selo
 *   "Atendimento em andamento" encostava no cronômetro.
 * - D6: o cabeçalho dizia "Cliente desde nov 2026" (o cadastro) para quem a
 *   planilha importada diz "desde 2021" (`clients.cliente_desde`).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let profissional: MembroDeTeste | null = null
const PIXEL_7 = devices['Pixel 7']

async function noCelular(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({
    storageState: quem.estado,
    viewport: { width: 412, height: 839 }, deviceScaleFactor: PIXEL_7.deviceScaleFactor,
    isMobile: true, hasTouch: true, userAgent: PIXEL_7.userAgent,
  })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function emAndamento(rotulo: string) {
  const cliente = await rede!.criarCliente(rotulo)
  await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`at10${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // O nome longo do procedimento, como o da simulação.
  expect((await db().from('procedures').update({ name: `${PREFIXO} Limpeza de pele profunda com extração ${marca}` }).eq('id', rede.procedureId)).error).toBeNull()
  profissional = await criarMembro(`at10p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'copilot', nivel: 'MANAGE' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('D1 e A3: no celular, o "Finalizar atendimento" fica à vista — no alto e no fim da tela — e conclui de verdade', async ({ browser }) => {
  test.setTimeout(120_000)
  const { id } = await emAndamento('Celular')
  await noCelular(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const finalizar = p.getByRole('button', { name: 'Finalizar atendimento' })
    await expect(finalizar).toBeVisible()
    await expect(finalizar, 'o Finalizar inteiro na tela, sem rolar').toBeInViewport({ ratio: 1 })

    // A3: o título não quebra palavra por linha, e o selo não encosta no cronômetro.
    const titulo = p.getByRole('heading', { level: 1 })
    const caixaDoTitulo = (await titulo.boundingBox())!
    expect(caixaDoTitulo.width, 'o título tem a largura da tela').toBeGreaterThan(300)
    const selo = p.getByText('Atendimento em andamento', { exact: true })
    const cronometro = p.locator('[data-cronometro]')
    await expect(cronometro).toBeVisible()
    const a = (await selo.boundingBox())!, b = (await cronometro.boundingBox())!
    const encosta = a.x < b.x + b.width + 8 && b.x < a.x + a.width + 8 && a.y < b.y + b.height + 4 && b.y < a.y + a.height + 4
    expect(encosta, 'o selo longe do cronômetro').toBe(false)

    // Nenhuma ação do topo fora da largura da tela (o Cancelar também se alcança).
    const cancelar = p.getByRole('button', { name: 'Cancelar', exact: true })
    const c = (await cancelar.boundingBox())!
    expect(c.x).toBeGreaterThanOrEqual(0)
    expect(c.x + c.width).toBeLessThanOrEqual(412)

    // No fim da página (onde se escreve a evolução), o Finalizar continua à vista.
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(finalizar).toBeInViewport({ ratio: 1 })
    // O botão do Copilot, se houver, não fica por cima dele.
    const copilot = p.locator('.copilot-botao')
    if (await copilot.count()) {
      const f = (await finalizar.boundingBox())!, k = (await copilot.boundingBox())!
      const sobre = f.x < k.x + k.width && k.x < f.x + f.width && f.y < k.y + k.height && k.y < f.y + f.height
      expect(sobre, 'o Copilot não cobre o Finalizar').toBe(false)
    }

    // O clique de verdade (sem JavaScript) abre a janela e conclui.
    await finalizar.click()
    const janela = p.getByRole('dialog', { name: 'Finalizar atendimento' })
    await expect(janela).toBeVisible()
    const confirmar = janela.getByRole('button', { name: 'Confirmar conclusão' })
    await expect(confirmar).toBeInViewport()
    await confirmar.click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data?.status,
      { timeout: 30_000 }).toBe('COMPLETED')
  })
})

test('D6: o cabeçalho do atendimento diz "Cliente desde" da planilha importada', async ({ browser }) => {
  const { id, cliente } = await emAndamento('Importada')
  expect((await db().from('clients').update({ cliente_desde: '2021-03-01' }).eq('id', cliente)).error).toBeNull()
  await noCelular(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    // 01/03 à meia-noite UTC é 28/02 em Brasília: o dia gravado é que vale.
    await expect(p.getByText(/Cliente desde/)).toContainText('Cliente desde mar 2021')
  })
})
