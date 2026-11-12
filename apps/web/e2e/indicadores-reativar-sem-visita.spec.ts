import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D16 da 8ª simulação (2026-11-06): "Todos os clientes retornaram 🎉" com 30
 * clientes que nunca tiveram uma visita no sistema (a base importada no dia).
 * O quadro conta quem SUMIU — sem visita há 90 dias, cadastrada antes deles —,
 * e o vazio não distinguia "ninguém sumiu" de "ninguém tem visita registrada
 * ainda". Agora o vazio diz qual dos dois.
 *
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
const agendamentos: string[] = []

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const quadro = (p: Page) => p.locator('[data-reativar-clientes]')

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`rsv${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // Duas clientes cadastradas hoje (a base importada), nenhuma com visita.
  await rede.criarCliente('Importada Um')
  await rede.criarCliente('Importada Dois')
  dona = await criarMembro(`rsvd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  if (agendamentos.length) await db().from('appointments').delete().in('id', agendamentos)
  await dona?.limpar(); await rede?.limpar()
})

test.describe.serial('D16: o vazio do "Reativar clientes"', () => {
  test('sem nenhuma visita registrada, o quadro diz isso — não "todos retornaram"', async ({ browser }) => {
    await como(browser, async p => {
      for (const url of ['/admin/dashboard', `/${slug}/dashboard`]) {
        await p.goto(url)
        await expect(quadro(p)).toContainText('Nenhuma cliente tem visita registrada ainda', { timeout: 20_000 })
        await expect(quadro(p)).toContainText('2 clientes da clínica, cadastradas nos últimos 90 dias')
        await expect(quadro(p)).not.toContainText('retornaram')
      }
    })
  })

  test('com quem já veio e voltou, "ninguém sumiu" — e diz quem ainda não tem visita', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Voltou')
    const ontem = new Date(Date.now() - 86_400_000).toISOString()
    const { data, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: ontem, completed_at: ontem,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    agendamentos.push(data!.id)
    await como(browser, async p => {
      await p.goto('/admin/dashboard')
      await expect(quadro(p)).toContainText('Ninguém sumiu', { timeout: 20_000 })
      await expect(quadro(p)).toContainText('2 clientes da clínica, cadastradas nos últimos 90 dias ainda não têm visita')
    })
  })
})
