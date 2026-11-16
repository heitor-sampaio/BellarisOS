import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * A decisão do Heitor de 2026-11-16: "A permissão de gerenciar documentos
 * serve para alguém poder criar/editar/excluir os modelos de documentos. É uma
 * proteção para que os documentos não sejam modificados por quem não deve. Um
 * procedimento/plano/pacote que tenha documentos que precisam de assinatura, os
 * documentos precisam ser assinados. É só uma questão de disponibilizar para o
 * cliente assinar e isso não representa risco."
 *
 * - Quem está na tela (o PDV, o atendimento) colhe a assinatura SEM o módulo
 *   Documentos: o contrato do pacote que vendeu e o termo do procedimento.
 * - O mesmo membro não grava modelo de documento nem dispensa um documento
 *   (chamando as actions direto); quem tem os Documentos em Gerenciar grava o
 *   modelo (o controle).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const NOME = {
  contrato: `${PREFIXO} Contrato de pacote sp ${marca}`,
  termo:    `${PREFIXO} Termo sp ${marca}`,
  pacote:   `${PREFIXO} Pacote sp ${marca}`,
  modeloNao: `${PREFIXO} Modelo recusado sp ${marca}`,
  modeloSim: `${PREFIXO} Modelo gravado sp ${marca}`,
}

let rede: OutraRede | null = null
let slug = ''
let balcao: MembroDeTeste | null = null
let modelos: MembroDeTeste | null = null
let cliente = ''
let pacote = ''
let agendamento = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function modelo(nome: string, tipo: string, texto: string) {
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede!.tenantId, p_modelo: null, p_nome: nome, p_tipo: tipo, p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'BLOQUEIA', p_texto: texto,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error, `criar o modelo ${nome}`).toBeNull()
  return (data as { id: string }).id
}

const statusDe = async (id: string) =>
  (await db().from('issued_documents').select('status').eq('id', id).single<{ status: string }>()).data?.status

async function rabiscar(p: Page) {
  const quadro = p.locator('canvas').last()
  await quadro.scrollIntoViewIfNeeded()
  const caixa = (await quadro.boundingBox())!
  await p.mouse.move(caixa.x + 40, caixa.y + 60); await p.mouse.down()
  for (const [x, y] of [[140, 40], [240, 110], [360, 50]]) await p.mouse.move(caixa.x + x!, caixa.y + y!, { steps: 5 })
  await p.mouse.up()
}

