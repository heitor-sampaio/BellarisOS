import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { abrirVendaNoPdv, euVendi, pagoNoPix } from './apoio/vender'

/**
 * Os atritos do caixa da 7ª simulação (2026-11-05), da F32:
 * - A43: o recibo do atendimento dizia só "Atendimento concluído" — sem o
 *   procedimento nem as vezes no cartão.
 * - A44: o Fechamento do dia não apontava o que a operadora do cartão ainda vai
 *   depositar (está no Financeiro, F20 D3).
 * - A45: o checkout do plano voltava ao passo "Plano" ao recarregar.
 * - A46: "Devolva o aparelho à equipe" depois de "o cliente assinou o papel";
 *   a tela de Pacotes falava em "Vender pacote", e o botão se chama "Vender".
 * - A47: a venda do pacote não oferecia "Agendar a 1ª sessão agora", como o
 *   pré-pago.
 * - A49: o desconto manual gravava sem motivo, sem lembrar que ele existe (o
 *   motivo segue opcional).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const textoDoPdf = (b: Buffer) => b.toString('latin1')
let rede: OutraRede | null = null
let slug = ''
let caixa: MembroDeTeste | null = null
let pacoteId = ''
const nomeDoProc = `${PREFIXO} Toxina ${marca}`
const docs: string[] = []

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`fi7${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // Unidade 24 h: os horários livres existem a qualquer hora em que o teste roda.
  const todoDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]]))
  expect((await db().from('branches').update({ horario: { dias: todoDia } }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('procedures').update({ name: nomeDoProc, price: 1200 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  const { data: pac, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote ${marca}`, p_preco: 2000, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 2 }],
  })
  expect(error, 'criar o pacote').toBeNull()
  pacoteId = pac as string
  caixa = await criarMembro(`fi7c${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'financial', nivel: 'VIEW' }, { modulo: 'procedures', nivel: 'VIEW' }, { modulo: 'documents', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    const ids = [...new Set([...docs, ...(data ?? []).map(d => d.id as string)])]
    if (ids.length) expect(await apagarDocumentosEmitidos(ids)).toEqual([])
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await caixa?.limpar(); await rede?.limpar()
})

test('A43: o recibo do atendimento diz o procedimento, quando foi e as vezes no cartão', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Recibo')
  const agora = new Date().toISOString()
  const ag = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 1100, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(ag.error).toBeNull()
  const { data: tx, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ag.data!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: 'e2e',
    p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 2, pontos: 0, desconto: 0, valor_final: 1100 },
  })
  expect(error, 'pagar o atendimento').toBeNull()
  await como(browser, caixa!, async p => {
    await p.goto(`/${slug}/financeiro`)
    const pdf = textoDoPdf(await (await p.request.get(`/api/recibos/${tx as string}`)).body())
    expect(pdf, 'o procedimento do atendimento').toContain(nomeDoProc)
    expect(pdf, 'a forma com as vezes').toContain('Crédito 2x')
    expect(pdf, 'as parcelas do cartão').toContain('2x de R$ 550,00')
  })
})

test('A44: o Fechamento do dia aponta o que a operadora ainda vai depositar, com o caminho do Financeiro', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Operadora')
  const agora = new Date().toISOString()
  const ag = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 900, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(ag.error).toBeNull()
  expect((await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ag.data!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: 'e2e',
    p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 3, pontos: 0, desconto: 0, valor_final: 900 },
  })).error).toBeNull()
  await como(browser, caixa!, async p => {
    await p.goto(`/${slug}/fechamento`)
    const aviso = p.locator('[data-aviso="a-receber-da-operadora"]')
    await expect(aviso).toContainText('A operadora do cartão ainda vai depositar')
    await expect(aviso.getByRole('link', { name: 'Ver no Financeiro' })).toHaveAttribute('href', `/${slug}/financeiro#recebiveis-da-operadora`)
  })
})

test('A45: o checkout do plano volta ao passo em que estava ao recarregar', async ({ browser }) => {
  const { planId } = await rede!.criarPlanoProposto('Recarregar', { semTermo: true })
  await como(browser, caixa!, async p => {
    // O passo guardado (sessionStorage, morre com a aba): a tela grava o que se escolhe.
    const guardado = () => p.evaluate(k => sessionStorage.getItem(k) ?? '', `bellaris:checkout-do-plano:${planId}`)
    await p.goto(`/${slug}/checkout/${planId}`)
    await expect.poll(guardado, { message: 'a tela hidratou e guarda o passo' }).toContain('"step":0')
    await p.getByRole('button', { name: /Confirmar plano/ }).click()
    await expect(p.locator('[data-passo-atual]')).toHaveAttribute('data-passo-atual', 'Pagamento')
    await p.getByRole('button', { name: 'À vista', exact: true }).click()
    await p.locator('[data-meio-do-checkout]', { hasText: 'Pix' }).click()
    await expect.poll(guardado).toContain('"paymentMethod":"PIX"')
    await p.reload()
    await expect(p.locator('[data-passo-atual]'), 'recarregar não volta ao "Plano"').toHaveAttribute('data-passo-atual', 'Pagamento')
    await expect(p.locator('[data-meio-do-checkout]', { hasText: 'Pix' }), 'o que foi escolhido fica').toHaveAttribute('aria-pressed', 'true')
    // Na documentação, recarregar volta à documentação.
    await p.getByRole('button', { name: /Ir para a documentação/ }).click()
    // "Quem vendeu" vazio pergunta antes (decisão 4 da 7ª): aqui, vende assim.
    await p.getByRole('button', { name: 'Vender assim' }).click()
    await expect(p.locator('[data-passo-atual]')).toHaveAttribute('data-passo-atual', 'Documentação')
    await expect.poll(guardado).toContain('"step":2')
    await p.reload()
    await expect(p.locator('[data-passo-atual]')).toHaveAttribute('data-passo-atual', 'Documentação')
  })
})

test('A46: assinado no papel, a tela não manda devolver o aparelho; no aparelho, manda', async ({ browser }) => {
  const { error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede!.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA',
    p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, autorizo o procedimento.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const { data: modelo } = await db().from('document_templates').select('id').eq('tenant_id', rede!.tenantId).eq('kind', 'TERMO').single<{ id: string }>()
  expect((await db().from('procedures').update({ consent_template_id: modelo!.id }).eq('id', rede!.procedureId)).error).toBeNull()
  const doc = async (rotulo: string, cpf: string) => {
    const cliente = await rede!.criarCliente(rotulo)
    expect((await db().from('clients').update({ document: cpf }).eq('id', cliente)).error).toBeNull()
    expect((await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    })).error).toBeNull()
    const { data } = await db().from('issued_documents').select('id').eq('client_id', cliente).single<{ id: string }>()
    docs.push(data!.id)
    return data!.id
  }
  const noPapel = await doc('Papel', '52998224725')
  const noAparelho = await doc('Aparelho', '11144477735')
  await como(browser, caixa!, async p => {
    await p.goto(`/${slug}/documentos/${noPapel}/assinar`)
    await p.getByRole('button', { name: 'Assinar no papel' }).click()
    await p.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
    await expect(p.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
    await expect(p.locator('[data-assinado-no-papel]')).toContainText('Assinatura no papel registrada')
    await expect(p.getByText('Devolva o aparelho à equipe.')).toHaveCount(0)

    await p.goto(`/${slug}/documentos/${noAparelho}/assinar`)
    await p.getByText('Conferi o documento de identidade de').click()
    await p.getByRole('button', { name: 'Entregar ao cliente' }).click()
    await p.getByText(/li e concordo com este documento/).click()
    const quadro = p.locator('canvas').last()
    const caixaDoQuadro = (await quadro.boundingBox())!
    await p.mouse.move(caixaDoQuadro.x + 40, caixaDoQuadro.y + 60); await p.mouse.down()
    for (const [x, y] of [[140, 40], [240, 110], [360, 50]]) await p.mouse.move(caixaDoQuadro.x + x!, caixaDoQuadro.y + y!, { steps: 5 })
    await p.mouse.up()
    await p.getByRole('button', { name: 'Assinar documento' }).click()
    await expect(p.getByText('Devolva o aparelho à equipe.')).toBeVisible()
  })
  expect((await db().from('procedures').update({ consent_template_id: null }).eq('id', rede!.procedureId)).error).toBeNull()
})

test('A46: a tela de Pacotes manda à "Nova venda" do PDV, o nome do botão', async ({ browser }) => {
  // Só se vende pelo PDV (PDV7, 2026-11-13): o texto aponta a "Nova venda".
  await como(browser, caixa!, async p => {
    await p.goto(`/${slug}/pacotes`)
    await expect(p.getByText(/A venda é no PDV/)).toContainText('“Nova venda”')
    await expect(p.getByText(/Vender pacote/)).toHaveCount(0)
  })
})

test('A47: vendido o pacote, a venda oferece agendar a 1ª sessão agora', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Pacote')
  await como(browser, caixa!, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    await dlg.getByRole('button', { name: 'Pacote', exact: true }).click()
    await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteId)
    await pagoNoPix(dlg)
    await euVendi(dlg)
    await dlg.getByRole('button', { name: /Vender por/ }).click()
    const agendar = dlg.locator('[data-agendar-a-primeira-sessao]')
    await expect(agendar).toContainText('Agendar a 1ª sessão agora')
    await expect(agendar).toContainText(nomeDoProc)
  })
})

test('A49: com desconto e sem motivo, a janela do pagamento lembra que o motivo existe (segue opcional)', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Desconto')
  const agora = new Date().toISOString()
  const ag = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 1200, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(ag.error).toBeNull()
  await como(browser, caixa!, async p => {
    await p.goto(`/${slug}/agenda/${ag.data!.id}?receber=1`)
    const janela = p.getByRole('dialog')
    await janela.getByLabel('Desconto', { exact: true }).fill('100')
    const lembrete = janela.locator('[data-lembrete-do-motivo]')
    await expect(lembrete).toContainText('Sem motivo')
    await janela.getByLabel('Motivo do desconto').fill('Cliente fiel')
    await expect(lembrete).toHaveCount(0)
  })
})
