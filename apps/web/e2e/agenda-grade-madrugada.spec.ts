import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D5 da simulação de 2026-10-28: a "Minha agenda" (profissional) e a agenda da
 * rede (/admin/agenda) começavam FIXAS às 07:00. Os atendimentos de 02:20 a
 * 04:15 se empilhavam na linha das 07:00 (só o de cima se clicava) ou nem
 * apareciam. A regra é a da grade da unidade (§9.1): abre no horário de
 * funcionamento e se estende pelos agendamentos de fora dele.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let profissional: MembroDeTeste | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const ids: Record<string, string> = {}

async function agendar(rotulo: string, hhmm: string, min = 30): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    scheduled_at: new Date(`${hoje}T${hhmm}:00-03:00`).toISOString(), duration_min: min, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, `agendar ${rotulo}`).toBeNull()
  ids[rotulo] = data!.id
  return data!.id
}
const apagar = async () => { await db().from('appointments').delete().eq('branch_id', rede!.branchId); for (const k of Object.keys(ids)) delete ids[k] }


test.beforeAll(async () => {
  rede = await criarOutraRede(`gm${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A unidade abre 10–18 todo dia.
  const todoDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '10:00', ate: '18:00' }]]))
  expect((await db().from('branches').update({ horario: { dias: todoDia } }).eq('id', rede.branchId)).error).toBeNull()
  profissional = await criarMembro(`gmp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  gestor = await criarMembro(`gmg${marca}`, { tenant: rede.tenantId, rotulo: 'Gestor da rede', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }] })
  cliente = await rede.criarCliente('Madrugada')
})
test.afterAll(async () => {
  if (rede) await apagar()
  await profissional?.limpar(); await gestor?.limpar(); await rede?.limpar()
})

const rotulosDeHora = async (p: import('@playwright/test').Page) =>
  (await p.getByText(/^\d\d:00$/).allTextContents()).map(t => Number(t.slice(0, 2)))

test('Minha agenda: o atendimento de madrugada tem a sua linha e abre ao clicar', async ({ browser }) => {
  await agendar('a', '02:30'); await agendar('b', '03:30')
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda`)
    await expect(p.locator(`a[href$="/agenda/${ids.a}"] > div`)).toBeVisible()
    const horas = await rotulosDeHora(p)
    expect(Math.min(...horas), 'a grade abre no atendimento mais cedo').toBe(2)
    expect(Math.max(...horas), 'e fecha no horário da unidade').toBe(17)
  } finally { await ctx.close() }
})

test('Minha agenda: o atendimento de 02:30 não fica por baixo do de 03:30', async ({ browser }) => {
  await apagar(); await agendar('a', '02:30'); await agendar('b', '03:30')
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda`)
    const card = p.locator(`a[href$="/agenda/${ids.a}"] > div`)
    await expect(card).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    // O que o clique alcançaria no centro do bloco: é o link DELE, não o do 03:30.
    const caixa = (await card.boundingBox())!
    const alvo = await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null,
      { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 })
    expect(alvo).toMatch(new RegExp(`/agenda/${ids.a}$`))
  } finally { await ctx.close() }
})

test('Minha agenda: sem atendimento fora do horário, a grade abre na abertura da unidade', async ({ browser }) => {
  await apagar(); await agendar('c', '12:00')
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda`)
    await expect(p.locator(`a[href$="/agenda/${ids.c}"] > div`)).toBeVisible()
    const horas = await rotulosDeHora(p)
    expect(Math.min(...horas)).toBe(10)
    expect(Math.max(...horas)).toBe(17)
  } finally { await ctx.close() }
})

test('/admin/agenda: o atendimento de madrugada aparece, abre e o horário vazio é clicável', async ({ browser }) => {
  await apagar(); await agendar('d', '02:30'); await agendar('e', '03:30')
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/agenda')
    await expect(p.locator(`[data-agendamento="${ids.d}"]`)).toBeVisible()
    await expect(p.locator(`[data-agendamento="${ids.e}"]`)).toBeVisible()
    const horas = await rotulosDeHora(p)
    expect(Math.min(...horas), 'abre no atendimento mais cedo').toBe(2)
    expect(Math.max(...horas), 'fecha no horário da unidade').toBe(17)
    // O de 02:30 não fica por baixo do de 03:30: clicar nele abre a folha DELE.
    await p.locator(`[data-agendamento="${ids.d}"]`).click()
    await expect(p.getByText('Madrugada').first()).toBeVisible()
    await p.keyboard.press('Escape')
    // Horário vazio da madrugada (05:00): a primeira linha é 02:00, então 3 h abaixo do topo.
    await p.reload()
    const coluna = p.locator('.agenda-coluna').first()
    await expect(p.locator(`[data-agendamento="${ids.d}"]`)).toBeVisible()
    const caixa = (await coluna.boundingBox())!
    await p.mouse.click(caixa.x + caixa.width / 2, caixa.y + 3 * 72 + 4)
    await expect(p.getByRole('heading', { name: 'Novo agendamento' })).toBeVisible()
    await expect(p.locator('input[type="datetime-local"]').first()).toHaveValue(/T05:00$/)
  } finally { await ctx.close() }
})

test('/admin/agenda: sem atendimento fora do horário, a grade abre na abertura da unidade', async ({ browser }) => {
  await apagar(); await agendar('f', '12:00')
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/agenda')
    await expect(p.locator(`[data-agendamento="${ids.f}"]`)).toBeVisible()
    const horas = await rotulosDeHora(p)
    expect(Math.min(...horas)).toBe(10)
    expect(Math.max(...horas)).toBe(17)
  } finally { await ctx.close() }
})
