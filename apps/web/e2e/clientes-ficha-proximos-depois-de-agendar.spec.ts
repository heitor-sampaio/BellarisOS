import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * D9 da 7ª simulação: a Lia remarcou o Cláudio para 06/11 10:00 e a ficha dele
 * dizia "Nenhum agendamento futuro" até recarregar duas vezes. A ficha lê um
 * cache de 60 s (`getCachedClientProfileData`, tag `appointments:<rede>`), e o
 * agendar da agenda (`addAppointment` — também o "Reagendar" da falta) não o
 * expirava. Todo agendamento novo expira a tag (no núcleo).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fpa${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Cláudio')
  recepcao = await criarMembro(`fpar${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await recepcao?.limpar()
  await rede?.limpar()
})

test('agendar pela agenda aparece na ficha da cliente na hora, sem recarregar (D9)', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(2)
  await como(browser, async p => {
    // A ficha aberta antes: o cache dela nasce sem agendamento.
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.getByText('Nenhum agendamento futuro.')).toBeVisible()

    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _branchId: rede!.branchId, _slug: slug, client_id: cliente, procedure_id: rede!.procedureId,
      professional_id: rede!.professionalId, scheduled_at: `${dia}T13:00:00.000Z`, notes: '',
    })
    expect(r.texto).toContain('"success":true')

    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.getByText('Nenhum agendamento futuro.'), 'a ficha mostra o agendamento novo').toHaveCount(0)
  })
})
