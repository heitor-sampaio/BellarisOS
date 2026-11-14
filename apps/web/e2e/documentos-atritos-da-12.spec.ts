import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Os atritos dos termos e contratos da 12ª simulação (2026-11-10/11, a Helena
 * da Margarida, a Cláudia da Acácia e a Paula), numa rede [e2e] própria:
 *
 * - A13: não havia variável do registro no conselho (CRM/COREN). Princípio 1:
 *   "Registro no conselho" opcional no cadastro da pessoa da equipe, e a
 *   variável `profissional.registro`.
 * - A14: o contrato de PLANO não tinha a variável da profissional (só o termo e
 *   o contrato do procedimento).
 * - A15: o texto colado com "{{paciente.nome}}" não virava variável; e o
 *   Ctrl+A/Delete apagava o "Lugar da assinatura do cliente" sem aviso.
 * - A16: o editor mostrava "1. 1. Objeto" e uma linha "8." vazia — a correção
 *   da F55 A7 valia só ao salvar; a tela de edição mostrava o duplicado.
 * - A17: o termo do Peeling só avisava "Faltam dados: Data de nascimento"
 *   depois de agendado — o Agendar não dizia.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const DIA = diaEmQueAUnidadeAbre(2)
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let dona: MembroDeTeste
let recepcao: MembroDeTeste
let caixa: MembroDeTeste
let slug = ''
let nomeDaProfissional = ''
const TERMO = '# Termo do peeling\n\nProfissional: {{profissional.nome}} ({{profissional.registro}}).\n\nEu, **{{cliente.nome}}**, nascida em {{cliente.nascimento}}, autorizo.\n\n[[assinatura]]'

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function salvarModelo(p: { nome: string; tipo: string; momento: string | null; texto?: string; documento?: unknown; variaveis?: string[] }) {
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: p.nome, p_tipo: p.tipo, p_origem: 'EDITOR',
    p_momento: p.momento, p_exigencia: 'AVISA', p_texto: p.texto ?? null,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: p.variaveis ?? [], p_usa_pagamento: false, p_ator: null, ...(p.documento ? { p_documento: p.documento } : {}),
  })
  expect(error, 'salvar o modelo').toBeNull()
  return (data as { id: string }).id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`doc12${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  nomeDaProfissional = (await db().from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name
  expect((await db().from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  const termo = await salvarModelo({ nome: nome('Termo do peeling'), tipo: 'TERMO', momento: 'AGENDAMENTO', texto: TERMO,
    variaveis: ['profissional.nome', 'profissional.registro', 'cliente.nome', 'cliente.nascimento'] })
  expect((await db().from('procedures').update({ consent_template_id: termo }).eq('id', rede.procedureId)).error).toBeNull()
  dona = await criarMembro(`doc12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  recepcao = await criarMembro(`doc12r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }],
  })
  caixa = await criarMembro(`doc12c${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  await dona?.limpar(); await recepcao?.limpar(); await caixa?.limpar()
  await rede?.limpar()
})

test('A13: o registro no conselho da profissional se cadastra na Equipe e sai no termo', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/team')
    await p.getByRole('button', { name: 'Adicionar membro' }).click()
    await expect(p.getByLabel('Registro no conselho (opcional)'), 'o cadastro novo também pede').toBeVisible()
    await p.keyboard.press('Escape')
    await p.goto('/admin/team')
    await p.getByTitle(`Editar ${nomeDaProfissional}`).click()
    const modal = p.getByRole('dialog')
    // A profissional do apoio nasce sem cargo: o formulário pede um.
    await modal.locator(`#tme-role-${rede.professionalId}`).selectOption({ label: 'Profissional' })
    await modal.getByLabel('Registro no conselho (opcional)').fill('CRM-SC 12345')
    await modal.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(modal).toHaveCount(0)
  })
  await expect.poll(async () => (await db().from('users').select('registro_conselho').eq('id', rede.professionalId)
    .single<{ registro_conselho: string | null }>()).data?.registro_conselho).toBe('CRM-SC 12345')

  const cliente = await rede.criarCliente('Ana com nascimento')
  expect((await db().from('clients').update({ birth_date: '1990-03-14' }).eq('id', cliente)).error).toBeNull()
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(`${DIA}T09:00:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${ag!.id}"]`).first().click()
    await expect(p.getByRole('dialog', { name: 'Agendamento' }).locator('[data-documentos-do-agendamento]')).toContainText('Falta assinar')
  })
  const { data: termo } = await db().from('issued_documents').select('content').eq('appointment_id', ag!.id).eq('kind', 'TERMO')
    .single<{ content: string | null }>()
  expect(termo?.content).toContain(`${nomeDaProfissional} (CRM-SC 12345)`)
})