/** Na tela de assinar da equipe: confere a identidade, entrega o aparelho e a cliente assina. */
async function colherNaTela(p: Page) {
  const entregar = p.getByRole('button', { name: 'Entregar ao cliente' })
  await expect(entregar).toBeVisible()
  await p.getByText(/Conferi o documento de identidade/).click()
  await entregar.click()
  await expect(p.locator('[data-tela-da-cliente]')).toBeVisible()
  const tela = p.locator('[data-tela-da-cliente]')
  // Um documento só, ou vários juntos (DC3): abre cada um antes.
  // (o aberto vira "Fechar": sempre o primeiro "Ler" que sobrou)
  const ler = tela.getByRole('button', { name: /^Ler / })
  for (let n = await ler.count(); n > 0; n = await ler.count()) {
    await ler.first().click()
    await expect(ler).toHaveCount(n - 1)
  }
  await tela.getByText(/li e concordo com (este documento|os documentos)/).click()
  await rabiscar(p)
  await tela.getByRole('button', { name: /^Assinar (documento|os \d+ documentos)$/ }).click()
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`sp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug

  // O contrato de pacote da rede e o termo do procedimento — só com o nome da cliente.
  await modelo(NOME.contrato, 'CONTRATO_PACOTE', '# Contrato\n\nEu, {{cliente.nome}}, contrato o pacote.\n\n[[assinatura]]')
  const termo = await modelo(NOME.termo, 'TERMO', '# Termo\n\nEu, {{cliente.nome}}, autorizo o procedimento.\n\n[[assinatura]]')
  expect((await db().from('procedures').update({ consent_template_id: termo, price: 300 }).eq('id', rede.procedureId)).error).toBeNull()

  const { data: pc, error: ePc } = await db().from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, total_sessions: 2, name: NOME.pacote, price: 600, validity_days: 90, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(ePc, 'criar o pacote').toBeNull()
  pacote = pc!.id
  expect((await db().from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: pacote, procedure_id: rede.procedureId, quantity: 2, sort_order: 0 })).error).toBeNull()

  cliente = await rede.criarCliente('Clara sp')
  expect((await db().from('clients').update({ document: '52998224725' }).eq('id', cliente)).error).toBeNull()

  // O agendamento avulso: o termo nasce com ele (DC4).
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), duration_min: 30, price: 300, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(eAg, 'agendar').toBeNull()
  agendamento = ag!.id

  // O balcão: PDV, Clientes e a Agenda — SEM o módulo Documentos.
  balcao = await criarMembro(`spb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcao sem documentos',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  // Quem responde pelos modelos: os Documentos em Gerenciar, com "A rede inteira".
  modelos = await criarMembro(`spm${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Modelos de documento',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await balcao?.limpar()
  await modelos?.limpar()
  await rede?.limpar()
})

test.describe.serial('colher a assinatura não pede o módulo Documentos', () => {
  test('o balcão vende o pacote no PDV e colhe na tela a assinatura do contrato', async ({ browser }) => {
    const contrato = await como(browser, balcao!.estado, async p => {
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/${slug}/pdv`,
        [cliente, pacote, rede!.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, null])
      const vendido = /"clientPackageId":"([0-9a-f-]{36})"/.exec(r.texto)?.[1] ?? ''
      expect(vendido, `a venda fechou: ${r.texto.slice(0, 300)}`).not.toBe('')
      // Ninguém manda "falar com quem tem os Documentos": quem vendeu colhe.
      expect(r.texto).not.toContain('quem tem os Documentos')
      const { data } = await db().from('issued_documents').select('id, status').eq('client_package_id', vendido).eq('title', NOME.contrato).single<{ id: string; status: string }>()
      expect(data!.status).toBe('PENDENTE')

      await p.goto(`/${slug}/documentos/${data!.id}/assinar`)
      await expect(p.getByRole('heading', { name: NOME.contrato })).toBeVisible()
      await colherNaTela(p)
      return data!.id
    })
    await expect.poll(() => statusDe(contrato)).toBe('ASSINADO')
    const { data: s } = await db().from('document_signatures').select('channel, conducted_by').eq('issued_document_id', contrato).single()
    expect(s).toMatchObject({ channel: 'CLINICA', conducted_by: balcao!.userId })
  })

  test('no atendimento, o balcão colhe o termo do procedimento — sem aviso de "quem colhe"', async ({ browser }) => {
    const { data: t } = await db().from('issued_documents').select('id, status').eq('appointment_id', agendamento).eq('title', NOME.termo).single<{ id: string; status: string }>()
    // Nasce ao agendar (A_GERAR) e a tela o monta ao listar (PENDENTE).
    expect(['A_GERAR', 'PENDENTE']).toContain(t!.status)
    await como(browser, balcao!.estado, async p => {
      await p.goto(`/${slug}/agenda/${agendamento}`)
      const linha = p.locator(`[data-documento="${t!.id}"]`)
      await expect(linha).toBeVisible()
      await expect(p.locator('[data-quem-colhe]')).toHaveCount(0)
      // Dispensar é de quem responde pelos modelos: o balcão não vê o botão.
      await expect(linha.getByRole('button', { name: 'Dispensar' })).toHaveCount(0)
      await linha.getByRole('link', { name: 'Colher assinatura' }).click()
      await expect(p.getByRole('heading', { name: NOME.termo })).toBeVisible()
      await colherNaTela(p)
    })
    await expect.poll(() => statusDe(t!.id)).toBe('ASSINADO')
  })

  test('o balcão não grava modelo de documento nem dispensa; quem tem os Documentos em Gerenciar grava o modelo', async ({ browser }) => {
    const documento = { corpo: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Termo de ' }, { type: 'variavel', attrs: { nome: 'cliente.nome' } }] }] } }
    const salvar = (p: Page, nome: string) => chamarAcao(p, 'actions/modelos-de-documento.ts', 'salvarModeloDoEditor', '/admin/settings?tab=documentos',
      [{ nome, tipo: 'TERMO', exigencia: 'AVISA', documento }])
    const quantos = async (nome: string) => (await db().from('document_templates').select('id').eq('tenant_id', rede!.tenantId).eq('name', nome)).data?.length ?? 0

    // Um documento aberto para tentar dispensar.
    const { data: ag, error: eAg } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 30, price: 300, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    expect(eAg).toBeNull()
    const { data: aberto } = await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).eq('title', NOME.termo).single<{ id: string }>()

    await como(browser, balcao!.estado, async p => {
      await salvar(p, NOME.modeloNao)
      const r = await chamarAcao(p, 'actions/documentos.ts', 'dispensarDocumento', `/${slug}/clients/${cliente}`, [aberto!.id, 'Dispensado pelo balcão, sem a permissão'])
      expect(r.status).toBeLessThan(600)
    })
    expect(await quantos(NOME.modeloNao), 'sem os Documentos, o modelo não grava').toBe(0)
    expect(await statusDe(aberto!.id), 'sem os Documentos, não dispensa').not.toBe('DISPENSADO')

    await como(browser, modelos!.estado, async p => { await salvar(p, NOME.modeloSim) })
    await expect.poll(() => quantos(NOME.modeloSim), { message: 'com os Documentos em Gerenciar, grava' }).toBe(1)
  })
})
