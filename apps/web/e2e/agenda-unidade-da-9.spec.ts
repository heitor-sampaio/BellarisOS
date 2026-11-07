import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje, diaEmQueAUnidadeAbre } from './apoio/datas'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A agenda da 2ª unidade na 9ª simulação (2026-11-07):
 * - A33: não havia como mudar a UNIDADE de um agendamento (H5: a cliente é da
 *   clínica) — mover a sessão da Luana para a Menino Deus exigia cancelar e refazer.
 * - D10: "Seus atendimentos em outras unidades" levava quem é da rede a
 *   `/menino-deus/agenda/<id da Moinhos>` (404), e listava o já concluído.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let moinhos = ''
let slugMoinhos = ''
let menino = ''
let slugMenino = ''
let carolina: MembroDeTeste | null = null
let michele: MembroDeTeste | null = null
let priscila: MembroDeTeste | null = null
let cliente = ''
let sala = ''
const SALA = `${PREFIXO} Sala Rosa ag9${marca}`

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ag9${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  moinhos = rede.branchId
  slugMoinhos = (await db().from('branches').select('slug').eq('id', moinhos).single<{ slug: string }>()).data!.slug
  slugMenino = `e2e-md-ag9${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Menino Deus ag9${marca}`, slug: slugMenino, horario: null }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  menino = b!.id
  cliente = await rede.criarCliente('Juliana')
  // A dona que atende, nas duas unidades.
  carolina = await criarMembro(`ag9c${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Carolina', permissoes: [] })
  expect((await db().from('users').update({ atende_em: [moinhos, menino] }).eq('id', carolina.userId)).error).toBeNull()
  // A Michele atende só na Menino Deus; a Priscila, só na Moinhos.
  michele = await criarMembro(`ag9m${marca}`, { tenant: rede.tenantId, branchId: menino, rotulo: 'Michele', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  priscila = await criarMembro(`ag9p${marca}`, { tenant: rede.tenantId, branchId: moinhos, rotulo: 'Priscila', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  expect((await db().from('users').update({ atende_em: [menino] }).eq('id', michele.userId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [moinhos] }).eq('id', priscila.userId)).error).toBeNull()
  // A sala da Moinhos, criada antes de qualquer tela (o cache das salas).
  const { data: r, error: eR } = await db().from('rooms').insert({ branch_id: moinhos, name: SALA }).select('id').single<{ id: string }>()
  expect(eR).toBeNull()
  sala = r!.id
})

test.afterAll(async () => {
  await priscila?.limpar(); await michele?.limpar(); await carolina?.limpar()
  await rede?.limpar()
})

test('D10: o atendimento de outra unidade abre no endereço dela, e o concluído não aparece como pendente', async ({ browser }) => {
  const daqui = Date.now()
  const futuro = new Date(daqui + 2 * 3_600_000).toISOString()
  const passado = haMinutosHoje(1)
  const { data: ags, error } = await db().from('appointments').insert([
    { branch_id: moinhos, client_id: cliente, procedure_id: rede!.procedureId, professional_id: carolina!.userId,
      scheduled_at: futuro, duration_min: 30, price: 100, status: 'SCHEDULED' },
    { branch_id: moinhos, client_id: cliente, procedure_id: rede!.procedureId, professional_id: carolina!.userId,
      scheduled_at: passado, duration_min: 30, price: 100, status: 'COMPLETED', completed_at: new Date().toISOString() },
  ]).select('id, status')
  expect(error).toBeNull()
  const aberto = ags!.find(a => a.status === 'SCHEDULED')!.id as string
  const concluido = ags!.find(a => a.status === 'COMPLETED')!.id as string
  await como(browser, carolina!.estado, async p => {
    await p.goto(`/${slugMenino}/agenda`)
    const painel = p.locator('[data-meus-de-outras-unidades]')
    await expect(painel.locator(`a[href$="/agenda/${aberto}"]`)).toHaveCount(1)
    await expect(painel.locator(`a[href$="/agenda/${concluido}"]`), 'o concluído não é pendente').toHaveCount(0)
    await painel.locator(`a[href$="/agenda/${aberto}"]`).click()
    await expect(p).toHaveURL(new RegExp(`/${slugMoinhos}/agenda/${aberto}`))
    await expect(p.getByText('Página não encontrada')).toHaveCount(0)
    await expect(p.getByText(`${PREFIXO} Juliana`).first()).toBeVisible()
    // O endereço velho (da unidade da tela) também leva ao certo.
    await p.goto(`/${slugMenino}/agenda/${aberto}`)
    await expect(p).toHaveURL(new RegExp(`/${slugMoinhos}/agenda/${aberto}`))
  })
})

test('A33: a janela muda a UNIDADE do agendamento, com quem atende lá, e o histórico diz de onde para onde', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(4)
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: moinhos, client_id: cliente, procedure_id: rede!.procedureId, professional_id: carolina!.userId,
    scheduled_at: new Date(`${dia}T10:00:00-03:00`).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const nomeDaMichele = (await db().from('users').select('name').eq('id', michele!.userId).single<{ name: string }>()).data!.name
  const nomeMoinhos = (await db().from('branches').select('name').eq('id', moinhos).single<{ name: string }>()).data!.name
  const nomeMenino = `${PREFIXO} Menino Deus ag9${marca}`
  await como(browser, carolina!.estado, async p => {
    // O servidor recusa quem não atende na unidade nova.
    const r = await chamarAcao(p, 'actions/appointments.ts', 'mudarUnidadeDoAgendamento', `/${slugMoinhos}/agenda`,
      [ag!.id, { branchId: menino, professionalId: priscila!.userId, roomId: null }])
    expect(r.texto).toContain('não atende')
    await p.goto(`/${slugMoinhos}/agenda?date=${dia}`)
    await p.locator(`[data-agendamento="${ag!.id}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.getByRole('button', { name: 'Mudar de unidade' }).click()
    const mudar = janela.locator('[data-mudar-de-unidade]')
    await mudar.getByLabel('Unidade nova').selectOption({ label: nomeMenino })
    await mudar.getByLabel('Profissional na unidade nova').selectOption({ label: nomeDaMichele })
    await mudar.getByRole('button', { name: 'Mudar', exact: true }).click()
    await mudar.getByRole('button', { name: 'Confirmar a mudança' }).click()
    await expect(janela).toBeHidden()
  })
  await expect.poll(async () => (await db().from('appointments').select('branch_id, professional_id').eq('id', ag!.id).single()).data)
    .toEqual({ branch_id: menino, professional_id: michele!.userId })
  const h = (await db().from('appointment_history').select('description').eq('appointment_id', ag!.id)).data ?? []
  expect(h.map(x => x.description).join(' | ')).toContain(`de ${nomeMoinhos} para ${nomeMenino}`)
})

