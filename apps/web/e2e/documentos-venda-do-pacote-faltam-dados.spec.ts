import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * D1 da 15ª simulação (2026-11-15): a Lia vendeu o pacote ao Breno sem ter os
 * Documentos e leu "1 depende de completar o cadastro. Estão na ficha, em
 * Documentos" — não dizia o que faltava, e a aba Documentos dela não mostrava
 * o contrato. Ela completou o endereço, e o contrato seguiu INCOMPLETO no
 * banco: só se montava de novo quando alguém com os Documentos o abria.
 *
 * Decidido pelos princípios (3): o aviso diz o que falta e quem tem os
 * Documentos; salvar o cadastro monta de novo os documentos incompletos da
 * cliente. Numa rede [e2e] própria.
 *
 * 2026-11-16 (o Heitor): colher a assinatura não pede permissão de
 * documento — o módulo Documentos é o dos MODELOS. Quem vendeu colhe: o aviso
 * não manda mais falar com ninguém (era a lista "quem colhe" do D4 da 19ª).
 */

const marca = Date.now().toString(36)
const db = () => banco()
const slug = `e2e-un-d1${marca}`

let rede: OutraRede | null = null
let vendedora: MembroDeTeste | null = null
let cliente = ''
let pacote = ''
let modeloEndereco = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`d1${marca}`)
  expect((await db().rpc('documentos_modelos_padrao', { p_tenant: rede.tenantId })).error).toBeNull()
  const { data: m, error: eM } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Declaracao d1 ${marca}`, p_tipo: 'DOCUMENTO', p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'AVISA', p_texto: '# Declaração\n\n{{cliente.nome}} mora em {{cliente.endereco}}.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(eM, 'criar o modelo que pede o endereço').toBeNull()
  modeloEndereco = (m as { id: string }).id
  expect((await db().from('procedures').update({ outros_documentos: [modeloEndereco], price: 300 }).eq('id', rede.procedureId)).error).toBeNull()
  const { data: pc, error: ePc } = await db().from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, total_sessions: 2, name: `${PREFIXO} Pacote d1 ${marca}`, price: 600, validity_days: 90, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(ePc, 'criar o pacote').toBeNull()
  pacote = pc!.id
  expect((await db().from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: pacote, procedure_id: rede.procedureId, quantity: 2, sort_order: 0 })).error).toBeNull()
  cliente = await rede.criarCliente('Breno d1')
  expect((await db().from('clients').update({ document: '52998224725' }).eq('id', cliente)).error).toBeNull()

  // Vende (o PDV e a ficha), sem permissão nenhuma de documento.
  vendedora = await criarMembro(`d1v${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Vende sem documentos',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await vendedora?.limpar()
  await rede?.limpar()
})

test.describe.serial('D1: o documento da venda do pacote com "faltam dados"', () => {
  let vendido = ''

  test('a venda diz o que falta no cadastro, e quem vendeu é quem colhe', async ({ browser }) => {
    const texto = await como(browser, vendedora!.estado, async p => {
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/${slug}/pdv`,
        [cliente, pacote, rede!.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, null])
      return r.texto
    })
    vendido = /"clientPackageId":"([0-9a-f-]{36})"/.exec(texto)?.[1] ?? ''
    expect(vendido, 'a venda fechou').not.toBe('')
    // O que falta, como a pessoa lê (e não a chave da variável).
    expect(texto).toContain('Endereço (rua, número e bairro)')
    expect(texto).not.toContain('"cliente.endereco"')
    // Quem vendeu colhe (2026-11-16): a resposta não aponta outra pessoa, e
    // ela vê os documentos na ficha (Clientes).
    expect(texto).not.toContain('quemColheOsDocumentos')
    expect(texto).toContain('"veOsDocumentos":true')
    const { data } = await db().from('issued_documents').select('status').eq('client_package_id', vendido).eq('template_id', modeloEndereco).single()
    expect(data!.status).toBe('INCOMPLETO')
  })

  test('salvar o cadastro com o endereço monta o documento de novo — sem ninguém abrir os Documentos', async ({ browser }) => {
    const { data: ficha } = await db().from('clients').select('phone').eq('id', cliente).single<{ phone: string }>()
    await como(browser, vendedora!.estado, async p => {
      const r = await chamarAcao(p, 'actions/clients.ts', 'updateClientContactData', `/${slug}/clients/${cliente}`, [cliente, {
        document: '52998224725', phone: ficha!.phone, email: null, birthDate: null,
        zipCode: '51020000', address: 'Avenida Boa Viagem', addressNumber: '100', addressComplement: null,
        neighborhood: 'Boa Viagem', city: 'Recife', state: 'PE',
      }, slug])
      expect(r.status).toBe(200)
    })
    // O cadastro gravou (a resposta da action traz a página inteira, revalidada).
    expect((await db().from('clients').select('address').eq('id', cliente).single()).data?.address).toBe('Avenida Boa Viagem')
    const { data } = await db().from('issued_documents').select('status, missing_fields').eq('client_package_id', vendido).eq('template_id', modeloEndereco).single()
    expect(data!.status).toBe('PENDENTE')
    expect(data!.missing_fields ?? []).toEqual([])
  })
})
