import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { contratoDaResposta } from './apoio/contrato-do-pacote'
import { abrirVendaNoPdv, euVendi, pagoNoPix } from './apoio/vender'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * PC2 — o pacote assina ANTES de pagar, como o plano (a auditoria das regras,
 * 2026-11-18). O Heitor, 13/11: "ele assina pelo pacote. o ideal era funcionar
 * como no plano de tratamento"; do plano: "primeiro colhe assinatura, depois
 * paga". Com o contrato de pacote ativo na rede:
 *
 * - a venda devolve o contrato a colher, montado com o pagamento escolhido, e
 *   NÃO grava nada (nem o pacote vendido, nem o dinheiro);
 * - assinado (ou dispensado, com o motivo, por quem dispensa documentos), a
 *   venda fecha e ADOTA o contrato — um só, o de antes;
 * - assinado com outro pagamento, a venda pergunta antes de substituir (A45 da
 *   5ª, como no plano); confirmado, o assinado vira substituído e nasce um novo,
 *   a assinar;
 * - a tela da venda mostra o contrato e o "Colher assinatura" antes do dinheiro.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const NOME = {
  contrato: `${PREFIXO} Contrato de pacote aa ${marca}`,
  pacote:   `${PREFIXO} Pacote aa ${marca}`,
}

