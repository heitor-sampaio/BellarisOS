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
  // Não entram: o agendado de ontem que ninguém mexeu, e o "chegou" de HOJE.
  await ag('Agendado ontem', rede.professionalId, diaAntes(1), '10:00', 'SCHEDULED')
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
      const aviso = p.locator('[data-abertos-de-antes]')
      await expect(aviso).toContainText('2 atendimentos de dias anteriores ainda abertos')
      await expect(aviso).toContainText(nome('Chegou ontem'))
      await expect(aviso).toContainText(nome('Em atendimento'))
      await expect(aviso).not.toContainText(nome('Agendado ontem'))
      await expect(aviso).not.toContainText(nome('Chegou hoje'))
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
  })
})
