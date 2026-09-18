import { test, expect } from '@playwright/test'
import { banco, unidadeQueAtende, nomeDeTeste, PREFIXO } from './apoio/banco'

/**
 * Agendar e conduzir o atendimento sem sair do `/admin`.
 *
 * Era o buraco que começou tudo: a rede via a agenda das unidades e não
 * conseguia marcar nada, e o card só abria a sessão inteira — confirmar,
 * remarcar, no-show e cancelar existiam apenas no portal da unidade.
 *
 * Tudo que este arquivo cria nasce com o prefixo `[e2e]` e é apagado no fim,
 * por esse prefixo. Nada cadastrado à mão é tocado.
 */

const nomeCliente = nomeDeTeste('Cliente agenda')
const telefone    = '47988' + String(Date.now()).slice(-6)

let appointmentId: string | null = null
let clientId:      string | null = null

/**
 * Um dia bem à frente e um horário fora do expediente.
 *
 * A validação de conflito é real: marcar às 10:00 de amanhã esbarra na agenda
 * que já existe no banco de desenvolvimento, e o teste falharia por dado de
 * ambiente em vez de por defeito.
 */
function diaDeTeste() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
  return { dia, local: `${dia}T07:05`, remarcado: `${dia}T07:40` }
}

test.afterAll(async () => {
  const db = banco()
  if (appointmentId) {
    await db.from('appointment_status_history').delete().eq('appointment_id', appointmentId)
    await db.from('appointments').delete().eq('id', appointmentId)
  }
  if (clientId) await db.from('clients').delete().eq('id', clientId)
})

test('agenda pela rede: marcar com nome e telefone, confirmar, remarcar e cancelar', async ({ page }) => {
  const { dia, local, remarcado } = diaDeTeste()
  const unidade = await unidadeQueAtende()
  test.skip(unidade === null, 'nenhuma unidade ativa tem profissional que atende — falta cadastro, não é defeito da tela')

  await page.goto(`/admin/agenda?date=${dia}`)
  await page.getByRole('button', { name: 'Agendar' }).click()

  // -- Marcar só com nome e telefone -----------------------------------------
  const modal = page.locator('form').filter({ has: page.locator('input[name="client_name"], input[placeholder*="Buscar cliente"]') }).first()
  await expect(page.getByText('Novo agendamento')).toBeVisible()

  // A unidade é escolhida dentro da ação: é ela que tem sala, profissional e agenda.
  const selectUnidade = modal.locator('select').first()
  await selectUnidade.selectOption({ label: unidade!.name })

  await page.getByRole('button', { name: /Não é cliente ainda/ }).click()
  await page.locator('input[name="client_name"]').fill(nomeCliente)
  await page.locator('input[name="client_phone"]').fill(telefone)

  // Procedimento e profissional só chegam depois que a unidade responde.
  const procedimento = modal.locator('select[name="procedure_id"]')
  const profissional = modal.locator('select[name="professional_id"]')
  await expect(procedimento.locator('option')).not.toHaveCount(1)
  await expect(profissional.locator('option')).not.toHaveCount(1)
  await procedimento.selectOption({ index: 1 })
  await profissional.selectOption({ index: 1 })
  await modal.locator('input[type="datetime-local"]').fill(local)

  await page.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await expect(page.getByText('Novo agendamento')).toBeHidden()

  // -- O que foi gravado -----------------------------------------------------
  const db = banco()
  const { data: cliente } = await db
    .from('clients').select('id, name, phone, document, email')
    .eq('name', nomeCliente).maybeSingle()
  expect(cliente, 'o cadastro rápido deveria ter criado o cliente').not.toBeNull()
  clientId = cliente!.id as string
  // Nome e telefone bastam: a ficha completa vem depois.
  expect(cliente!.document).toBeNull()
  expect(cliente!.email).toBeNull()

  const { data: ag } = await db
    .from('appointments').select('id, status, scheduled_at, branch_id, source')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  expect(ag, 'o agendamento deveria existir').not.toBeNull()
  appointmentId = ag!.id as string
  expect(ag!.status).toBe('SCHEDULED')
  expect(ag!.source).toBe('INTERNAL')
  expect(ag!.branch_id).toBeTruthy()

  // -- Ações rápidas na folha, sem sair do /admin ----------------------------
  await page.goto(`/admin/agenda?date=${dia}`)
  const card = page.locator(`[title*="${PREFIXO}"]`).first()
  await expect(card).toBeVisible()
  await card.click()

  await page.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await expect.poll(async () => {
    const { data } = await db.from('appointments').select('status').eq('id', appointmentId!).single()
    return data?.status
  }, { message: 'confirmar deveria gravar CONFIRMED' }).toBe('CONFIRMED')

  // -- Remarcar --------------------------------------------------------------
  await page.goto(`/admin/agenda?date=${dia}`)
  await page.locator(`[title*="${PREFIXO}"]`).first().click()
  await page.getByRole('button', { name: 'Remarcar' }).click()
  await page.locator('input[type="datetime-local"]').fill(remarcado)
  await page.getByRole('button', { name: 'Confirmar novo horário' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('appointments').select('scheduled_at').eq('id', appointmentId!).single()
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      .format(new Date(data!.scheduled_at as string))
  }, { message: 'remarcar deveria mover o horário' }).toBe('07:40')

  // -- Cancelar com motivo ---------------------------------------------------
  await page.goto(`/admin/agenda?date=${dia}`)
  await page.locator(`[title*="${PREFIXO}"]`).first().click()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByPlaceholder('Descreva o motivo…').fill(`${PREFIXO} desmarcou`)
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('appointments')
      .select('status, cancellation_reason').eq('id', appointmentId!).single()
    return `${data?.status}|${data?.cancellation_reason ?? ''}`
  }, { message: 'cancelar deveria gravar status e motivo' }).toBe(`CANCELLED|${PREFIXO} desmarcou`)
})