let rede: OutraRede | null = null
let slug = ''
let caixa: MembroDeTeste | null = null
let pacote = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const pix = { forma: 'AVISTA', metodo: 'PIX' }
const credito3x = { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 }
const vender = (p: Page, cliente: string, pagamento: unknown, equipe: Record<string, unknown> | null = null) =>
  chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/${slug}/pdv`, [cliente, pacote, rede!.branchId, pagamento, null, null, equipe])
const vendidosDe = async (cliente: string) =>
  ((await db().from('client_packages').select('id').eq('client_id', cliente)).data ?? []).map(c => c.id as string)
const doc = async (id: string) => (await db().from('issued_documents')
  .select('status, kind, service_package_id, client_package_id, content_text, closed_reason').eq('id', id).single()).data as
  { status: string; kind: string; service_package_id: string | null; client_package_id: string | null; content_text: string | null; closed_reason: string | null }
const dinheiroDe = async (cliente: string) =>
  ((await db().from('financial_transactions').select('id').eq('client_id', cliente)).data ?? []).length

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`aa${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: NOME.contrato, p_tipo: 'CONTRATO_PACOTE', p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'AVISA',
    p_texto: '# Contrato\n\nEu, {{cliente.nome}}, contrato o {{pacote.nome}}, pago assim: {{pagamento.forma}}.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: ['cliente.nome', 'pacote.nome', 'pagamento.forma'], p_usa_pagamento: true, p_ator: null,
  })
  expect(error, 'criar o contrato de pacote').toBeNull()
  const { data: pc, error: ePc } = await db().from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, total_sessions: 2, name: NOME.pacote, price: 600, validity_days: 90, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(ePc, 'criar o pacote').toBeNull()
  pacote = pc!.id
  expect((await db().from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: pacote, procedure_id: rede.procedureId, quantity: 2, sort_order: 0 })).error).toBeNull()
  // Vende (o caixa), vê a ficha e dispensa documentos (quem responde pelos modelos).
  caixa = await criarMembro(`aac${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Caixa que dispensa',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await caixa?.limpar()
  await rede?.limpar()
})

// Um CPF válido por cliente: o CPF é único na rede (clients_tenant_id_document_key),
// e o spec cria uma cliente por teste — com o mesmo CPF, o 2º teste não nascia.
let clientesCriadas = 0
function cpfDeTeste(): string {
  const base = String(Date.now() + clientesCriadas++).slice(-9).split('').map(Number)
  const dv = (nums: number[]) => {
    const soma = nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  return [...base, d1, dv([...base, d1])].join('')
}

const novaCliente = async (rotulo: string) => {
  const id = await rede!.criarCliente(rotulo)
  expect((await db().from('clients').update({ document: cpfDeTeste() }).eq('id', id)).error).toBeNull()
  return id
}

test('sem o contrato assinado, nada se vende; dispensado com o motivo, a venda fecha e o adota', async ({ browser }) => {
  const cliente = await novaCliente('Dispensa aa')
  await como(browser, caixa!.estado, async p => {
    await p.goto(`/${slug}/pdv`)
    const r = await vender(p, cliente, pix, { semVendedor: true })
    const contrato = contratoDaResposta(r)
    expect(contrato, `a venda pediu o contrato: ${r.texto.slice(0, 300)}`).toBeTruthy()
    expect(r.texto).not.toContain('clientPackageId')
    expect(await vendidosDe(cliente), 'nenhum pacote vendido').toEqual([])
    expect(await dinheiroDe(cliente), 'nenhum dinheiro').toBe(0)
    const pre = await doc(contrato!)
    expect(pre).toMatchObject({ kind: 'CONTRATO_PACOTE', status: 'PENDENTE', service_package_id: pacote, client_package_id: null })
    expect(pre.content_text, 'o contrato cita o pacote e o pagamento escolhido').toContain(NOME.pacote)
    expect(pre.content_text).toMatch(/Pix/i)

    // Vender de novo, sem assinar: o MESMO contrato, e nada vendido.
    const de_novo = await vender(p, cliente, pix, { semVendedor: true })
    expect(contratoDaResposta(de_novo), 'o mesmo contrato, não um novo').toBe(contrato)
    expect(await vendidosDe(cliente)).toEqual([])

    const d = await chamarAcao(p, 'actions/documentos.ts', 'dispensarDocumento', `/${slug}/clients/${cliente}`, [contrato, 'A cliente leva o contrato para ler em casa'])
    expect(d.status).toBe(200)
    expect((await doc(contrato!)).status).toBe('DISPENSADO')
    const venda = await vender(p, cliente, pix, { semVendedor: true })
    const vendido = /"clientPackageId":"([0-9a-f-]{36})"/.exec(venda.texto)?.[1] ?? ''
    expect(vendido, 'dispensado, vende').not.toBe('')
    expect((await doc(contrato!)).client_package_id, 'a venda adotou o contrato').toBe(vendido)
    const contratos = ((await db().from('issued_documents').select('id').eq('client_package_id', vendido).eq('kind', 'CONTRATO_PACOTE')).data ?? []).map(c => c.id)
    expect(contratos, 'um contrato só').toEqual([contrato])
  })
})

test('assinado com outro pagamento: a venda pergunta; confirmado, o assinado vira substituído e nasce um novo, a assinar', async ({ browser }) => {
  const cliente = await novaCliente('Substitui aa')
  await como(browser, caixa!.estado, async p => {
    await p.goto(`/${slug}/pdv`)
    const contrato = contratoDaResposta(await vender(p, cliente, pix, { semVendedor: true }))!
    expect(contrato).toBeTruthy()
    // A cliente assinou o do Pix (o retrato do pagamento já está nele).
    expect((await db().from('issued_documents').update({ status: 'ASSINADO', signed_at: new Date().toISOString() }).eq('id', contrato)).error).toBeNull()

    const pergunta = await vender(p, cliente, credito3x, { semVendedor: true })
    expect(pergunta.texto, 'pergunta antes de trocar').toContain('já foi assinado para outro pagamento')
    expect(await vendidosDe(cliente), 'sem a resposta, nada').toEqual([])
    expect((await doc(contrato)).status, 'o assinado segue').toBe('ASSINADO')

    const r = await vender(p, cliente, credito3x, { semVendedor: true, substituirContrato: true })
    const novo = contratoDaResposta(r)
    expect(novo, 'nasce um contrato novo, a assinar').toBeTruthy()
    expect(novo).not.toBe(contrato)
    expect((await doc(contrato)).status).toBe('SUBSTITUIDO')
    expect((await doc(novo!)).content_text, 'o novo cita o crédito').toMatch(/Cr[eé]dito/i)
    expect(await vendidosDe(cliente), 'e ainda nada vendido').toEqual([])

    // A mesma resposta de novo (a tela que guardou o "substituir") não troca o novo.
    const outra = await vender(p, cliente, credito3x, { semVendedor: true, substituirContrato: true })
    expect(contratoDaResposta(outra), 'o mesmo novo').toBe(novo)
  })
})

test('a tela da venda mostra o contrato e o "Colher assinatura" antes do pagamento', async ({ browser }) => {
  const cliente = await novaCliente('Tela aa')
  await como(browser, caixa!.estado, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    const aba = dlg.getByRole('button', { name: 'Pacote', exact: true })
    if (await aba.count()) await aba.click()
    await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacote)
    await pagoNoPix(dlg)
    await euVendi(dlg)
    await dlg.getByRole('button', { name: /^Vender por/ }).click()
    const bloco = dlg.locator('[data-contrato-antes-de-vender]')
    await expect(bloco).toContainText('Antes do pagamento, a cliente assina o contrato')
    await expect(bloco).toContainText(NOME.contrato)
    await expect(bloco.getByRole('button', { name: 'Colher assinatura' })).toBeVisible()
    expect(await vendidosDe(cliente), 'a tela não vendeu').toEqual([])
    await bloco.getByRole('button', { name: 'Colher assinatura' }).click()
    await expect(p.getByRole('heading', { name: NOME.contrato })).toBeVisible()
  })
})
