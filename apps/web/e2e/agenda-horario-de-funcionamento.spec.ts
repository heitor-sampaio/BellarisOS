import { test, expect, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O horário de funcionamento (2026-10-21; D11 da simulação de um dia de
 * clínica): os livres seguem a unidade e, dentro dela, o profissional — e
 * nunca oferecem o que já passou hoje (D27). Antes eram fixos em 08–20,
 * domingo inclusive, e o app oferecia horários de hoje que já tinham passado.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let crm: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`hf${marca}`)
  crm = await criarMembro(`hf${marca}`, { tenant: rede.tenantId, rotulo: 'CRM', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
})
test.afterAll(async () => {
  await crm?.limpar()
  await rede?.limpar()
})

/** A próxima data (AAAA-MM-DD) com aquele dia da semana, a partir de amanhã. */
function proxima(diaDaSemana: number): string {
  const d = new Date(Date.now() + 86_400_000)
  while (d.getUTCDay() !== diaDaSemana) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function livres(browser: Browser, data: string, duracao = 60): Promise<string[]> {
  const ctx = await browser.newContext({ storageState: crm!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/inbox')
    const r = await chamarAcao(p, 'actions/crm-scheduling.ts', 'getCrmSlots', '/admin/inbox',
      [rede!.branchId, rede!.professionalId, data, duracao])
    const m = /\[(?:"\d\d:\d\d",?)*\]/.exec(r.texto.split('\n').filter(l => /^\d+:/.test(l)).pop() ?? '')
    return m ? JSON.parse(m[0]) as string[] : []
  } finally { await ctx.close() }
}

test('os livres seguem a unidade (com a pausa), o profissional e o dia fechado', async ({ browser }) => {
  await db().from('branches').update({ horario: { dias: {
    0: [], 1: [{ de: '09:00', ate: '12:00' }, { de: '13:00', ate: '15:00' }], 2: [{ de: '09:00', ate: '11:00' }],
  } } }).eq('id', rede!.branchId)

  expect(await livres(browser, proxima(1)), 'segunda: os dois períodos, sem atravessar a pausa')
    .toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00'])
  expect(await livres(browser, proxima(0)), 'domingo fechado').toEqual([])
  expect(await livres(browser, proxima(3)), 'quarta: a unidade não abre').toEqual([])

  // O profissional só às terças, das 10 às 11 — dentro da unidade.
  await db().from('users').update({ horario: { dias: { 1: [], 2: [{ de: '10:00', ate: '11:00' }] } } }).eq('id', rede!.professionalId)
  expect(await livres(browser, proxima(1)), 'segunda: o profissional folga').toEqual([])
  expect(await livres(browser, proxima(2)), 'terça: a interseção').toEqual(['10:00'])
})

test('hoje, o que já passou não é oferecido', async ({ browser }) => {
  await db().from('branches').update({ horario: { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) } }).eq('id', rede!.branchId)
  await db().from('users').update({ horario: null }).eq('id', rede!.professionalId)
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const agora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  const lista = await livres(browser, hoje, 30)
  expect(lista.length, 'há livres hoje').toBeGreaterThan(0)
  expect(lista.every(h => h > agora), `nenhum antes de ${agora}`).toBe(true)
})

test('a rede configura o horário pela tela: a unidade e o profissional', async ({ browser }) => {
  await db().from('branches').update({ horario: null }).eq('id', rede!.branchId)
  await db().from('users').update({ horario: null, provides_services: true }).eq('id', rede!.professionalId)
  const gestor = await criarMembro(`hfg${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'MANAGE' }],
  })
  const ctx = await browser.newContext({ storageState: gestor.estado })
  try {
    const p = await ctx.newPage()
    // A unidade: segunda fecha às 18, sábado não abre.
    await p.goto(`/admin/branches/${rede!.branchId}`)
    // Antes da hidratação o campo aceita o texto e o React não vê: repete até o
    // estado acompanhar (o campo oculto é o que vai ao servidor).
    const oculto = p.locator('input[name="horario"]')
    await expect(async () => {
      // Alterna o valor: repetir o mesmo não dispara mudança nenhuma.
      await p.getByLabel('Segunda, fecha às').fill('17:00')
      await p.getByLabel('Segunda, fecha às').fill('18:00')
      expect(await oculto.inputValue()).toContain('"1":[{"de":"08:00","ate":"18:00"}]')
    }).toPass({ timeout: 20_000 })
    await p.getByLabel('Sábado abre').uncheck()
    await expect.poll(() => oculto.inputValue()).toContain('"6":[]')
    await p.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(p.getByText('Dados salvos com sucesso.')).toBeVisible()
    const { data: u } = await db().from('branches').select('horario').eq('id', rede!.branchId).single()
    const dias = (u!.horario as { dias: Record<string, { de: string; ate: string }[]> }).dias
    expect(dias['1']).toEqual([{ de: '08:00', ate: '18:00' }])
    expect(dias['6']).toEqual([])

    // O profissional: deixa de seguir a unidade e não atende às terças.
    await p.goto('/admin/team')
    await p.getByTitle(/^Editar \[e2e\] Prof/).click()
    // O profissional da rede de teste nasce sem cargo: o formulário exige um.
    await p.locator('select[name="roleId"]').selectOption({ label: 'Profissional' })
    const doMembro = p.locator('form').filter({ has: p.getByLabel('Segue o horário da unidade') }).locator('input[name="horario"]')
    await expect(async () => {
      const segue = p.getByLabel('Segue o horário da unidade')
      if (await segue.isChecked()) await segue.uncheck()
      const terca = p.getByLabel('Terça abre')
      if (await terca.isChecked()) await terca.uncheck()
      expect(await doMembro.inputValue()).toContain('"2":[]')
    }).toPass({ timeout: 20_000 })
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect.poll(async () => {
      const { data } = await db().from('users').select('horario').eq('id', rede!.professionalId).single()
      return (data?.horario as { dias?: Record<string, unknown[]> } | null)?.dias?.['2'] ?? 'nada'
    }, { message: 'o horário do profissional foi gravado' }).toEqual([])
  } finally {
    await ctx.close()
    await gestor.limpar()
  }
})

test('a agenda e o dashboard da unidade dão a MESMA ocupação (D12)', async ({ browser }) => {
  // Era 12 h por profissional na agenda (sem os concluídos) e 8 h no dashboard.
  const todoDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '08:00', ate: '20:00' }]]))
  await db().from('branches').update({ horario: { dias: todoDia } }).eq('id', rede!.branchId)
  // O profissional na unidade: é a lista da agenda e do dashboard (branch_id).
  await db().from('users').update({ horario: null, provides_services: true, is_active: true, branch_id: rede!.branchId }).eq('id', rede!.professionalId)
  const cliente = await rede!.criarCliente('Ocupação')
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
    scheduled_at: new Date(`${hoje}T10:00:00-03:00`).toISOString(), duration_min: 90, price: 0, status: 'COMPLETED', source: 'INTERNAL',
  })
  expect(error).toBeNull()
  const { data: un } = await db().from('branches').select('slug').eq('id', rede!.branchId).single()
  const recepcao = await criarMembro(`hfr${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
  const ctx = await browser.newContext({ storageState: recepcao.estado })
  try {
    const p = await ctx.newPage()
    // 90 min ÷ 720 min (um profissional, 08–20) = 12,5% → 13%.
    await p.goto(`/${un!.slug}/dashboard`)
    await expect(p.getByText('Taxa de ocupação').locator('..')).toContainText('13%')
    await p.goto(`/${un!.slug}/agenda`)
    await expect(p.getByText(/13% de ocupação/).first()).toBeVisible()
  } finally {
    await ctx.close()
    await recepcao.limpar()
    await db().from('appointments').delete().eq('client_id', cliente)
  }
})
