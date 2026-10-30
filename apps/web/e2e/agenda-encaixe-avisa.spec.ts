import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-30 (simulação): o encaixe fora do horário da profissional passava calado,
 * a coluna dela na grade não mostrava quando ela trabalha, e o choque com
 * outro atendimento só aparecia DEPOIS de confirmar. O encaixe continua
 * PERMITIDO (§9.1) — agora a tela avisa:
 * - no modal, "fora do horário de atendimento de X (10:00–18:00)" e o
 *   conflito ("já tem atendimento das 11:00 às 12:00") antes do Confirmar;
 * - na grade do dia, a coluna da profissional sombreia o que é fora do
 *   horário dela.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let nomeDaProf = ''

/** O próximo dia útil (seg–sex) a partir de amanhã, em Brasília. */
function proximoDiaUtil(): string {
  for (let i = 1; i < 8; i++) {
    const d = new Date(Date.now() + i * 86_400_000)
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
    const semana = new Date(`${dia}T12:00:00-03:00`).getUTCDay()
    if (semana >= 1 && semana <= 5) return dia
  }
  throw new Error('sem dia útil')
}
const DIA = proximoDiaUtil()
const HORARIO_DELA = { dias: {
  0: [], 1: [{ de: '10:00', ate: '18:00' }], 2: [{ de: '10:00', ate: '18:00' }], 3: [{ de: '10:00', ate: '18:00' }],
  4: [{ de: '10:00', ate: '18:00' }], 5: [{ de: '10:00', ate: '18:00' }], 6: [],
} }

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`ea${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  nomeDaProf = `${PREFIXO} Prof ea${marca}`
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId, horario: HORARIO_DELA })
    .eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ duration_min: 60 }).eq('id', rede.procedureId)).error).toBeNull()
  cliente = await rede.criarCliente('Cliente do encaixe')
  const outra = await rede.criarCliente('Quem já ocupa')
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: outra, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(`${DIA}T11:00:00-03:00`).toISOString(), duration_min: 60, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  })).error).toBeNull()
  recepcao = await criarMembro(`ear${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const ids = (data ?? []).map(a => a.id as string)
    if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('a grade sombreia o fora do horário, e o modal avisa do encaixe e do conflito antes de confirmar', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const coluna = p.locator(`[data-coluna-do-profissional="${nomeDaProf}"]`)
    await expect(coluna).toHaveAttribute('data-horario-de-trabalho', '10:00–18:00')
    // Antes das 10 e depois das 18 (a unidade abre 08–20): duas faixas.
    await expect(coluna.locator('[data-fora-do-horario]')).toHaveCount(2)

    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const janela = p.locator('dialog[open]')
    await janela.getByPlaceholder('Buscar cliente por nome ou telefone…').fill(`Cliente do encaixe ea${marca}`)
    await janela.getByText(`${PREFIXO} Cliente do encaixe ea${marca}`).first().click()
    await janela.getByLabel('Procedimento *').selectOption(rede!.procedureId)
    await janela.getByLabel('Profissional *').selectOption(rede!.professionalId)
    const aviso = janela.locator('[data-aviso-do-horario]')

    await janela.getByLabel('Data e hora *').fill(`${DIA}T08:30`)
    await expect(aviso).toContainText(`Fora do horário de atendimento de ${nomeDaProf} (10:00–18:00)`)
    await expect(aviso).toContainText('O encaixe é permitido.')

    await janela.getByLabel('Data e hora *').fill(`${DIA}T11:30`)
    await expect(aviso).toContainText(`${nomeDaProf} já tem atendimento das 11:00 às 12:00`)

    await janela.getByLabel('Data e hora *').fill(`${DIA}T14:00`)
    await expect(aviso).toHaveCount(0)

    // O encaixe continua permitido.
    await janela.getByLabel('Data e hora *').fill(`${DIA}T08:30`)
    await expect(aviso).toContainText('O encaixe é permitido.')
    await janela.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(janela).toBeHidden({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
  const { data } = await db().from('appointments').select('scheduled_at').eq('client_id', cliente).single<{ scheduled_at: string }>()
  expect(new Date(data!.scheduled_at).toISOString()).toBe(new Date(`${DIA}T08:30:00-03:00`).toISOString())
})
