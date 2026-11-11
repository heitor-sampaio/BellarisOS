import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os atritos do app da cliente da 12ª simulação (2026-11-11; a Ana e a Bruna
 * da Margarida, a Marina e a Sabrina da Acácia), numa rede [e2e] própria:
 * - A50: no remarcar, "Sem preferência" marcado ao lado de "Com Bia" — a
 *   cliente não sabia se a profissional podia mudar.
 * - A51: em "Sem preferência", o "Agendamento remarcado." não dizia com quem.
 * - A52: o agendamento dentro do prazo do app não dizia que nasce sem
 *   cancelamento pelo app.
 * - A55: o cartão do plano dizia só "Plano de tratamento", sem o nome que a
 *   clínica deu nem o desconto — no Início e no Financeiro.
 * - A56: o atendimento concluído aparecia em "Aguardando sua confirmação",
 *   que se lia como confirmar presença.
 */

test.setTimeout(180_000)

const marca = `pc12${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede
let slug = ''
let bia: MembroDeTeste
let cliente: ClienteDeTeste
const nomeDoPlano = `${PREFIXO} Manchas laser ${marca}`

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
  const ctx = await browser.newContext({ storageState: cliente.estado, viewport: { width: 412, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
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
  expect((await b.from('tenants').update({ portal_prazo_alteracao_horas: 48, onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('users').update({ branch_id: rede.branchId, provides_services: true, atende_em: [rede.branchId], name: `[e2e] Ana ${marca}` }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('procedures').update({ visible_on_client_app: true, duration_min: 30, name: `${PREFIXO} Avaliação ${marca}` }).eq('id', rede.procedureId)).error).toBeNull()
  bia = await criarMembro(`b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  expect((await b.from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', bia.userId)).error).toBeNull()
  cliente = await clienteComSessao(`k${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  // A55: o plano fechado "Manchas laser", com R$ 70 de desconto, pago no Pix.
  const { data: plano, error: eP } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente.clientId, status: 'ACCEPTED',
    name: nomeDoPlano, desconto: 70,
  }).select('id').single<{ id: string }>()
  expect(eP).toBeNull()
  const { data: sessao } = await b.from('treatment_plan_sessions').insert({ plan_id: plano!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await b.from('treatment_plan_session_procedures').insert({ session_id: sessao!.id, procedure_id: rede.procedureId, price: 630 })).error).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, treatment_plan_id: plano!.id, type: 'INCOME', category: 'Procedimento',
    description: 'Plano de tratamento — entrada', amount: 630, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
  })).error).toBeNull()

  // A56: um atendimento concluído ontem, sem a confirmação dela.
  const ontem = new Date(Date.now() - 26 * 3_600_000).toISOString()
  expect((await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: ontem, completed_at: ontem,
  })).error).toBeNull()
})

test.afterAll(async () => {
  await cliente?.limpar(); await bia?.limpar(); await rede?.limpar()
})

test('A50 e A51: o "Sem preferência" do remarcar diz o que significa, e o remarcado diz com quem ficou', async ({ browser }) => {
  let id = ''
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
      branchId: rede.branchId, procedureId: rede.procedureId, professionalId: null, scheduledAt: em(dia(4), '10:00'), slug,
    }])
    id = (devolvido(r.texto) as { id: string }).id
  })
  const { data: antes } = await db().from('appointments').select('professional_id, users!professional_id(name)').eq('id', id).single()
  const comQuem = (antes as unknown as { users: { name: string } }).users.name

  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${id}`)
    await p.getByRole('button', { name: 'Remarcar' }).click()
    const grupo = p.getByRole('group', { name: 'Com quem?' })
    await expect(grupo.getByRole('button', { name: 'Sem preferência' })).toHaveAttribute('aria-pressed', 'true')
    // A50: a escolha diz o que é — hoje é com ela, e no horário novo pode mudar.
    await expect(p.locator('[data-o-que-e-sem-preferencia]')).toContainText(`hoje o agendamento é com ${comQuem}`)
    await expect(p.locator('[data-o-que-e-sem-preferencia]')).toContainText('pode ser outra profissional')
    await expect(grupo.getByRole('button', { name: `Só com ${comQuem}` })).toBeVisible()
    await p.getByLabel('Novo dia').fill(dia(4))
    await p.getByRole('button', { name: '11:00', exact: true }).click()
    await expect(p.locator('[data-quem-atende-no-remarcar]')).toBeVisible()
    await p.getByRole('button', { name: 'Confirmar novo horário' }).click()
    // A51: com quem ficou, no aviso.
    await expect(p.getByRole('status').filter({ hasText: 'Agendamento remarcado' })).toContainText(/Agendamento remarcado: com \[e2e\] /)
  })
})

test('A52: agendar dentro do prazo do app diz que o agendamento nasce sem cancelar nem remarcar pelo app', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    await p.getByRole('button', { name: new RegExp(`Avaliação ${marca}`) }).first().click()
    const prof = p.getByRole('button', { name: /\[e2e\] Ana/ }).first()
    await expect(prof.or(p.getByText('Escolha a data e o horário disponível.'))).toBeVisible()
    if (await prof.isVisible()) await prof.click()
    // Amanhã (o primeiro útil) fica sempre a menos de 48 h.
    await p.locator('input[type="date"]').fill(dia(1))
    await p.getByRole('button', { name: /^\s*\d{2}:\d{2}\s*$/ }).first().click()
    await expect(p.getByText('Confirme os detalhes do seu agendamento.')).toBeVisible()
    const aviso = p.locator('[data-dentro-do-prazo]')
    await expect(aviso).toContainText('nasce sem cancelar nem remarcar pelo app')
    await expect(aviso).toContainText('48 horas')
  })
})

test('A55 e A56: o plano diz o nome e o desconto; o concluído diz que é para avaliar', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const plano = p.locator('[data-plano-fechado]')
    await expect(plano).toContainText(nomeDoPlano)
    await expect(plano).toContainText(/Com desconto de R\$\s70,00/)
    // A56: o concluído é para avaliar — não "Aguardando sua confirmação".
    const avaliar = p.locator('[data-aguardando-confirmacao]')
    await expect(avaliar).toContainText('Como foram os seus atendimentos')
    await expect(avaliar).not.toContainText('Aguardando sua confirmação')
    await expect(avaliar).toContainText(/Concluído em \d{2}\/\d{2}/)
    await expect(avaliar).toContainText('opcional')

    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.locator('[data-plano-do-lancamento]').first()).toContainText(nomeDoPlano)
  })
})
