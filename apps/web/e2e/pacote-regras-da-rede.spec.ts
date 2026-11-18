import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { venderPacotePelaAcao } from './apoio/contrato-do-pacote'

/**
 * Itens 8 e 9 da auditoria das regras (2026-11-18; decisões do Claude pelo
 * princípio 1, "a rede decide" — do vencido, o Heitor respondeu em 18/11:
 * "configuração da rede"), numa rede [e2e] própria:
 *
 * - 8: o pacote no crediário libera as sessões (o padrão, A41 da 11ª) OU, com
 *   `tenants.pacote_crediario_libera` desligada, as sessões esperam o pago:
 *   o agendar recusa dizendo o em aberto, o banco também, e o aviso da ficha
 *   diz a regra.
 * - 9: o pacote vencido não se cancela (o padrão) OU, com
 *   `tenants.pacote_vencido_cancela` ligada, a ficha oferece o "Cancelar
 *   pacote" e a conta de sempre (a prévia) sai.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let caixa: MembroDeTeste
let cliente = ''
let pacote = ''
let vendido = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const regra = async (campos: { pacote_crediario_libera?: boolean; pacote_vencido_cancela?: boolean }) =>
  expect((await db().from('tenants').update(campos).eq('id', rede.tenantId)).error).toBeNull()

test.beforeAll(async ({ browser }) => {
  rede = await criarOutraRede(`pacreg${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  caixa = await criarMembro(`pacregc${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }],
  })
  cliente = await rede.criarCliente('Cliente Regras do Pacote')
  const { data: sp, error } = await b.from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: `[e2e] Pacote regras ${marca}`, total_sessions: 4, price: 400,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  pacote = sp!.id
  expect((await b.from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: pacote, procedure_id: rede.procedureId, quantity: 4 })).error).toBeNull()
  // No crediário: entrada de R$ 100 no Pix e 3 × R$ 100 a receber.
  await como(browser, caixa, async p => {
    const r = await venderPacotePelaAcao(p, `/${slug}/pdv`, [
      cliente, pacote, rede.branchId,
      { forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 3, primeiroVencimento: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      null, null, { vendedorId: caixa.userId },
    ])
    expect(r.texto).toContain('clientPackageId')
  })
  vendido = (await b.from('client_packages').select('id').eq('client_id', cliente).single<{ id: string }>()).data!.id
})

test.afterAll(async () => {
  await regra({ pacote_crediario_libera: true, pacote_vencido_cancela: false }).catch(() => {})
  await caixa?.limpar()
  await rede?.limpar()
})

test('8: sem liberar, a sessão do pacote em aberto não se agenda — a action, o banco e o aviso dizem por quê', async ({ browser }) => {
  await regra({ pacote_crediario_libera: false })
  const sessao = (await db().from('package_sessions').select('id').eq('client_package_id', vendido)
    .order('session_number').limit(1).single<{ id: string }>()).data!.id
  await como(browser, caixa, async p => {
    // O aviso da ficha diz a regra da rede.
    await p.goto(`/${slug}/clients/${cliente}`)
    const aviso = p.locator('[data-pacote-em-aberto]').first()
    await expect(aviso).toContainText(/R\$\s300,00/)
    await expect(aviso).toContainText('As sessões se liberam quando ele estiver pago')
    // O agendar recusa, dizendo o em aberto.
    const r = await chamarAcao(p, 'actions/appointments.ts', 'schedulePackageSession', `/${slug}/clients/${cliente}`, [{
      packageSessionId: sessao, branchId: rede.branchId, professionalId: rede.professionalId,
      scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), clientId: cliente, procedureId: rede.procedureId,
      price: 0, durationMin: 60, slug,
    }])
    expect(r.texto).toContain('ainda tem R$')
    expect(r.texto).toContain('só depois de pago')
  })
  // O banco também: ligar a sessão a um agendamento é recusado.
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() + 4 * 86_400_000).toISOString(), duration_min: 60, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  const { error } = await db().from('package_sessions').update({ appointment_id: ag!.id }).eq('id', sessao)
  expect(error?.message ?? '').toContain('só depois de pago')
  // Liberando (o padrão), a mesma ligação passa.
  await regra({ pacote_crediario_libera: true })
  expect((await db().from('package_sessions').update({ appointment_id: ag!.id }).eq('id', sessao)).error).toBeNull()
  expect((await db().from('package_sessions').update({ appointment_id: null }).eq('id', sessao)).error).toBeNull()
  expect((await db().from('appointments').update({ status: 'CANCELLED' }).eq('id', ag!.id)).error).toBeNull()
})

test('9: o vencido não se cancela (o padrão); com a regra ligada, a ficha oferece e a conta de sempre sai', async ({ browser }) => {
  expect((await db().from('client_packages').update({ expires_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq('id', vendido)).error).toBeNull()
  await regra({ pacote_vencido_cancela: false })
  await como(browser, caixa, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.locator('[data-pacote-vencido]')).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'previaDoCancelamentoDoPacote', `/${slug}/clients/${cliente}`, [vendido])
    expect(r.texto).toContain('venceu em')
    expect(r.texto).toContain('Configurações → Geral')
  })
  await regra({ pacote_vencido_cancela: true })
  await como(browser, caixa, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    const vencido = p.locator('[data-pacote-vencido]')
    // A ficha lê os pacotes do cache de 60 s (`getCachedClientProfileData`), e
    // a validade foi mudada direto no banco, por fora das actions que o
    // expiram: o caso 8 abriu a ficha há segundos. Recarrega até o cache virar.
    await expect(async () => {
      await p.reload()
      await expect(vencido).toContainText('venceu em', { timeout: 3000 })
    }).toPass({ timeout: 90_000 })
    await expect(vencido).toContainText('4 sessões que sobraram')
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'previaDoCancelamentoDoPacote', `/${slug}/clients/${cliente}`, [vendido])
    expect(r.texto).toContain('"restantes":4')
    // A janela é a de sempre.
    await vencido.getByRole('button', { name: 'Cancelar pacote' }).click()
    await expect(p.getByRole('dialog')).toBeVisible()
  })
})
