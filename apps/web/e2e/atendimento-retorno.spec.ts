import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * D-12 (decisão do Heitor, 2026-10-29): "Fazer o campo 'Retorno em N dias' no
 * atendimento. Ele vira lembrete à recepção e gatilho de automação."
 *
 * - a profissional diz, ao finalizar, "retorno em 15 dias" (revisão da
 *   toxina) — gravado DENTRO de concluir_atendimento;
 * - a recepção vê no dashboard da unidade os retornos que vencem e ainda não
 *   foram marcados;
 * - no dia, o cron emite `agendamento.retorno_vencendo` (o gatilho das
 *   automações, com o procedimento para o "Se"), uma vez só. Nada é mandado
 *   a ninguém por conta própria.
 *
 * COMPARTILHADO: chama o cron (que passa por todas as redes). Os dados são
 * de uma rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let procedimento = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O dia de hoje em Brasília, AAAA-MM-DD, mais `n` dias. */
function diaDeBrasilia(n = 0): string {
  const d = new Date(Date.now() + n * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ret${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  procedimento = (await db().from('procedures').select('name').eq('id', rede.procedureId).single<{ name: string }>()).data!.name
  profissional = await criarMembro(`retp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  recepcao = await criarMembro(`retr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    await db().from('domain_events').delete().eq('tenant_id', rede.tenantId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await profissional?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

async function concluido(rotulo: string, retornoPara: string | null, extra: Record<string, unknown> = {}) {
  const cliente = await rede!.criarCliente(rotulo)
  const quando = new Date(Date.now() - 20 * 86_400_000).toISOString()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando, completed_at: quando,
    retorno_em_dias: retornoPara ? 20 : null, retorno_para: retornoPara, ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente }
}

test.describe.serial('o retorno em N dias', () => {
  test('a profissional diz "retorno em 15 dias" ao finalizar, e isso fica gravado com o dia', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Toxina')
    await responderAnamnese(cliente, rede!.tenantId)
    const { data, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
      status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
      scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const id = data!.id

    await como(browser, profissional!, async p => {
      await p.goto(`/${slug}/agenda/${id}`)
      await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
      const janela = p.getByRole('dialog', { name: 'Finalizar atendimento' })
      await janela.getByLabel('Retorno em (dias)').fill('15')
      await janela.getByRole('button', { name: 'Confirmar conclusão' }).click()
      await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single()).data?.status).toBe('COMPLETED')
    })
    const { data: ag } = await db().from('appointments').select('retorno_em_dias, retorno_para').eq('id', id).single()
    expect(ag).toEqual({ retorno_em_dias: 15, retorno_para: diaDeBrasilia(15) })
  })

  test('a recepção vê os retornos que vencem e ainda não foram marcados', async ({ browser }) => {
    const vencendo = await concluido('Vencendo', diaDeBrasilia(0))
    const longe    = await concluido('Longe', diaDeBrasilia(40))
    const marcado  = await concluido('Marcado', diaDeBrasilia(1))
    // O retorno do "Marcado" já está na agenda: não é mais lembrete.
    expect((await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: marcado.cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
      scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    })).error).toBeNull()

    const nomes = async (c: string) => (await db().from('clients').select('name').eq('id', c).single<{ name: string }>()).data!.name
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/dashboard`)
      const quadro = p.locator('[data-retornos]')
      await expect(quadro).toContainText('Retorno a marcar')
      await expect(quadro).toContainText(await nomes(vencendo.cliente))
      await expect(quadro).toContainText(procedimento)
      await expect(quadro).not.toContainText(await nomes(longe.cliente))
      await expect(quadro).not.toContainText(await nomes(marcado.cliente))
    })
  })

  test('no dia, o cron emite "Retorno vencendo" uma vez, com o procedimento', async ({ request }) => {
    const { id } = await concluido('Cron', diaDeBrasilia(0))
    const cron = () => request.get('/api/cron/retornos', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    expect((await cron()).ok()).toBe(true)
    expect((await cron()).ok()).toBe(true)

    const { data: eventos } = await db().from('domain_events').select('nome, dados')
      .eq('tenant_id', rede!.tenantId).eq('nome', 'agendamento.retorno_vencendo').eq('entidade_id', id)
    expect(eventos ?? [], 'uma vez só, mesmo com duas passagens').toHaveLength(1)
    expect(eventos![0]!.dados).toMatchObject({ procedimentoNome: procedimento, retornoEmDias: 20, retornoPara: diaDeBrasilia(0) })
    const { data: ag } = await db().from('appointments').select('retorno_avisado_em').eq('id', id).single()
    expect(ag?.retorno_avisado_em).not.toBeNull()
  })
})
