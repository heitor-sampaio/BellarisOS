import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'

/**
 * F7b (H3, "a dona vê tudo, sempre"): o "Reativar clientes" e o "Clientes no
 * mês" só existiam no dashboard da UNIDADE, e a dona da clínica usa o /admin.
 * Agora o dashboard da rede mostra os dois:
 *  - "Reativar clientes" da REDE (`metrics_clientes_para_reativar_rede`): sem
 *    visita em NENHUMA unidade da clínica há mais de 90 dias — quem veio a
 *    outra unidade não está "sumida" —, com a unidade de cada uma (a da
 *    última visita; quem nunca veio, a do cadastro);
 *  - "Clientes no período": o ciclo do núcleo (novos, agendamentos,
 *    concluídos, cancelados/faltas) no período escolhido, até agora.
 * Numa rede [e2e] com duas unidades.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} rc${marca}`
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let segunda = ''
let nomeDaPrimeira = ''
const nomeDaSegunda = `${PREFIXO} Segunda rc${marca}`
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function cliente(rotulo: string, criadaHaDias: number) {
  const id = await rede!.criarCliente(rotulo)
  expect((await db().from('clients').update({ created_at: diasAtras(criadaHaDias) }).eq('id', id)).error).toBeNull()
  return id
}

async function atendimento(clientId: string, branchId: string, quando: string, status = 'COMPLETED') {
  const { error } = await db().from('appointments').insert({
    branch_id: branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: quando, duration_min: 30, price: 0, status, source: 'INTERNAL',
    ...(status === 'COMPLETED' ? { completed_at: quando } : {}),
  })
  expect(error).toBeNull()
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`rc${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  nomeDaPrimeira = (await db().from('branches').select('name').eq('id', rede.branchId).single<{ name: string }>()).data!.name
  segunda = (await db().from('branches').insert({ tenant_id: rede.tenantId, name: nomeDaSegunda, slug: `e2e-rc-${marca}` })
    .select('id').single<{ id: string }>()).data!.id
  dona = await criarMembro(`rcd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })

  // Marlene: veio à Segunda há 120 dias e sumiu da clínica.
  await atendimento(await cliente('Marlene', 200), segunda, diasAtras(120))
  // Carla: sumiu da primeira unidade, mas veio à Segunda há 10 dias — não está sumida da clínica.
  const carla = await cliente('Carla', 200)
  // A da unidade é de quem foi atendida nela (T1 do Bloco Tags: o fato, não a tag).
  await atendimento(carla, rede.branchId, diasAtras(120))
  await atendimento(carla, segunda, diasAtras(10))
  // Nunca veio: cadastrada há 200 dias na primeira unidade, sem atendimento.
  await cliente('Nunca veio', 200)
  // Nova: cadastrada hoje, atendida agora — entra no "Clientes no período" de hoje.
  await atendimento(await cliente('Nova', 0), rede.branchId, haMinutosHoje(5))
})

test.afterAll(async () => {
  if (rede) {
    expect((await db().from('appointments').delete().in('branch_id', [rede.branchId, segunda])).error).toBeNull()
  }
  await dona?.limpar()
  await rede?.limpar()
  if (segunda) await db().from('branches').delete().eq('id', segunda)
})

test('a dona vê no /admin as clientes a reativar da clínica inteira, com a unidade de cada uma', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/dashboard')
    const quadro = p.locator('[data-reativar-clientes]')
    await expect(quadro).toBeVisible()
    const marlene = quadro.locator('[data-cliente]', { hasText: nome('Marlene') })
    await expect(marlene).toContainText('Última visita há 120 dias')
    await expect(marlene).toContainText(nomeDaSegunda)
    const nunca = quadro.locator('[data-cliente]', { hasText: nome('Nunca veio') })
    await expect(nunca).toContainText('Nunca veio')
    await expect(nunca).toContainText(nomeDaPrimeira)
    // Veio à outra unidade há 10 dias: não está sumida da clínica.
    await expect(quadro).not.toContainText(nome('Carla'))
  })
})

test('a dona vê no /admin o "Clientes no período", do núcleo, no período escolhido', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/dashboard?period=today')
    const quadro = p.locator('[data-clientes-do-periodo]')
    await expect(quadro).toBeVisible()
    await expect(quadro.locator('[data-etapa="Novos clientes"]')).toContainText('1')
    await expect(quadro.locator('[data-etapa="Agendamentos"]')).toContainText('1')
    await expect(quadro.locator('[data-etapa="Concluídos"]')).toContainText('1')
    await expect(quadro.locator('[data-etapa="Cancelados/faltas"]')).toContainText('0')
  })
})

test('com ?unidade=, o quadro é o da unidade (a Carla sumiu da primeira)', async ({ browser }) => {
  const slug = (await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()).data!.slug
  await como(browser, async p => {
    await p.goto(`/admin/dashboard?unidade=${slug}`)
    const quadro = p.locator('[data-reativar-clientes]')
    await expect(quadro).toBeVisible()
    await expect(quadro).toContainText(nome('Carla'))
  })
})

test('r2-ind-03: na clínica de UMA unidade, o quadro conta todas as clientes ativas — também a que nunca foi atendida', async ({ browser }) => {
  // O Heitor (revisão de 03/11): "na clínica de uma unidade, a clínica e a unidade são a mesma coisa".
  const umaSo = await criarOutraRede(`rcu${marca}`)
  let donaDaUma: MembroDeTeste | null = null
  try {
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', umaSo.tenantId)).error).toBeNull()
    const slug = (await db().from('branches').select('slug').eq('id', umaSo.branchId).single<{ slug: string }>()).data!.slug
    donaDaUma = await criarMembro(`rcud${marca}`, { tenant: umaSo.tenantId, donoDaRede: true, permissoes: [] })
    // Cadastrada há 200 dias, sem tag e sem nenhuma visita.
    const semTag = await umaSo.criarCliente('Sem a tag')
    expect((await db().from('clients').update({ created_at: diasAtras(200), tags: [] }).eq('id', semTag)).error).toBeNull()
    const ctx = await browser.newContext({ storageState: donaDaUma.estado })
    try {
      const p = await ctx.newPage()
      for (const rota of ['/admin/dashboard', `/${slug}/dashboard`]) {
        await p.goto(rota)
        const quadro = p.locator('[data-reativar-clientes]')
        await expect(quadro, rota).toBeVisible()
        await expect(quadro.locator('[data-cliente]', { hasText: `${PREFIXO} Sem a tag` }), `${rota}: a cliente nunca atendida`).toBeVisible()
      }
    } finally { await ctx.close() }
  } finally {
    await donaDaUma?.limpar()
    await umaSo.limpar()
  }
})
