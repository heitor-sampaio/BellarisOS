import { test, expect, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Três achados da varredura de conformidade de 18/11 (cada regra contra o
 * código), provados pela action e pela página, numa rede [e2e] própria:
 *
 * - FID-01 (fidelidade.md, FD3: a unidade do voucher é REGISTRO, não recorte):
 *   quem tem a Fidelidade em Gerenciar numa unidade cancela e entrega o
 *   voucher trocado em outra unidade da rede. Controle: sem a Fidelidade, nada muda.
 * - CRM-03 (CLAUDE.md §11; o Heitor, 28/10: "Quem tem 'só os meus' vê 'só os
 *   meus', em qualquer lugar"): a aba Oportunidades da ficha recorta pelo dono,
 *   como o quadro. Controle: o CRM com "todos" vê as duas.
 * - CRM-10 (crm-inbox.md, os números do cargo no inbox): "Ir para a conversa"
 *   do card abre a conversa que o cargo VÊ — com as caixas "minhas", a da caixa
 *   dela, não a mais recente de outra caixa. Controle: com "todas", a mais recente.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
const membros: MembroDeTeste[] = []
let unidadeB = { id: '', slug: '' }

async function membro(m: Promise<MembroDeTeste>): Promise<MembroDeTeste> {
  const criado = await m
  membros.push(criado)
  return criado
}

async function comSessao<T>(browser: Browser, m: MembroDeTeste, f: (p: import('@playwright/test').Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await f(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(300_000)
  rede = await criarOutraRede(`va${marca}`)
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-unb-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(error, 'criar a segunda unidade').toBeNull()
  unidadeB = data!
})

test.afterAll(async () => {
  for (const m of membros) await m.limpar()
  // A rede inteira sai com ela: vouchers, oportunidades, números e conversas.
  await rede?.limpar()
})

test('FID-01: o voucher trocado numa unidade se cancela e se entrega em outra, por quem tem a Fidelidade', async ({ browser }) => {
  const r = rede!
  const daB = await membro(criarMembro(`vafb${marca}`, {
    tenant: r.tenantId, branchId: unidadeB.id, rotulo: 'Fidelidade B',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'MANAGE' }],
  }))
  const semFidelidade = await membro(criarMembro(`vasf${marca}`, {
    tenant: r.tenantId, branchId: unidadeB.id, rotulo: 'Sem fidelidade',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }],
  }))
  const cliente = await r.criarCliente('Voucher de outra unidade')
  const { data: recompensa, error: eR } = await db().from('loyalty_rewards')
    .insert({ tenant_id: r.tenantId, name: `${PREFIXO} Brinde ${marca}`, type: 'PRODUTO', points_cost: 100 })
    .select('id').single<{ id: string }>()
  expect(eR).toBeNull()
  // Os dois trocados na unidade A (a da rede): a unidade é onde a troca aconteceu.
  const voucher = async (nome: string) => {
    const { data: v, error } = await db().from('loyalty_vouchers').insert({
      tenant_id: r.tenantId, client_id: cliente, branch_id: r.branchId, reward_id: recompensa!.id, type: 'PRODUTO',
      name: `${PREFIXO} ${nome} ${marca}`, product_id: null, points_cost: 0, status: 'ATIVO',
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), created_by: 'e2e',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    return v!.id
  }
  const v1 = await voucher('Para cancelar')
  const v2 = await voucher('Para entregar')
  const status = async (id: string) =>
    (await db().from('loyalty_vouchers').select('status').eq('id', id).single<{ status: string }>()).data?.status
  const rota = `/${unidadeB.slug}/clients/${cliente}`

  // Controle: sem a Fidelidade, nem cancela nem entrega.
  await comSessao(browser, semFidelidade, async p => {
    await chamarAcao(p, 'actions/fidelidade.ts', 'cancelarVoucher', rota, [{ voucherId: v1, motivo: 'teste e2e' }])
    await chamarAcao(p, 'actions/fidelidade.ts', 'entregarVoucherProduto', rota, [{ voucherId: v2, branchId: unidadeB.id }])
  })
  expect(await status(v1)).toBe('ATIVO')
  expect(await status(v2)).toBe('ATIVO')

  // Quem tem a Fidelidade, só na unidade B: cancela o de A e entrega o de A na B.
  await comSessao(browser, daB, async p => {
    const c = await chamarAcao(p, 'actions/fidelidade.ts', 'cancelarVoucher', rota, [{ voucherId: v1, motivo: 'teste e2e' }])
    // A resposta da action traz a árvore inteira, com o "Página não encontrada"
    // do modelo de 404: a conferência é a mensagem de erro da action.
    expect(c.texto).not.toMatch(/(Voucher|Unidade) não encontrad/)
    const e = await chamarAcao(p, 'actions/fidelidade.ts', 'entregarVoucherProduto', rota, [{ voucherId: v2, branchId: unidadeB.id }])
    expect(e.texto).not.toMatch(/(Voucher|Unidade|Produto) não encontrad/)
  })
  expect(await status(v1)).toBe('CANCELADO')
  expect(await status(v2)).toBe('USADO')
})

