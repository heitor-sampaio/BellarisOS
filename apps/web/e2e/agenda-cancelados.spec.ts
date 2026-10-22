import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * "Mostrar cancelados" na agenda (2026-10-21, decisão do Heitor): a agenda da
 * unidade esconde o cancelado e a falta, e um botão os traz de volta —
 * apagados, com o motivo. Na da rede (que sempre os mostrou), o bloco
 * cancelado também diz o motivo.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
const dia = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
const AMANHA = dia(1)
let cancelado = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ca${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`car${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const cliente = await rede.criarCliente('Desmarcou')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancellation_reason: 'viagem de última hora',
    source: 'INTERNAL', duration_min: 60, price: 0, scheduled_at: new Date(`${AMANHA}T10:00:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  cancelado = data!.id
})
test.afterAll(async () => { await recepcao?.limpar(); await rede?.limpar() })

test.describe.serial('os cancelados na agenda', () => {
  test('na unidade, o cancelado só aparece com "Mostrar cancelados" — apagado e com o motivo', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/agenda?date=${AMANHA}`)
      await expect(p.getByRole('button', { name: 'Dia anterior' })).toBeVisible()
      await expect(p.locator(`[data-agendamento="${cancelado}"]`)).toHaveCount(0)

      await p.getByRole('button', { name: 'Mostrar cancelados' }).click()
      const bloco = p.locator(`[data-agendamento="${cancelado}"]`)
      await expect(bloco).toBeVisible()
      await expect(bloco).toHaveAttribute('data-cancelado', '')
      await expect(bloco).toContainText('Cancelado')
      await expect(bloco).toContainText('viagem de última hora')
      await expect(p).toHaveURL(/cancelados=1/)
      // A conta do cabeçalho não muda: cancelado não é atendimento.
      await expect(p.getByText(/^0$/).first()).toBeVisible()

      await p.getByRole('button', { name: 'Esconder cancelados' }).click()
      await expect(bloco).toHaveCount(0)
    })
  })

  test('na rede, o bloco cancelado diz o motivo', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/admin/agenda?date=${AMANHA}`)
      const bloco = p.locator(`[data-agendamento="${cancelado}"]`)
      await expect(bloco).toBeVisible()
      await expect(bloco).toContainText('viagem de última hora')
    })
  })
})
