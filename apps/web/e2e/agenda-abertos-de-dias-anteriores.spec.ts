import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-32 (simulação): a cliente que "Chegou" às 23:50 e não foi atendida sumia
 * do dia depois da meia-noite, sem alerta — a agenda abre no dia de hoje, e o
 * atendimento ficava aberto para sempre (sem conclusão, sem cobrança, sem
 * falta). Agora a agenda e o dashboard da unidade avisam dos atendimentos de
 * dias anteriores ainda abertos (chegou ou em atendimento), com o link para
 * resolver — e o "só os meus" da agenda vê só os dela.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let profA: MembroDeTeste | null = null
let slug = ''
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const diaAntes = (n: number) => new Date(new Date(`${hojeSP()}T12:00:00-03:00`).getTime() - n * 86_400_000).toISOString().slice(0, 10)
const as = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString()
const nome = (rotulo: string) => `${PREFIXO} ${rotulo} ab${marca}`

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`ab${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  profA = await criarMembro(`abp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional A',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profA.userId)).error).toBeNull()
  recepcao = await criarMembro(`abr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })

  const ag = async (rotulo: string, prof: string, dia: string, hora: string, status: string, extra: Record<string, unknown> = {}) => {
    const cliente = await rede!.criarCliente(rotulo)
    const { error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: prof,
      scheduled_at: as(dia, hora), duration_min: 30, price: 0, status, source: 'INTERNAL', ...extra,
    })
    expect(error, rotulo).toBeNull()
  }
  // Ontem 23:50, chegou e ninguém atendeu (da outra profissional).
  await ag('Chegou ontem', rede.professionalId, diaAntes(1), '23:50', 'ARRIVED', { arrived_at: as(diaAntes(1), '23:52') })
  // Anteontem, ficou "em atendimento" (da profissional A).
  await ag('Em atendimento', profA.userId, diaAntes(2), '15:00', 'IN_PROGRESS', { started_at: as(diaAntes(2), '15:05') })
  // agenda-03 (revisão de 2026-11-02): o agendado de ontem que ninguém mexeu
  // entra num grupo À PARTE ("marcar falta ou concluir?").
  await ag('Agendado ontem', rede.professionalId, diaAntes(1), '10:00', 'SCHEDULED')
  // Não entra: o "chegou" de HOJE.
  await ag('Chegou hoje', rede.professionalId, hojeSP(), '00:05', 'ARRIVED', { arrived_at: as(hojeSP(), '00:05') })
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await recepcao?.limpar(); await profA?.limpar(); await rede?.limpar()
})

for (const tela of ['agenda', 'dashboard'] as const) {
  test(`a ${tela} da unidade avisa dos atendimentos de dias anteriores ainda abertos`, async ({ browser }) => {
    await como(browser, recepcao!.estado, async p => {
      await p.goto(`/${slug}/${tela}`)
      const aviso = p.locator('[data-abertos-de-antes] [data-grupo="abertos"]')
      await expect(aviso).toContainText('2 atendimentos de dias anteriores ainda abertos')
      await expect(aviso).toContainText(nome('Chegou ontem'))
      await expect(aviso).toContainText(nome('Em atendimento'))
      await expect(aviso).not.toContainText(nome('Agendado ontem'))
      await expect(aviso).not.toContainText(nome('Chegou hoje'))
      // O agendado que passou sem chegada, num grupo próprio.
      const semChegada = p.locator('[data-abertos-de-antes] [data-grupo="sem-chegada"]')
      await expect(semChegada).toContainText('1 agendamento de dias anteriores passou sem chegada')
      await expect(semChegada).toContainText('marcar falta ou concluir?')
      await expect(semChegada).toContainText(nome('Agendado ontem'))
      await expect(aviso.getByRole('link', { name: new RegExp(nome('Chegou ontem').replace(/[[\]]/g, '\\$&')) })).toHaveAttribute('href', new RegExp(`^/${slug}/agenda/[0-9a-f-]{36}$`))
    })
  })
}

test('com a agenda "só os meus", a profissional vê só o atendimento aberto dela', async ({ browser }) => {
  await como(browser, profA!.estado, async p => {
    await p.goto(`/${slug}/agenda`)
    const aviso = p.locator('[data-abertos-de-antes]')
    await expect(aviso).toContainText('1 atendimento de dias anteriores ainda aberto')
    await expect(aviso).toContainText(nome('Em atendimento'))
    await expect(aviso).not.toContainText(nome('Chegou ontem'))
    // O agendado sem chegada é da outra profissional: não aparece para ela.
    await expect(aviso).not.toContainText(nome('Agendado ontem'))
  })
})

test('H3: a dona vê o aviso no dashboard da REDE, com a unidade de cada um e o link do atendimento', async ({ browser }) => {
  // "Ajuste para que a dona veja tudo, sempre" (H3): a dona da clínica única
  // usa o /admin e nunca via o aviso, que só existia no dashboard da unidade.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)).error).toBeNull()
  const dona = await criarMembro(`abd${marca}`, { tenant: rede!.tenantId, donoDaRede: true, permissoes: [] })
  // Com duas unidades, cada linha diz a sua (com uma só, não há o que dizer — D-19).
  const segunda = (await db().from('branches').insert({ tenant_id: rede!.tenantId, name: `[e2e] Segunda ${marca}`, slug: `e2e-abs-${marca}` })
    .select('id').single<{ id: string }>()).data!.id
  try {
    await como(browser, dona.estado, async p => {
      await p.goto('/admin/dashboard')
      const aviso = p.locator('[data-abertos-de-antes]')
      await expect(aviso.locator('[data-grupo="abertos"]')).toContainText('2 atendimentos de dias anteriores ainda abertos')
      await expect(aviso.locator('[data-grupo="sem-chegada"]')).toContainText(nome('Agendado ontem'))
      const unidade = (await db().from('branches').select('name').eq('id', rede!.branchId).single<{ name: string }>()).data!.name
      await expect(aviso).toContainText(unidade)
      await expect(aviso.getByRole('link', { name: new RegExp(nome('Chegou ontem').replace(/[[\]]/g, '\\$&')) }))
        .toHaveAttribute('href', /^\/admin\/agenda\/[0-9a-f-]{36}$/)
    })
  } finally { await dona.limpar(); await db().from('branches').delete().eq('id', segunda) }
})
