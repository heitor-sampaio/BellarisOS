import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'

/**
 * A2 da 10ª simulação (2026-11-10): a clínica de uma pessoa (uma profissional,
 * uma sala, uma unidade) escolhia à mão, em toda tela, a única opção que havia:
 * - o Agendar abria com a profissional em "Selecione…" e a sala em "Sem sala
 *   definida";
 * - o checkout do plano pedia "Escolher profissional" (a prova saiu na fase 3
 *   do PDV: o receber do plano não agenda mais — as sessões se agendam pelo
 *   plano depois);
 * - o app perguntava "Tem preferência de profissional?" com um cartão só;
 * - a importação e o Novo cliente perguntavam a unidade.
 * Pela clínica única (CLAUDE.md §1), a única opção vem escolhida — e a pergunta
 * que não tem o que perguntar some.
 *
 * Numa rede [e2e] própria: uma unidade, uma profissional, uma sala.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let nomeDaUnidade = ''
let salaId = ''

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`uo${marca}`)
  const un = (await db().from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()).data!
  slug = un.slug; nomeDaUnidade = un.name
  // A profissional atende; o procedimento vai ao app. Tudo pelo banco ANTES de
  // qualquer tela abrir (as listas da unidade ficam em cache).
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, price: 100 }).eq('id', rede.procedureId)).error).toBeNull()
  const sala = await db().from('rooms').insert({ branch_id: rede.branchId, name: `${PREFIXO} Sala única ${marca}` }).select('id').single<{ id: string }>()
  expect(sala.error).toBeNull()
  salaId = sala.data!.id
  dona = await criarMembro(`uod${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  cliente = await clienteComSessao(`uoc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  await cliente?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('A2: o Agendar já vem com a única profissional e a única sala', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/agenda?novo=1')
    const janela = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(janela).toBeVisible()
    await expect(janela.locator('#ag-profissional')).toHaveValue(rede!.professionalId)
    await expect(janela.locator('#ag-sala')).toHaveValue(salaId)
  } finally { await ctx.close() }
})

test('A2: o app não pergunta "Tem preferência de profissional?" com uma só', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    await p.locator('button').filter({ hasText: `${PREFIXO} Proc` }).click()
    await expect(p.getByText('Escolha a data e o horário disponível.')).toBeVisible()
    await expect(p.getByText('Tem preferência de profissional?')).toHaveCount(0)
    // E diz com quem vai ser.
    await expect(p.locator('[data-profissional-unica]')).toContainText(`${PREFIXO} Prof`)
    // Voltar leva ao procedimento (o passo da profissional não existe para ela).
    await p.getByRole('button', { name: 'Voltar' }).click()
    await expect(p.getByText('Qual procedimento você deseja agendar?')).toBeVisible()
  } finally { await ctx.close() }
})

test('A2: o Novo cliente e a importação não perguntam a unidade', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/clients/new')
    await expect(p.getByText('Unidade de cadastro:')).toBeVisible()
    await expect(p.locator('select').filter({ has: p.locator(`option:text-is("${nomeDaUnidade}")`) })).toHaveCount(0)

    await p.goto('/admin/importar-contatos')
    await expect(p.locator('#importar-unidade')).toHaveCount(0)
    await expect(p.getByText(`Unidade: ${nomeDaUnidade}`)).toBeVisible()
  } finally { await ctx.close() }
})