test('A16: o "Agendar" do cabeçalho abre no dia que a pessoa está olhando, não hoje', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(6)
  await como(browser, carolina!.estado, async p => {
    await p.goto(`/${slugMoinhos}/agenda?date=${dia}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.locator('#ag-quando'), 'a data já é a do dia na tela').toHaveValue(new RegExp(`^${dia}T`))
    // Escolhida a profissional, o "próximo livre" é desse dia em diante, não de agora.
    await modal.locator('#ag-profissional').selectOption(carolina!.userId)
    await expect(modal.locator('#ag-quando')).toHaveValue(new RegExp(`^${dia}T`))
  })
})

test('A17: a sala bloqueada o dia inteiro risca a grade de horários do Agendar, e o aviso diz "o dia inteiro"', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(7)
  const meiaNoite = new Date(`${dia}T00:00:00-03:00`)
  const { error } = await db().from('agenda_bloqueios').insert({
    tenant_id: rede!.tenantId, branch_id: moinhos, room_id: sala, motivo: 'Manutenção',
    inicio: meiaNoite.toISOString(), fim: new Date(meiaNoite.getTime() + 86_400_000).toISOString(),
  })
  expect(error).toBeNull()
  await como(browser, carolina!.estado, async p => {
    await p.goto(`/${slugMoinhos}/agenda?date=${dia}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await modal.locator('#ag-profissional').selectOption(carolina!.userId)
    await modal.locator('#ag-procedimento').selectOption(rede!.procedureId)
    await modal.locator('#ag-quando').fill(`${dia}T10:00`)
    await modal.locator('#ag-sala').selectOption({ label: SALA })
    await expect(modal.locator('[data-horario="10:00"]'), 'a sala bloqueada risca').toBeDisabled()
    await expect(modal.locator('[data-aviso-do-horario]')).toContainText('o dia ')
    await expect(modal.locator('[data-aviso-do-horario]')).not.toContainText('00:00 às 24:00')
  })
})
