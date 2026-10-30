import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * J-28 (simulação): o modal de agendamento perdia campos quando a action
 * devolvia erro (o conflito de horário). O `<form action>` do React REINICIA
 * o formulário ao fim da action — com erro ou não —, e a observação digitada
 * sumia; a recepção tinha de redigitar tudo para tentar outro horário. Agora
 * o envio é `onSubmit` + `startTransition`, como o cadastro de cliente.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''
const DIA = diaEmQueAUnidadeAbre(1)

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`me${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ duration_min: 60 }).eq('id', rede.procedureId)).error).toBeNull()
  cliente = await rede.criarCliente('Cliente do modal')
  const outra = await rede.criarCliente('Quem já ocupa')
  // A profissional já atende às 10:00.
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: outra, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(`${DIA}T10:00:00-03:00`).toISOString(), duration_min: 60, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  })).error).toBeNull()
  recepcao = await criarMembro(`mer${marca}`, {
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

test('o conflito recusado não apaga o que foi digitado no modal', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const janela = p.locator('dialog[open]')
    await janela.getByPlaceholder('Buscar cliente por nome ou telefone…').fill(`Cliente do modal me${marca}`)
    await janela.getByText(`${PREFIXO} Cliente do modal me${marca}`).first().click()
    await janela.getByLabel('Procedimento *').selectOption(rede!.procedureId)
    await janela.getByLabel('Profissional *').selectOption(rede!.professionalId)
    await janela.getByLabel('Data e hora *').fill(`${DIA}T10:30`)
    await janela.getByLabel('Observações internas').fill('Prefere a sala do fundo')
    await janela.getByRole('button', { name: 'Confirmar agendamento' }).click()

    await expect(janela.getByText('Este profissional já tem agendamento nesse horário.')).toBeVisible()
    await expect(janela.getByLabel('Observações internas')).toHaveValue('Prefere a sala do fundo')
    await expect(janela.getByLabel('Procedimento *')).toHaveValue(rede!.procedureId)
    await expect(janela.getByLabel('Profissional *')).toHaveValue(rede!.professionalId)
    await expect(janela.getByLabel('Data e hora *')).toHaveValue(`${DIA}T10:30`)

    // Corrige só a hora e agenda: tudo o mais foi junto.
    await janela.getByLabel('Data e hora *').fill(`${DIA}T14:00`)
    await janela.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(janela).toBeHidden({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
  const { data } = await db().from('appointments').select('notes').eq('client_id', cliente).single<{ notes: string }>()
  expect(data!.notes).toBe('Prefere a sala do fundo')
})
