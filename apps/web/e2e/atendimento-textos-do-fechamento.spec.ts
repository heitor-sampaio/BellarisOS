import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os textos do fim do atendimento (ajustes J, 2ª rodada, 2026-10-30).
 *
 * J-35: no atendimento AVULSO (rede que monta plano), o botão "Enviar para a
 * recepção" parecia um segundo "concluir" — quem só queria encerrar o avulso
 * achava que precisava dele. Ele GERA O PLANO: chama-se "Gerar plano e enviar à
 * recepção", e a tela diz que sem plano basta o "Finalizar atendimento".
 *
 * J-40: a sessão de um plano já pago abria o "Finalizar" com "O pagamento será
 * confirmado pela recepcionista", ao lado do "Nada a cobrar agora" do plano. A
 * janela diz agora de onde vem o pagamento de cada tipo de atendimento.
 */

const marca = Date.now().toString(36)
const db = () => banco()

let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`tf${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ price: 120 }).eq('id', rede.procedureId)).error).toBeNull()
  profissional = await criarMembro(`tfp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'ALL' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const falhas = await apagarAgendamentos((ags ?? []).map(a => a.id as string))
    expect(falhas, 'a limpeza tem de apagar tudo').toEqual([])
  }
  await profissional?.limpar()
  await rede?.limpar()
})

async function emCurso(clienteId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clienteId, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 120,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('J-35: no avulso, o botão diz que gera o plano, e a tela diz que basta o "Finalizar"', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Avulso')
  await responderAnamnese(cliente, rede!.tenantId)
  const id = await emCurso(cliente)
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByRole('button', { name: 'Gerar plano e enviar à recepção' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Enviar para a recepção', exact: true }), 'o nome antigo saiu').toHaveCount(0)
    await expect(p.locator('[data-dica-do-avulso]'), 'a tela diz que o avulso termina no "Finalizar"')
      .toContainText('basta o "Finalizar atendimento"')
  })
})

test('J-40: a sessão do plano já pago não diz que a recepção vai confirmar o pagamento', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Plano')
  await responderAnamnese(cliente, rede!.tenantId)
  const { data: plano, error: ePl } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente,
    status: 'ACCEPTED', name: `[e2e] Plano pago ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  const id = await emCurso(cliente, { treatment_plan_id: plano!.id })
  const { data: sessao, error: eS } = await db().from('treatment_plan_sessions')
    .insert({ plan_id: plano!.id, sort_order: 0, appointment_id: id }).select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  expect((await db().from('treatment_plan_session_procedures')
    .insert({ session_id: sessao!.id, procedure_id: rede!.procedureId, price: 120 })).error).toBeNull()

  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    const janela = p.getByRole('dialog', { name: 'Finalizar atendimento' })
    await expect(janela).toBeVisible()
    await expect(janela, 'a sessão do plano não tem o que a recepção confirmar').not.toContainText('será confirmado pela recep')
    await expect(janela.locator('[data-pagamento-ao-finalizar]')).toContainText('Sessão do plano de tratamento')
  })
})

test('J-40: o avulso com preço continua dizendo que a recepção recebe', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Avulso2')
  await responderAnamnese(cliente, rede!.tenantId)
  const id = await emCurso(cliente)
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    const janela = p.getByRole('dialog', { name: 'Finalizar atendimento' })
    await expect(janela.locator('[data-pagamento-ao-finalizar]')).toContainText('O pagamento será confirmado pela recepção')
  })
})
