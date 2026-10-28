import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O pacote vendido DEPOIS reconhece a sessão avulsa já concluída (D9 da
 * simulação de 2026-10-28).
 *
 * A simulação achou: a Bianca fez uma drenagem avulsa e, na saída, comprou o
 * pacote "10 drenagens". O "Receber" da drenagem cobrava R$ 150 sem citar o
 * pacote, e "Gerenciar sessões" só agendava sessões novas: ou ela pagava duas
 * vezes, ou a drenagem ficava a receber para sempre.
 *
 * Decisão do Heitor (2026-10-28): no "Receber" de um avulso CONCLUÍDO e a
 * receber, se a cliente tem pacote ativo com o MESMO procedimento e sessão
 * sobrando, a tela oferece "Abater do pacote": o atendimento vira uma sessão
 * do pacote (consome uma, sai de "a receber", sem cobrança nova), numa
 * transação, com a comissão e o consumo pela regra das sessões de pacote.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let drenagem = ''
let limpeza = ''
let pacoteId = ''
const PRECO = 150

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const n = (v: unknown) => Number(v ?? 0)

/** Um avulso CONCLUÍDO, com a linha de comissão (10%), sem pagamento. */
async function avulsoConcluido(cliente: string, procedimento: string, preco = PRECO) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: procedimento,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().rpc('concluir_atendimento', {
    p_agendamento: data!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: procedimento, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco }] },
  })).error, 'concluir').toBeNull()
  return data!.id
}
/** O pacote "10 drenagens" (R$ 1.200, R$ 120 a sessão), pago no Pix. */
async function venderPacote(cliente: string) {
  const { data, error } = await db().rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: null,
    p_lancamentos: [{ amount: 1200, payment_method: 'PIX', is_paid: true }],
    p_sessoes: Array.from({ length: 10 }, () => ({ procedure_id: drenagem, preco: 120 })),
  })
  expect(error, 'vender o pacote').toBeNull()
  return data as string
}
async function sessaoLivre(cp: string) {
  const { data } = await db().from('package_sessions').select('id').eq('client_package_id', cp)
    .eq('status', 'AVAILABLE').is('appointment_id', null).order('session_number').limit(1).single<{ id: string }>()
  return data!.id
}
async function aReceber(ap: string) {
  const { data, error } = await db().rpc('atendimentos_a_receber', { p_tenant: rede!.tenantId, p_agendamento: ap })
  expect(error).toBeNull()
  return (data ?? []).length
}
async function extrato(ap: string) {
  const { data } = await db().from('commissions').select('kind, amount')
    .eq('appointment_id', ap).order('released_at').order('amount', { ascending: false })
  return (data ?? []).map(c => [c.kind as string, n(c.amount)] as const)
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pa${marca}`)
  drenagem = rede.procedureId
  expect((await db().from('procedures').update({ name: `${PREFIXO} Drenagem ${marca}`, price: PRECO }).eq('id', drenagem)).error).toBeNull()
  const { data: l, error: eL } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 200 })
    .select('id').single<{ id: string }>()
  expect(eL).toBeNull()
  limpeza = l!.id
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('commission_configs').upsert({
    tenant_id: rede.tenantId, modo: 'ATENDIMENTO', desconta_insumos: false, desconta_taxa: false,
    base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  const { data: pac, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} 10 drenagens ${marca}`, p_preco: 1200, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: drenagem, quantity: 10 }],
  })
  expect(error, 'criar o pacote').toBeNull()
  pacoteId = pac as string
  recepcao = await criarMembro(`par${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await recepcao?.limpar()
  if (rede) {
    const falhas: string[] = []
    const { data: cps } = await db().from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      const r1 = await db().from('package_sessions').delete().in('client_package_id', ids)
      if (r1.error) falhas.push(`sessões: ${r1.error.message}`)
      const r2 = await db().from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      if (r2.error) falhas.push(`lançamentos: ${r2.error.message}`)
      const r3 = await db().from('commission_lines').update({ client_package_id: null }).in('client_package_id', ids)
      if (r3.error) falhas.push(`linhas de comissão: ${r3.error.message}`)
      const r4 = await db().from('client_packages').delete().in('id', ids)
      if (r4.error) falhas.push(`pacotes do cliente: ${r4.error.message}`)
    }
    const r5 = await db().from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (r5.error) falhas.push(`pacotes: ${r5.error.message}`)
    await rede.limpar()
    expect(falhas).toEqual([])
  }
})

test('o "Receber" oferece "Abater do pacote": o atendimento vira sessão do pacote, sem cobrança, numa transação', async ({ browser }) => {
  const bianca = await rede!.criarCliente('Bianca')
  const ap = await avulsoConcluido(bianca, drenagem)
  const cp = await venderPacote(bianca)
  expect(await extrato(ap)).toEqual([['LIBERACAO', 15]])

  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${ap}`)
    await p.getByRole('button', { name: 'Confirmar pagamento' }).click()
    const janela = p.getByRole('dialog', { name: 'Confirmar pagamento' })
    const oferta = janela.locator('[data-abater-do-pacote]')
    await expect(oferta).toContainText(`10 drenagens ${marca}`)
    await expect(oferta).toContainText('10 sessões')
    await oferta.getByRole('button', { name: 'Abater do pacote' }).click()
    await expect(p.getByText(/Sessão de pacote/).first()).toBeVisible({ timeout: 20_000 })
    await expect(p.getByRole('button', { name: 'Confirmar pagamento' })).toHaveCount(0)
  })

  // O banco: a sessão usada e ligada, o contador, fora do a receber, sem cobrança.
  const { data: sessoes } = await db().from('package_sessions').select('status, appointment_id').eq('client_package_id', cp)
  expect((sessoes ?? []).filter(s => s.appointment_id === ap && s.status === 'USED')).toHaveLength(1)
  expect((sessoes ?? []).filter(s => s.status === 'AVAILABLE')).toHaveLength(9)
  expect(n((await db().from('client_packages').select('used_sessions').eq('id', cp).single()).data?.used_sessions)).toBe(1)
  expect(await aReceber(ap)).toBe(0)
  const { data: lanc } = await db().from('financial_transactions').select('id').eq('appointment_id', ap)
  expect(lanc ?? [], 'nenhuma cobrança nova').toEqual([])
  // O preço do atendimento é a parte da sessão no pacote (a base da comissão dela).
  expect(n((await db().from('appointments').select('price').eq('id', ap).single()).data?.price)).toBe(120)
  // A comissão segue a da sessão de pacote: a do avulso sai, a do pacote entra.
  expect(await extrato(ap)).toEqual([['LIBERACAO', 15], ['LIBERACAO', 12], ['AJUSTE', -15]])
  const { data: linhas } = await db().from('commission_lines').select('origem, status, client_package_id, preco').eq('appointment_id', ap).order('item')
  expect(linhas).toEqual([
    { origem: 'AVULSO', status: 'CANCELADA', client_package_id: null, preco: 150 },
    { origem: 'PACOTE', status: 'ATIVA', client_package_id: cp, preco: 120 },
  ])
  // O histórico do atendimento diz o que aconteceu.
  const { data: hist } = await db().from('appointment_history').select('description').eq('appointment_id', ap)
  expect((hist ?? []).map(h => h.description).join(' | ')).toMatch(/pacote/i)
})

