import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D10 da 8ª simulação (2026-11-06): no app, a sessão coberta pelo pacote
 * aparecia como "Valor R$ 180,00" no Confirmar. A agenda gravava a sessão "2
 * de 3" do pacote, e a cliente não sabia que já estava pago (sobra da F28:
 * o valor cobrado foi corrigido na lista de agendamentos, não no assistente).
 *
 * Agora o Confirmar diz "Já pago pelo pacote X (sessão 2 de 3)" — o MESMO
 * crédito que o agendamento vai usar (`pagoParaAgendar`). O procedimento
 * sem nada pago segue com o preço.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let outroProc = ''
const PACOTE = `[e2e] Pacote Limpeza ${marca}`

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cjp${marca}`)
  const b = db()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('procedures').update({ visible_on_client_app: true, price: 180, duration_min: 30, name: `[e2e] Limpeza ${marca}` }).eq('id', rede.procedureId)).error).toBeNull()
  const op = await b.from('procedures').insert({
    tenant_id: rede.tenantId, name: `[e2e] Peeling ${marca}`, category: 'e2e', duration_min: 30, price: 250, visible_on_client_app: true,
  }).select('id').single<{ id: string }>()
  expect(op.error).toBeNull()
  outroProc = op.data!.id
  cliente = await clienteComSessao(`cjpc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  // O pacote de 3 sessões, com a 1ª já feita: a próxima é a 2 de 3.
  const sp = await b.from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: PACOTE, total_sessions: 3, price: 450,
  }).select('id').single<{ id: string }>()
  expect(sp.error).toBeNull()
  const cp = await b.from('client_packages').insert({
    client_id: cliente.clientId, package_id: sp.data!.id, branch_id: rede.branchId, total_sessions: 3, used_sessions: 1, price: 450,
  }).select('id').single<{ id: string }>()
  expect(cp.error).toBeNull()
  const ss = await b.from('package_sessions').insert([1, 2, 3].map(n => ({
    client_package_id: cp.data!.id, session_number: n, procedure_id: rede!.procedureId, preco: 150, status: n === 1 ? 'USED' : 'AVAILABLE',
  })))
  expect(ss.error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const b = db()
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) await b.from('package_sessions').delete().in('client_package_id', ids)
    await b.from('client_packages').delete().eq('branch_id', rede.branchId)
    await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
  }
  await cliente?.limpar(); await rede?.limpar()
})

test('D10: o Confirmar da sessão coberta pelo pacote diz "Já pago pelo pacote X (sessão 2 de 3)", não o preço', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  const p = await ctx.newPage()
  try {
    const confirmar = async (procedimento: string) => {
      await p.goto(`/${slug}/cliente/agendamentos/novo`)
      await p.getByRole('button', { name: new RegExp(procedimento) }).first().click()
      await p.getByRole('button', { name: /\[e2e\] Prof/ }).first().click()
      // O primeiro dia com horário livre: amanhã em diante.
      for (let d = 1; d <= 7; d++) {
        const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + d * 86_400_000))
        await p.locator('input[type="date"]').fill(dia)
        const hora = p.getByRole('button', { name: /^\s*\d{2}:\d{2}\s*$/ }).first()
        if (await hora.waitFor({ timeout: 8_000 }).then(() => true, () => false)) { await hora.click(); break }
      }
      await expect(p.getByText('Confirme os detalhes do seu agendamento.')).toBeVisible()
    }
    await confirmar(`Limpeza ${marca}`)
    const resumo = p.locator('.card').filter({ hasText: 'Procedimento' })
    await expect(resumo).toContainText(`Já pago pelo pacote ${PACOTE} (sessão 2 de 3)`)
    await expect(resumo).not.toContainText('180,00')

    // O que não tem nada pago segue com o preço de tabela.
    await confirmar(`Peeling ${marca}`)
    await expect(p.locator('.card').filter({ hasText: 'Procedimento' })).toContainText('250,00')
  } finally { await ctx.close() }
  expect(outroProc).toBeTruthy()
})
