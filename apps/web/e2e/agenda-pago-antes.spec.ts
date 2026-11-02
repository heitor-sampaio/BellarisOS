import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * D12 da 5ª simulação: a janela do agendamento PRÉ-PAGO mostrava "VALOR
 * R$ 140,00", e a da sessão do pacote "R$ 550,00", como cobrança pendente — e
 * o app do Otávio, o mesmo. O que já foi pago aparece como pago: "Pré-pago ·
 * 1 de 2" e "Pacote X · sessão 1 de 2".
 */

const marca = `pa${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let pacoteId = ''
const nomeDoPacote = `${PREFIXO} Pacote ${marca}`
const DIA = diaEmQueAUnidadeAbre(2)
let agPrePago = ''
let agPacote = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(hhmm: string, preco: number): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: preco,
    scheduled_at: new Date(`${DIA}T${hhmm}:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  cliente = await clienteComSessao(`c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  // O pré-pago de 2 unidades a R$ 140, já pago; a 1ª ligada a um agendamento.
  const { data: venda, error: eV } = await db().rpc('procedimento_vender', {
    p_tenant: rede.tenantId, p_cliente: cliente.clientId, p_procedimento: rede.procedureId, p_unidade: rede.branchId,
    p_ator: null, p_quantidade: 2, p_desconto: 320, p_validade_dias: null,
    p_lancamentos: [{ amount: 280, payment_method: 'PIX', is_paid: true }],
    p_unidades: [{ preco: 140 }, { preco: 140 }],
  })
  expect(eV, 'vender o pré-pago').toBeNull()
  agPrePago = await agendar('10:00', 140)
  const { data: u1 } = await db().from('procedure_sale_units').select('id').eq('sale_id', venda as string).eq('numero', 1).single()
  expect((await db().from('procedure_sale_units').update({ appointment_id: agPrePago }).eq('id', u1!.id)).error).toBeNull()

  // O pacote de 2 sessões, já pago; a 1ª sessão ligada a outro agendamento.
  const { data: pac, error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: nomeDoPacote, p_preco: 1100, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 2 }],
  })
  expect(eP, 'criar o pacote').toBeNull()
  pacoteId = pac as string
  const { data: cp, error: eCp } = await db().rpc('pacote_vender', {
    p_tenant: rede.tenantId, p_cliente: cliente.clientId, p_pacote: pacoteId, p_unidade: rede.branchId, p_ator: null,
    p_lancamentos: [{ amount: 1100, payment_method: 'PIX', is_paid: true }],
    p_sessoes: [{ procedure_id: rede.procedureId, preco: 550 }, { procedure_id: rede.procedureId, preco: 550 }],
  })
  expect(eCp, 'vender o pacote').toBeNull()
  agPacote = await agendar('14:00', 550)
  const { data: s1 } = await db().from('package_sessions').select('id').eq('client_package_id', cp as string).eq('session_number', 1).single()
  expect((await db().from('package_sessions').update({ appointment_id: agPacote }).eq('id', s1!.id)).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const b = db()
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      await b.from('package_sessions').delete().in('client_package_id', ids)
      await b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      await b.from('client_packages').delete().in('id', ids)
    }
    await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
  }
  await cliente?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('a janela da agenda mostra o pré-pago e a sessão do pacote como já pagos', async ({ browser }) => {
  await como(browser, recepcao!.estado, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${agPrePago}"]`).first().click()
    let janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.locator('[data-pago-antes]')).toContainText('Pré-pago · 1 de 2')
    await expect(janela).not.toContainText('R$ 140,00')
    await janela.getByRole('button').first().click()

    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${agPacote}"]`).first().click()
    janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.locator('[data-pago-antes]')).toContainText(`${nomeDoPacote} · sessão 1 de 2`)
    await expect(janela).not.toContainText('R$ 550,00')
  })
})

test('o app da cliente mostra os dois como já pagos, sem o valor a pagar', async ({ browser }) => {
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/agendamentos`)
    const prePago = p.locator(`a[href$="/cliente/agendamentos/${agPrePago}"]`)
    await expect(prePago).toContainText('Pré-pago · 1 de 2')
    await expect(prePago).not.toContainText('R$ 140,00')
    const pacote = p.locator(`a[href$="/cliente/agendamentos/${agPacote}"]`)
    await expect(pacote).toContainText(`${nomeDoPacote} · sessão 1 de 2`)
    await expect(pacote).not.toContainText('R$ 550,00')
  })
})

// A63 (5ª simulação): o cartão do pacote "6 lasers" levava a "Agendar
// procedimento", cuja lista não tinha o Laser, e dizia "1 de 6" sem "restam 5".
// Agora diz quantas restam e leva ao agendamento DO procedimento do pacote; se
// ele não é agendável pelo app, diz para agendar com a clínica.
test('A63: o cartão do pacote diz quantas restam e leva ao agendamento do procedimento dele', async ({ browser }) => {
  await como(browser, cliente!.estado, async p => {
    // O procedimento NÃO está no app: agendar é com a clínica.
    expect((await db().from('procedures').update({ visible_on_client_app: false }).eq('id', rede!.procedureId)).error).toBeNull()
    await p.goto(`/${slug}/cliente/home`)
    let cartao = p.locator('[data-pacote]', { hasText: nomeDoPacote })
    await expect(cartao).toContainText('restam 2')
    await expect(cartao).toContainText('agende com a clínica')
    await expect(cartao.getByRole('link', { name: /^Agendar/ })).toHaveCount(0)

    expect((await db().from('procedures').update({ visible_on_client_app: true }).eq('id', rede!.procedureId)).error).toBeNull()
    await p.goto(`/${slug}/cliente/home`)
    cartao = p.locator('[data-pacote]', { hasText: nomeDoPacote })
    const agendar = cartao.getByRole('link', { name: /^Agendar/ })
    await expect(agendar).toHaveAttribute('href', `/${slug}/cliente/agendamentos/novo?procedimento=${rede!.procedureId}`)
    await agendar.click()
    // O agendar abre já no passo da profissional, com o procedimento do pacote.
    await expect(p.getByText('Tem preferência de profissional?')).toBeVisible()
  })
})
