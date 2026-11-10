import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { haMinutosHoje } from './apoio/datas'
import { cartaoNaGradeDoDia } from './apoio/agenda'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os atritos da agenda e do atendimento da 10ª simulação (2026-11-10), da F50:
 * - A5: a janela do agendamento DELA tinha três botões de chegada quase iguais
 *   ("Confirmar agendamento", "Chegou", "Marcar chegada e iniciar"), dois em rosé.
 * - A12: a cliente criada pelo Agendar (só nome e telefone) não recebia a ficha:
 *   a janela dizia "Complete o CPF ou a data de nascimento" e só levava ao cadastro.
 * - A13: as duas fotos do atendimento saíam "Foto clínica — 10/11/2026", sem
 *   como marcar antes e depois.
 * - A14: "Este agendamento já foi encerrado." logo abaixo de "Receber pagamento".
 * - A15: a sessão do pacote trazido de fora dizia "paga na venda do pacote" — não
 *   houve venda.
 * - A17: o Agendar aceitava 04:15 sem dizer que é encaixe, como diz o plano.
 * - A19: o insumo do concluído saía "0.2 un", com ponto.
 * - A20: a gerente iniciava e só DEPOIS lia "Quem conclui é o profissional".
 *
 * Numa rede [e2e] própria, aberta o dia todo.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let slug = ''
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const amanha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 86_400_000))
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendamento(rotulo: string, o: { profissional?: string; status?: string; price?: number; cliente?: string; inicio?: string } = {}) {
  const cliente = o.cliente ?? await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId,
    professional_id: o.profissional ?? dona!.userId,
    scheduled_at: o.inicio ?? haMinutosHoje(5), duration_min: 30, price: o.price ?? 0,
    status: o.status ?? 'SCHEDULED', source: 'INTERNAL',
    ...(o.status === 'COMPLETED' ? { started_at: haMinutosHoje(4), completed_at: new Date().toISOString() } : {}),
    ...(o.status === 'IN_PROGRESS' ? { started_at: haMinutosHoje(4) } : {}),
  }).select('id').single<{ id: string }>()
  expect(error, `agendar ${rotulo}`).toBeNull()
  return { id: data!.id, cliente }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`au10${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  // A dona que atende: a agenda, as clientes, o prontuário e o caixa.
  dona = await criarMembro(`au10d${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', dona.userId)).error).toBeNull()
  // A gerente de unidade: a agenda e o caixa, SEM o prontuário (não conclui).
  gerente = await criarMembro(`au10g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data: aps } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const ids = (aps ?? []).map(a => a.id as string)
    if (ids.length) {
      await db().from('stock_movements').delete().in('appointment_id', ids)
      await db().from('package_sessions').update({ appointment_id: null }).in('appointment_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
  }
  await gerente?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('A5: no agendamento DELA, um botão de chegada em destaque — e o que cada um faz', async ({ browser }) => {
  const { id } = await agendamento('Chegada')
  await como(browser, dona!, async p => {
    await p.goto(`/admin/agenda?date=${hoje}`)
    await p.locator(`[data-agendamento="${id}"]`).click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.getByRole('button', { name: 'Marcar chegada e iniciar' })).toBeVisible()
    await expect(janela.getByRole('button', { name: 'Confirmar agendamento' })).toBeVisible()
    await expect(janela.getByRole('button', { name: 'Chegou' })).toBeVisible()
    const primarios = janela.locator('button.btn-primary').filter({ hasText: /Confirmar agendamento|Chegou|Marcar chegada e iniciar/ })
    await expect(primarios, 'um botão de chegada em destaque, não dois').toHaveCount(1)
    await expect(primarios).toHaveText(/Marcar chegada e iniciar/)
    // E a janela diz a diferença entre os outros dois.
    await expect(janela.getByText(/Confirmar: a cliente confirmou que vem/)).toBeVisible()
  })
})

test('A14: o concluído a receber não diz "já foi encerrado" embaixo do "Receber pagamento"', async ({ browser }) => {
  const { id } = await agendamento('A receber', { status: 'COMPLETED', price: 150 })
  await como(browser, dona!, async p => {
    await p.goto(`/admin/agenda?date=${hoje}`)
    await p.locator(`[data-agendamento="${id}"]`).click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.getByRole('link', { name: 'Receber pagamento' })).toBeVisible()
    await expect(janela.getByText('Este agendamento já foi encerrado.')).toHaveCount(0)
  })
})

test('A12: sem CPF nem nascimento, a janela pede o nascimento ali mesmo — e a ficha sai', async ({ browser }) => {
  const { id, cliente } = await agendamento('Sem documento')
  await como(browser, dona!, async p => {
    await p.goto(`/admin/agenda?date=${hoje}`)
    await p.locator(`[data-agendamento="${id}"]`).click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    const ficha = janela.locator('[data-pre-atendimento-do-agendamento]')
    await ficha.getByLabel('Data de nascimento').fill('1990-05-10')
    await ficha.getByRole('button', { name: 'Salvar o nascimento' }).click()
    await expect(ficha.getByRole('button', { name: 'Enviar a ficha' })).toBeVisible()
  })
  await expect.poll(async () => (await db().from('clients').select('birth_date').eq('id', cliente).single<{ birth_date: string | null }>()).data?.birth_date).toMatch(/^1990-05-10/)
})

test('A13: a foto do atendimento se marca antes, durante ou depois', async ({ browser }) => {
  const { id } = await agendamento('Fotos', { status: 'IN_PROGRESS' })
  await como(browser, dona!, async p => {
    await p.goto(`/admin/agenda/${id}`)
    const fotos = p.locator('[data-fotos-do-atendimento]')
    await fotos.getByRole('button', { name: 'Anexar foto' }).click()
    const nome = fotos.getByLabel('Nome do documento *')
    await expect(nome).toHaveValue(/antes/i)
    await fotos.getByRole('group', { name: 'Momento da foto' }).getByRole('button', { name: 'Depois' }).click()
    await expect(nome).toHaveValue(/depois/i)
  })
})

test('A15: a sessão do pacote trazido de fora não fala em "venda do pacote"', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Pacote de antes')
  await responderAnamnese(cliente, rede!.tenantId)
  const { data: pacote, error } = await db().rpc('pacote_trazer', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_unidade: rede!.branchId, p_procedimento: rede!.procedureId,
    p_total: 8, p_usadas: 5, p_validade: null, p_valor: null, p_ator: null,
  })
  expect(error).toBeNull()
  const { id } = await agendamento('Pacote de antes', { status: 'IN_PROGRESS', cliente })
  const { data: sessao } = await db().from('package_sessions').select('id').eq('client_package_id', pacote as string).eq('status', 'AVAILABLE')
    .order('session_number').limit(1).single<{ id: string }>()
  expect((await db().from('package_sessions').update({ appointment_id: id }).eq('id', sessao!.id)).error).toBeNull()
  await como(browser, dona!, async p => {
    await p.goto(`/admin/agenda/${id}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    const janela = p.getByRole('dialog', { name: 'Finalizar atendimento' })
    await expect(janela.getByText(/pacote trazido de fora/i)).toBeVisible()
    await expect(janela.getByText(/venda do pacote/)).toHaveCount(0)
  })
})

