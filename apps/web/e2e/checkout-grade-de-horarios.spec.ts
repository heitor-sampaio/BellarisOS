import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * D8 da simulação de 2026-10-29: na etapa de agendamento do checkout do plano,
 * a grade era FIXA, das 08:00 às 20:00, para qualquer profissional. Oferecia
 * 12:00 e 12:30 (na pausa da unidade) e nada depois das 20:00, com a unidade
 * aberta até 23:30 e a Camila atendendo das 18:00 às 23:30.
 *
 * Agora: a janela da unidade naquele dia, sem a pausa e sem cortar a noite;
 * os horários dela em destaque; o resto é encaixe (o seletor do checkout é
 * livre, §9.1), e o "Outro horário" cobre o que nem a unidade oferece.
 * Numa rede [e2e] própria.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let planId = ''
const todoDia = (...ints: [string, string][]) =>
  ({ dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, ints.map(([de, ate]) => ({ de, ate }))])) })
const amanha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 86_400_000))

test.beforeAll(async () => {
  rede = await criarOutraRede(`cg${marca}`)
  expect((await db().from('branches').update({ horario: todoDia(['08:00', '12:00'], ['13:00', '23:30']) })
    .eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, horario: todoDia(['18:00', '23:30']) })
    .eq('id', rede.professionalId)).error).toBeNull()
  caixa = await criarMembro(`cgc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção checkout',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'documents', nivel: 'MANAGE' },
    ],
  })
  const cliente = await rede.criarCliente('Grade')
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente,
    status: 'PROPOSED', name: `${PREFIXO} Plano grade ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  planId = pl!.id
  const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: planId, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures')
    .insert({ session_id: s!.id, procedure_id: rede.procedureId, price: 100 })).error).toBeNull()
})
test.afterAll(async () => {
  await caixa?.limpar()
  await rede?.limpar()
})

test('a grade do checkout cobre a janela da unidade, sem a pausa, e destaca o horário da profissional', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ storageState: caixa!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/checkout/${planId}`)
    await p.getByRole('button', { name: 'Confirmar plano' }).click()
    await p.getByRole('button', { name: 'Ir para a documentação' }).click()
    await p.getByRole('button', { name: 'Ir para o agendamento' }).click()
    await p.getByLabel('Profissional do agendamento').selectOption(rede!.professionalId)
    await p.locator('input[type="date"]').fill(amanha)

    const grade = p.locator('.card').filter({ hasText: 'Agendamento por sessão' })
    const horario = (h: string) => grade.getByRole('button', { name: h, exact: true })
    await expect(horario('08:00')).toBeVisible()
    // A noite inteira: a unidade fecha às 23:30, o último início é 23:00.
    await expect(horario('22:30')).toBeVisible()
    await expect(horario('23:00')).toBeVisible()
    // A pausa da unidade (12:00–13:00) não se oferece.
    await expect(horario('11:30')).toBeVisible()
    await expect(horario('12:00')).toHaveCount(0)
    await expect(horario('12:30')).toHaveCount(0)
    // O horário dela em destaque; o resto é encaixe — e continua escolhível.
    await expect(horario('18:00')).not.toHaveAttribute('data-encaixe')
    await expect(horario('10:00')).toHaveAttribute('data-encaixe', '')
    await horario('10:00').click()
    await expect(horario('10:00')).toHaveAttribute('aria-pressed', 'true')
    // E o que nem a unidade oferece vai pelo "Outro horário".
    await p.getByLabel('Outro horário (encaixe)').fill('07:15')
    await expect(p.getByText(/às 07:15/)).toBeVisible()
  } finally { await ctx.close() }
})
