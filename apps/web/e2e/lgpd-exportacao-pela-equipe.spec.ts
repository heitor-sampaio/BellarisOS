import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A21 da 6ª simulação (2026-11-04): a LGPD só se pedia pelo PORTAL — a ficha,
 * na equipe, não exportava (a cliente sem o app ficava sem caminho). E o pacote
 * levava o plano de tratamento sem os itens nem o valor, e as comunicações sem
 * a hora.
 *
 * Agora quem tem Clientes em Gerenciar exporta pela ficha ("Mais ações" →
 * "Exportar dados (LGPD)"): o pedido fica registrado (pela equipe, quem
 * pediu), o pacote sai em segundo plano e a ficha dá o download. O prontuário
 * só entra com o Prontuário em Gerenciar. O plano vai com as sessões, os
 * procedimentos e os valores.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let cliente = ''
let nomeDoProc = ''

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const pedidos = async () => (await db().from('lgpd_requests')
  .select('id, status, requested_via, requested_by, requested_by_name, include_medical, medical_status, export_json_path')
  .eq('client_id', cliente).order('requested_at')).data ?? []

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`lge${marca}`)
  recepcao = await criarMembro(`lger${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
  soVe = await criarMembro(`lgev${marca}`, { tenant: rede.tenantId, rotulo: 'So ve', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  const plano = await rede.criarPlanoProposto(`LGPD ${marca}`, { semTermo: true })
  cliente = plano.clientId
  expect((await db().from('treatment_plans').update({ status: 'ACCEPTED' }).eq('id', plano.planId)).error).toBeNull()
  nomeDoProc = (await db().from('procedures').select('name').eq('id', rede.procedureId).single<{ name: string }>()).data!.name
  expect((await db().from('client_notifications').insert({
    client_id: cliente, title: `${PREFIXO} lembrete ${marca}`, type: 'general', created_at: '2026-11-03T13:45:00Z',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await db().from('lgpd_requests').delete().eq('client_id', cliente)
  await db().from('treatment_plans').delete().eq('client_id', cliente)
  await soVe?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('a recepção exporta pela ficha: o pedido é da equipe, registrado, e o download sai da ficha', async ({ browser }) => {
  await comSessao(browser, recepcao!, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await p.getByRole('button', { name: 'Mais ações' }).click()
    await p.getByRole('button', { name: 'Exportar dados (LGPD)' }).click()
    const dlg = p.getByRole('dialog', { name: 'Exportar dados (LGPD)' })
    await expect(dlg.getByLabel('Incluir o prontuário'), 'sem o Prontuário em Gerenciar, o prontuário não se oferece').toHaveCount(0)
    await dlg.getByRole('button', { name: 'Gerar o pacote' }).click()
    await expect(dlg.getByText(/Em preparo|Pronto/)).toBeVisible()
    await expect.poll(async () => (await pedidos())[0]?.status, { timeout: 60_000 }).toBe('completed')
    await dlg.getByRole('button', { name: 'Atualizar' }).click()
    await expect(dlg.getByRole('link', { name: 'Baixar PDF' })).toHaveAttribute('href', /lgpd-exports.*token=/)
    await expect(dlg.getByRole('link', { name: 'Baixar JSON' })).toHaveAttribute('href', /lgpd-exports.*token=/)
  })
  const [pedido] = await pedidos()
  expect(pedido).toMatchObject({ requested_via: 'equipe', requested_by: recepcao!.userId, include_medical: false, medical_status: 'not_requested' })
  expect(pedido!.requested_by_name).toBeTruthy()

  // O pacote: o plano com as sessões, os procedimentos e os valores; a comunicação com a hora.
  const { data: url } = await db().storage.from('lgpd-exports').createSignedUrl(pedido!.export_json_path as string, 60)
  const pacote = await (await fetch(url!.signedUrl)).json() as {
    planosDeTratamento: { total: number; sessoes: { numero: number; procedimentos: { procedimento: string; valor: number }[] }[] }[]
    comunicacoes: { data: string; titulo: string }[]
  }
  expect(pacote.planosDeTratamento[0]).toMatchObject({ total: 50, sessoes: [{ numero: 1, procedimentos: [{ procedimento: nomeDoProc, valor: 50 }] }] })
  expect(pacote.comunicacoes.find(c => c.titulo.includes(marca))?.data).toBe('2026-11-03T13:45:00+00:00')
})

test('sem o Prontuário em Gerenciar não inclui o prontuário; quem só vê não exporta', async ({ browser }) => {
  const antes = (await pedidos()).length
  await comSessao(browser, recepcao!, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    const r = await chamarAcao(p, 'actions/lgpd.ts', 'exportarDadosPelaEquipe', `/admin/clients/${cliente}`, [cliente, { incluirProntuario: true }])
    expect(r.texto).toContain('Prontuário em Gerenciar')
  })
  await comSessao(browser, soVe!, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await expect(p.getByRole('button', { name: 'Exportar dados (LGPD)' })).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/lgpd.ts', 'exportarDadosPelaEquipe', `/admin/clients/${cliente}`, [cliente, { incluirProntuario: false }])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect((await pedidos()).length, 'nenhum pedido novo').toBe(antes)
})