test('só oferece com o MESMO procedimento e sessão sobrando', async ({ browser }) => {
  const c = await rede!.criarCliente('Outro procedimento')
  const ap = await avulsoConcluido(c, limpeza, 200)
  await venderPacote(c)
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${ap}`)
    await p.getByRole('button', { name: 'Confirmar pagamento' }).click()
    const janela = p.getByRole('dialog', { name: 'Confirmar pagamento' })
    await expect(janela.getByLabel('Forma de pagamento')).toBeVisible()
    await expect(janela.locator('[data-abater-do-pacote]')).toHaveCount(0)
  })
})

test('o servidor recusa: sessão de outra cliente, outro procedimento, atendimento já pago, sessão já usada', async ({ browser }) => {
  const dona = await rede!.criarCliente('Dona do pacote')
  const outra = await rede!.criarCliente('Outra')
  const cpDona = await venderPacote(dona)
  const apOutra = await avulsoConcluido(outra, drenagem)
  const apLimpeza = await avulsoConcluido(dona, limpeza, 200)
  const apPago = await avulsoConcluido(dona, drenagem)
  expect((await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: apPago, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: PRECO },
  })).error).toBeNull()
  const apCerto = await avulsoConcluido(dona, drenagem)
  const sessao = await sessaoLivre(cpDona)

  await como(browser, async p => {
    const abater = (ap: string, s: string) => chamarAcao(p, 'actions/a-receber.ts', 'abaterDoPacote', `/${slug}/agenda/${ap}`, [ap, s])
    expect((await abater(apOutra, sessao)).texto, 'a sessão é de outra cliente').toMatch(/não encontrad/i)
    expect((await abater(apLimpeza, sessao)).texto, 'outro procedimento').toMatch(/outro procedimento/i)
    expect((await abater(apPago, sessao)).texto, 'já pago').toMatch(/já (foi )?(pago|recebido)|Pagamento já registrado/i)
    // Controle: o certo abate (a resposta traz a página revalidada; a prova é o banco)…
    await abater(apCerto, sessao)
    expect((await db().from('package_sessions').select('appointment_id').eq('id', sessao).single()).data?.appointment_id).toBe(apCerto)
    // …e a mesma sessão não abate outro.
    const apMais = await avulsoConcluido(dona, drenagem)
    expect((await abater(apMais, sessao)).texto, 'sessão já usada').toMatch(/já foi usada|já usada/i)
  })
  const { data: s } = await db().from('package_sessions').select('appointment_id, status').eq('id', sessao).single()
  expect(s).toEqual({ appointment_id: apCerto, status: 'USED' })
  expect(await aReceber(apOutra)).toBe(1)
  expect(await aReceber(apLimpeza)).toBe(1)
})
