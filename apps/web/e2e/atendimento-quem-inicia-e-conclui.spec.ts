import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'

/**
 * C14 (D21 do levantamento das regras, o Heitor, 2026-11-11): quem inicia e
 * conclui o atendimento de OUTRA profissional é o ESCOPO — com "todos",
 * qualquer um da unidade ao alcance; com "só os meus", só o próprio. A tela do
 * atendimento só deixava o próprio (ou a agenda em Gerenciar), e o servidor
 * deixava qualquer um. E a agenda em Ver não cancela (D20): o "Cancelar"
 * aparecia e a action recusava.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let vista: MembroDeTeste | null = null

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function agendado(status: string) {
  const cliente = await rede!.criarCliente(`Qi${status}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status, source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: haMinutosHoje(30),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`qi${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  // A colega que vê a agenda de todas e grava o prontuário — não é a profissional do atendimento.
  vista = await criarMembro(`qiv${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Colega',
    permissoes: [
      { modulo: 'agenda', nivel: 'VIEW', escopo: 'ALL' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
})
test.afterAll(async () => { await vista?.limpar(); await rede?.limpar() })

test('C14: com a agenda "todos", a colega inicia e finaliza o atendimento de outra profissional; sem "Cancelar" em Ver', async ({ browser }) => {
  const confirmado = await agendado('CONFIRMED')
  const emCurso    = await agendado('IN_PROGRESS')
  await como(browser, vista!, async p => {
    await p.goto(`/${slug}/agenda/${confirmado}`)
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' }), 'inicia o de outra').toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar', exact: true }), 'em Ver não cancela').toHaveCount(0)
    await p.goto(`/${slug}/agenda/${emCurso}`)
    await expect(p.getByRole('button', { name: 'Finalizar atendimento' }), 'finaliza o de outra').toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0)
  })
})
