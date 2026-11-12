import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D5 da 13ª simulação (ALTA): a profissional de unidade fixa que atende também
 * na outra unidade ("Atende clientes em" as duas) anexava a foto clínica no
 * atendimento DA OUTRA unidade e a tela caía em erro (500). A action lia a
 * unidade do formulário pela SESSÃO com `.single()` — a sessão dela não vê a
 * outra unidade, e o `ler` lançava dentro do useActionState. Agora a unidade
 * do anexo é a do atendimento (lida pelo servidor, depois da rede e do
 * alcance), e a recusa volta como mensagem, nunca como erro.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slugA = ''
let unidadeB = ''
let cliente = ''
let atendimentoNaB = ''
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const fotosDo = async (appointmentId: string) => ((await db().from('client_documents')
  .select('id, branch_id').eq('appointment_id', appointmentId)).data ?? []) as { id: string; branch_id: string }[]

test.beforeAll(async () => {
  rede = await criarOutraRede(`fo${marca}`)
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Água Verde ${marca}`, slug: `e2e-fo2-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id
  profissional = await criarMembro(`fop${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ atende_em: [rede.branchId, unidadeB] }).eq('id', profissional.userId)).error).toBeNull()
  cliente = await rede.criarCliente('Mariana')
  const { data, error: e2 } = await db().from('appointments').insert({
    branch_id: unidadeB, client_id: cliente, procedure_id: rede.procedureId, professional_id: profissional.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  atendimentoNaB = data!.id
})
test.afterAll(async () => {
  if (atendimentoNaB) {
    await db().from('appointment_history').delete().eq('appointment_id', atendimentoNaB)
    await db().from('client_documents').delete().eq('appointment_id', atendimentoNaB)
    await db().from('appointments').delete().eq('id', atendimentoNaB)
  }
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB)
  await profissional?.limpar(); await rede?.limpar()
})

test('D5: a foto clínica no atendimento da outra unidade em que ela atende entra, na unidade do atendimento', async ({ browser }) => {
  await como(profissional!, browser, async p => {
    await p.goto(`/${slugA}/agenda/${atendimentoNaB}`)
    const fotos = p.locator('[data-fotos-do-atendimento]')
    await fotos.getByRole('button', { name: 'Anexar foto' }).click()
    await fotos.locator('input[name="file"]').setInputFiles({ name: 'antes.png', mimeType: 'image/png', buffer: PNG })
    await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
    await expect(p.getByText(/algo deu errado|Application error/i), 'sem a tela de erro').toHaveCount(0)
    await expect.poll(async () => (await fotosDo(atendimentoNaB)).length, { message: 'a foto entrou' }).toBe(1)
  })
  expect((await fotosDo(atendimentoNaB))[0]!.branch_id, 'na unidade do atendimento').toBe(unidadeB)
})