test('A17: no Agendar, 04:15 fora da grade de 30 minutos diz que é encaixe', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/agenda?novo=1')
    const janela = p.getByRole('dialog', { name: 'Novo agendamento' })
    await janela.locator('#ag-profissional').selectOption(rede!.professionalId)
    await janela.locator('#ag-quando').fill(`${amanha}T04:15`)
    await expect(janela.locator('[data-fora-da-grade]')).toContainText('04:15')
    await expect(janela.locator('[data-fora-da-grade]')).toContainText('encaixe')
    // Na grade, nada disso.
    await janela.locator('#ag-quando').fill(`${amanha}T04:30`)
    await expect(janela.locator('[data-fora-da-grade]')).toHaveCount(0)
  })
})

test('A19: o insumo do atendimento concluído sai com vírgula', async ({ browser }) => {
  const produto = await rede!.criarProduto('Máscara', 10)
  const { id } = await agendamento('Insumo', { status: 'COMPLETED' })
  expect((await db().from('stock_movements').insert({
    branch_id: rede!.branchId, product_id: produto, type: 'PROCEDURE_USAGE', quantity: -0.2, balance_after: 9.8,
    appointment_id: id, created_by: dona!.userId, notes: `${PREFIXO} insumo`,
  })).error).toBeNull()
  await como(browser, dona!, async p => {
    await p.goto(`/admin/agenda/${id}`)
    const linha = p.locator(`[data-insumo="${produto}"]`)
    await expect(linha).toContainText('0,2 un')
    await expect(linha).not.toContainText('0.2')
  })
})

test('A20: a gerente lê "quem conclui é o profissional" ANTES de iniciar', async ({ browser }) => {
  const { id } = await agendamento('Gerente', { status: 'CONFIRMED', profissional: rede!.professionalId })
  await como(browser, gerente!, async p => {
    // Na tela do atendimento, ao lado do "Iniciar".
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' }).first()).toBeVisible()
    await expect(p.getByText(/Quem conclui é o profissional/).first()).toBeVisible()
    // E na janela da agenda.
    await p.goto(`/${slug}/agenda?date=${hoje}`)
    await (await cartaoNaGradeDoDia(p, id)).click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.getByRole('button', { name: 'Iniciar atendimento' })).toBeVisible()
    await expect(janela.getByText(/Quem conclui é o profissional/)).toBeVisible()
  })
})
