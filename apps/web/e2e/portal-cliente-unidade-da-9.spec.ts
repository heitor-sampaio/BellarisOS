import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O app da cliente da clínica de duas unidades, na 9ª simulação (2026-11-07):
 * - D12: o atalho "Agendar Drenagem linfática" do cartão do pacote assumia a
 *   Moinhos e listava só quem atende lá; o "Agendar procedimento" perguntava
 *   "Em qual unidade?" (H5). Agora o atalho pergunta também.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slugMoinhos = ''
let slugMenino = ''
let rosana: ClienteDeTeste | null = null

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`pc9${marca}`)
  slugMoinhos = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  slugMenino = `e2e-md-pc9${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Menino Deus pc9${marca}`, slug: slugMenino }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, price: 120 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [rede.branchId, b!.id] }).eq('id', rede.professionalId)).error).toBeNull()
  rosana = await clienteComSessao(`pc9r${marca}`, { id: rede.branchId, slug: slugMoinhos }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  await rosana?.limpar()
  await rede?.limpar()
})

test('D12: o atalho do procedimento pergunta a unidade quando a clínica tem mais de uma', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: rosana!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slugMoinhos}/cliente/agendamentos/novo?procedimento=${rede!.procedureId}`)
    await expect(p.getByText('Em qual unidade?'), 'pergunta antes de seguir').toBeVisible()
    await expect(p.getByText('Tem preferência de profissional?')).toHaveCount(0)
    // A escolha da unidade segue com o procedimento — e, com UMA profissional lá,
    // direto para a data (A2 da 10ª).
    await p.getByRole('group', { name: 'Unidade' }).getByRole('link', { name: new RegExp(`Menino Deus pc9${marca}`) }).click()
    await expect(p).toHaveURL(new RegExp(`/${slugMenino}/cliente/agendamentos/novo\\?procedimento=${rede!.procedureId}`))
    await expect(p.getByText('Escolha a data e o horário disponível.')).toBeVisible()
  } finally { await ctx.close() }
})