test('A14: o contrato de PLANO diz a profissional (a do plano)', async ({ browser }) => {
  const contrato = await salvarModelo({
    nome: nome('Contrato de plano'), tipo: 'CONTRATO_PLANO', momento: null,
    texto: '# Contrato\n\nResponsável técnica: {{profissional.nome}}.\n\nPagamento: {{pagamento.forma}}.\n\n[[assinatura]]',
  })
  expect((await db().rpc('documento_contrato_de_plano_ativar', { p_tenant: rede.tenantId, p_modelo: contrato })).error).toBeNull()
  const { planId, clientId } = await rede.criarPlanoProposto('Plano A14', { semTermo: true })
  expect((await db().from('clients').update({ document: '11144477735', birth_date: '1990-03-14' }).eq('id', clientId)).error).toBeNull()
  await como(browser, caixa, async p => {
    // Fase 3 do PDV (PT1b): o plano se aceita antes, e os documentos do receber se preparam no PDV.
    // O aceite é da página do plano (é ela que carrega a action). A resposta
    // vem como payload RSC, com a árvore da página: a prova é o banco.
    await chamarAcao(p, 'actions/treatment-plans.ts', 'aceitarPlano', `/admin/planejamentos/${planId}`, [planId])
    const { data: aceito } = await db().from('treatment_plans').select('status').eq('id', planId).single<{ status: string }>()
    expect(aceito!.status, 'o aceite passa').toBe('ACCEPTED')
    await chamarAcao(p, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', '/admin/pdv', [planId, { forma: 'AVISTA', metodo: 'PIX' }])
  })
  const { data } = await db().from('issued_documents').select('status, content, missing_fields')
    .eq('treatment_plan_id', planId).eq('kind', 'CONTRATO_PLANO').not('status', 'in', '(CANCELADO,SUBSTITUIDO)')
    .single<{ status: string; content: string | null; missing_fields: string[] | null }>()
  expect(data?.missing_fields ?? []).toEqual([])
  expect(data?.content).toContain(`Responsável técnica: ${nomeDaProfissional}`)
})

const corpo = (p: Page) => p.getByLabel('Corpo do documento')

test('A15: o texto colado com {{paciente.nome}} vira a variável da cliente; sem o lugar da assinatura, a tela avisa', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=documentos')
    await p.getByRole('button', { name: 'Novo termo' }).click()
    await expect(corpo(p).locator('[data-assinatura]'), 'o termo novo nasce com o lugar da assinatura').toHaveCount(1)
    await expect(p.locator('[data-sem-assinatura]')).toHaveCount(0)
    await corpo(p).click()
    await p.keyboard.press('Control+A')
    await p.keyboard.press('Delete')
    await expect(p.locator('[data-sem-assinatura]'), 'apagou o lugar: a tela diz onde a assinatura vai').toContainText('no fim do documento')
    await p.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'Eu, {{paciente.nome}}, CPF {{ cliente.cpf }}, autorizo.')
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(corpo(p).locator('[data-variavel="cliente.nome"]'), 'o paciente é a cliente').toHaveCount(1)
    await expect(corpo(p).locator('[data-variavel="cliente.cpf"]')).toHaveCount(1)
    await expect(corpo(p)).not.toContainText('{{')
  })
})

test('A16: o editor abre o item numerado sem o número digitado, e sem o item vazio', async ({ browser }) => {
  const titulo = nome('Termo numerado')
  await salvarModelo({
    nome: titulo, tipo: 'TERMO', momento: 'AGENDAMENTO',
    documento: { corpo: { type: 'doc', content: [
      { type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1. Objeto' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2. Riscos' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph' }] },
      ] },
      { type: 'assinatura' },
    ] } },
  })
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=documentos')
    await p.getByRole('button', { name: `Editar ${titulo}` }).click()
    const itens = corpo(p).locator('ol > li')
    await expect(itens).toHaveCount(2)
    await expect(itens.nth(0)).toHaveText('Objeto')
    await expect(itens.nth(1)).toHaveText('Riscos')
  })
})

test('A17: o Agendar diz o que falta no cadastro para o termo do procedimento, antes de agendar', async ({ browser }) => {
  const semNascimento = await rede.criarCliente('Paula sem nascimento')
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?novo=1&cliente=${semNascimento}`)
    const janela = p.getByRole('dialog', { name: 'Novo agendamento' })
    await janela.getByLabel('Procedimento *').selectOption(rede.procedureId)
    const aviso = janela.locator('[data-aviso-falta-no-cadastro]')
    await expect(aviso).toContainText('Data de nascimento')
    await expect(aviso).toContainText(nome('Termo do peeling'))
    await expect(aviso.getByRole('link', { name: 'Completar o cadastro' })).toHaveAttribute('href', new RegExp(`/clients/${semNascimento}\\?aba=dados$`))
  })
  // Controle: com o cadastro completo, nada a dizer.
  const completa = await rede.criarCliente('Marta completa')
  expect((await db().from('clients').update({ birth_date: '1985-01-02' }).eq('id', completa)).error).toBeNull()
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?novo=1&cliente=${completa}`)
    const janela = p.getByRole('dialog', { name: 'Novo agendamento' })
    await janela.getByLabel('Procedimento *').selectOption(rede.procedureId)
    // A conferência é assíncrona: dá a ela o tempo de chegar antes de dizer que não veio.
    await p.waitForTimeout(2_000)
    await expect(janela.locator('[data-aviso-falta-no-cadastro]')).toHaveCount(0)
  })
})