test('CRM-03: a aba Oportunidades da ficha, com o CRM em "só os meus", mostra só as dela', async ({ browser }) => {
  const r = rede!
  const minha = await membro(criarMembro(`vac3${marca}`, {
    tenant: r.tenantId, rotulo: 'Comercial só os meus',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }],
  }))
  const todos = await membro(criarMembro(`vac3t${marca}`, {
    tenant: r.tenantId, rotulo: 'Comercial todos',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }],
  }))
  const cliente = await r.criarCliente('Oportunidades de dois donos')
  const fone = () => '5548' + String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9)
  const { error } = await db().from('leads').insert([
    { tenant_id: r.tenantId, name: `${PREFIXO} Dela ${marca}`, phone: fone(), client_id: cliente, owner_id: minha.userId },
    { tenant_id: r.tenantId, name: `${PREFIXO} De outro dono ${marca}`, phone: fone(), client_id: cliente, owner_id: r.professionalId },
  ])
  expect(error).toBeNull()

  const contagem = (m: MembroDeTeste) => comSessao(browser, m, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=oportunidades`)
    const resumo = p.getByText(/em aberto · \d+ no total/)
    await expect(resumo).toBeVisible({ timeout: 30_000 })
    return (await resumo.textContent())?.trim()
  })
  expect(await contagem(minha)).toBe('1 em aberto · 1 no total')
  expect(await contagem(todos)).toBe('2 em aberto · 2 no total')
})

test('CRM-10: "Ir para a conversa" do card abre a conversa de uma caixa que o cargo vê', async ({ browser }) => {
  const r = rede!
  const daCaixa = await membro(criarMembro(`vac10${marca}`, {
    tenant: r.tenantId, rotulo: 'SDR minhas caixas', inboxCaixas: 'minhas',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }],
  }))
  const todas = await membro(criarMembro(`vac10t${marca}`, {
    tenant: r.tenantId, rotulo: 'SDR todas as caixas', inboxCaixas: 'todas',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }],
  }))
  const caixa = async (rotulo: string) => {
    const { data, error } = await db().from('whatsapp_numbers').insert({
      tenant_id: r.tenantId, provider: 'uazapi', label: `${PREFIXO} ${rotulo} ${marca}`, is_active: true,
      config: { token: `e2e-va-${rotulo}-${marca}`, baseUrl: 'https://e2e.invalido' },
    }).select('id').single<{ id: string }>()
    expect(error, `criar a caixa ${rotulo}`).toBeNull()
    return data!.id
  }
  const x = await caixa('X')
  const y = await caixa('Y')
  expect((await db().from('whatsapp_number_users')
    .insert({ whatsapp_number_id: x, user_id: daCaixa.userId, tenant_id: r.tenantId })).error, 'ligar a SDR à caixa X').toBeNull()

  const fone = '5548' + String(Date.now()).slice(-9)
  const { data: lead, error: eL } = await db().from('leads')
    .insert({ tenant_id: r.tenantId, name: `${PREFIXO} Pessoa de duas caixas ${marca}`, phone: fone })
    .select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(eL).toBeNull()
  const conversa = async (numero: string, horasAtras: number) => {
    const { data, error } = await db().from('conversations').insert({
      tenant_id: r.tenantId, status: 'open', channel: 'whatsapp', provider: 'uazapi', whatsapp_number_id: numero,
      contato_id: lead!.contato_id, contact_name: `${PREFIXO} Pessoa ${marca}`, contact_phone: fone,
      contact_external_id: fone, contact_aliases: [fone],
      last_message_at: new Date(Date.now() - horasAtras * 3600_000).toISOString(), last_message: 'oi',
    }).select('id').single<{ id: string }>()
    expect(error, 'criar a conversa').toBeNull()
    return data!.id
  }
  const naX = await conversa(x, 2)   // a mais antiga, na caixa dela
  const naY = await conversa(y, 0)   // a mais recente, em outra caixa

  const abrir = (m: MembroDeTeste) => comSessao(browser, m, p =>
    chamarAcao(p, 'actions/inbox.ts', 'openLeadConversation', '/admin/oportunidades', [lead!.id]))
  const dela = await abrir(daCaixa)
  expect(dela.texto).toContain(naX)
  expect(dela.texto).not.toContain(naY)
  expect((await abrir(todas)).texto).toContain(naY)
})
