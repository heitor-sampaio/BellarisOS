import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os atritos do app da cliente da 11ª simulação (2026-11-10, a Adriana, a
 * Beatriz e a Camila da Azaleia), numa rede [e2e] própria:
 * - A56: remarcar com "Sem preferência" trocou a Bruna pela Carla, e a
 *   profissional só aparecia depois de confirmar. O remarcar conta o próprio
 *   agendamento como atendimento do dia dela (e a escolha pendia para a outra);
 *   e a tela diz quem atende ANTES de confirmar.
 * - A57: o horário dentro do prazo do app (menos de 24 h) avisa — no agendar
 *   e também no remarcar, qualquer que seja o dia.
 * - A58: "até ter, 10/11 às 14:00" — o dia da semana por extenso.
 */

const marca = `pc11${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede
let slug = ''
let bia: MembroDeTeste
let cliente: ClienteDeTeste

const diaBR = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
/** O n-ésimo dia ÚTIL a partir de amanhã (a grade padrão não abre no fim de semana). */
const dia = (n: number) => {
  const uteis: string[] = []
  for (let i = 1; uteis.length < n; i++) {
    const d = new Date(Date.now() + i * 86_400_000)
    const semana = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(d)
    if (semana !== 'Sat' && semana !== 'Sun') uteis.push(diaBR(d))
  }
  return uteis[n - 1]!
}
const em = (d: string, h: string) => new Date(`${d}T${h}:00-03:00`).toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: cliente.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function ocupar(professionalId: string, quando: string) {
  const clientId = await rede.criarCliente(`Ocupa ${quando}`)
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: clientId, procedure_id: rede.procedureId, professional_id: professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando,
  })).error, 'ocupar o horário').toBeNull()
}
function devolvido(texto: string): unknown {
  for (const l of texto.split(/\r?\n/).filter(x => x.startsWith('1:'))) {
    try { return JSON.parse(l.slice(2)) } catch { /* linha de depuração */ }
  }
  return undefined
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  const b = db()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('tenants').update({ portal_prazo_alteracao_horas: 24 }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('users').update({ branch_id: rede.branchId, provides_services: true, atende_em: [rede.branchId], name: `[e2e] Ana ${marca}` }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  bia = await criarMembro(`b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  expect((await b.from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', bia.userId)).error).toBeNull()
  cliente = await clienteComSessao(`k${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  // A Ana tem UM atendimento no dia(3): o "Sem preferência" das 10:00 vai para a Bia.
  await ocupar(rede.professionalId, em(dia(3), '08:00'))
})

test.afterAll(async () => {
  await cliente?.limpar(); await bia?.limpar(); await rede?.limpar()
})

test('A56: o "Sem preferência" do remarcar diz quem atende antes de confirmar — e não troca a Bia só porque o próprio horário contava', async ({ browser }) => {
  let id = ''
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
      branchId: rede.branchId, procedureId: rede.procedureId, professionalId: null, scheduledAt: em(dia(3), '10:00'), slug,
    }])
    id = (devolvido(r.texto) as { id: string }).id
  })
  expect((await db().from('appointments').select('professional_id').eq('id', id).single()).data?.professional_id).toBe(bia.userId)

  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${id}`)
    await p.getByRole('button', { name: 'Remarcar' }).click()
    await expect(p.getByRole('group', { name: 'Com quem?' }).getByRole('button', { name: 'Sem preferência' })).toHaveAttribute('aria-pressed', 'true')
    await p.getByLabel('Novo dia').fill(dia(3))
    await p.getByRole('button', { name: '11:00', exact: true }).click()
    // Antes de confirmar: quem fica com o horário (a Bia continua — o horário dela não conta contra ela).
    await expect(p.locator('[data-quem-atende-no-remarcar]')).toContainText(`Bia`)
    await p.getByRole('button', { name: 'Confirmar novo horário' }).click()
    await expect(p.getByText(/Agendamento remarcado/)).toBeVisible()
  })
  expect((await db().from('appointments').select('professional_id').eq('id', id).single()).data?.professional_id).toBe(bia.userId)
})

test('A57 e A58: o remarcar para menos de 24 h avisa, como o agendar; e o prazo diz o dia da semana por extenso', async ({ browser }) => {
  let id = ''
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
      branchId: rede.branchId, procedureId: rede.procedureId, professionalId: bia.userId, scheduledAt: em(dia(4), '14:00'), slug,
    }])
    id = (devolvido(r.texto) as { id: string }).id
    await p.goto(`/${slug}/cliente/agendamentos/${id}`)
    // A58: "até quarta-feira, 12/11 às 14:00" (era "até qua, 12/11…").
    await expect(p.getByText(/cancela ou remarca até ((segunda|terça|quarta|quinta|sexta)-feira|sábado|domingo), \d{2}\/\d{2} às \d{2}:\d{2}/)).toBeVisible()
    // A57: o primeiro horário livre de amanhã (o dia de Brasília).
    await p.getByRole('button', { name: 'Remarcar' }).click()
    const amanha = diaBR(new Date(Date.now() + 86_400_000))
    await p.getByLabel('Novo dia').fill(amanha)
    const primeiro = p.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()
    await expect(primeiro.or(p.getByText('Nenhum horário livre neste dia.'))).toBeVisible({ timeout: 15_000 })
    if (await primeiro.count() === 0) test.skip(true, 'amanhã sem horário livre (fim de semana)')
    const hora = (await primeiro.textContent())!.trim()
    await primeiro.click()
    const falta = new Date(em(amanha, hora)).getTime() - Date.now()
    if (falta < 24 * 3_600_000) await expect(p.locator('[data-dentro-do-prazo]')).toContainText('24 horas')
    else await expect(p.locator('[data-dentro-do-prazo]')).toHaveCount(0)
  })
})
