import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Decisão 2 do Heitor (7ª simulação, 2026-11-05: "concordo"): a Beatriz tinha
 * 16 anos, e não havia campo de responsável, aviso na agenda e no atendimento,
 * nem termo assinado pelo responsável — a Lia escreveu o nome da mãe nas
 * Anotações. Com `idadeEm` < 18, a ficha pede o "Responsável legal" (nome,
 * CPF, parentesco, telefone); a agenda e o atendimento mostram "Menor"; o
 * termo ganha as variáveis do responsável e é assinado por ele. Avisar, não
 * barrar (princípio 2): sem responsável, a ficha e o atendimento avisam, e o
 * termo que pede o responsável fica INCOMPLETO. Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
let slug = ''
const ANO = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()))
const NASCIMENTO_DA_MENOR = `${ANO - 16}-03-14`
const CPF_DA_MAE = '52998224725'
const nome = (r: string) => `${PREFIXO} Menor ${r} ${marca}`
const telefone = (fim: string) => `(71) 9${String(Date.now()).slice(-4)}-${fim}`
const DIA = diaEmQueAUnidadeAbre(2)
const docs: string[] = []

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const fichaDe = async (n: string) => (await db().from('clients')
  .select('id, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone').eq('tenant_id', rede.tenantId).eq('name', n)
  .maybeSingle<{ id: string; responsavel_nome: string | null; responsavel_cpf: string | null; responsavel_parentesco: string | null; responsavel_telefone: string | null }>()).data

async function menorAgendada(rotulo: string, responsavel: Record<string, string | null>, hora: string) {
  const cliente = await rede.criarCliente(rotulo)
  expect((await db().from('clients').update({ birth_date: NASCIMENTO_DA_MENOR, ...responsavel }).eq('id', cliente)).error).toBeNull()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(`${DIA}T${hora}:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { cliente, agendamento: data!.id }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`mn${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`mnr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'documents', nivel: 'MANAGE' },
    ],
  })
  // O termo cita o responsável e o documento de quem assina.
  const { error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo da menor ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA',
    p_texto: '# Termo\n\nEu, **{{responsavel.nome}}** ({{responsavel.parentesco}}), CPF {{responsavel.cpf}}, autorizo o procedimento em **{{cliente.nome}}**.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const { data: modelo } = await db().from('document_templates').select('id').eq('tenant_id', rede.tenantId).eq('kind', 'TERMO').single<{ id: string }>()
  expect((await db().from('procedures').update({ consent_template_id: modelo!.id }).eq('id', rede.procedureId)).error).toBeNull()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
  const ids = [...new Set([...docs, ...(data ?? []).map(d => d.id as string)])]
  if (ids.length) expect(await apagarDocumentosEmitidos(ids)).toEqual([])
  await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await db().from('procedures').update({ consent_template_id: null }).eq('id', rede.procedureId)
  await recepcao?.limpar()
  await rede?.limpar()
})

test('no cadastro, a data de nascimento de 16 anos abre o "Responsável legal"; a adulta, não', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/clients/new')
    await p.locator('input[name="name"]').fill(nome('Beatriz'))
    await p.locator('input[name="phone"]').fill(telefone('0201'))
    const bloco = p.locator('[data-responsavel-legal]')
    await p.locator('input[name="birth_date"]').fill(`${ANO - 30}-03-14`)
    await expect(bloco, 'adulta: nada a pedir').toHaveCount(0)
    await p.locator('input[name="birth_date"]').fill(NASCIMENTO_DA_MENOR)
    await expect(bloco).toBeVisible()
    await expect(bloco).toContainText('Menor · 16 anos')
    await expect(bloco).toContainText('é ele quem assina o termo')
    await bloco.getByLabel('Nome do responsável').fill('Marta Lima')
    await bloco.getByLabel('CPF do responsável').fill(CPF_DA_MAE)
    await bloco.getByLabel('Parentesco').selectOption('Mãe')
    await bloco.getByLabel('Telefone do responsável').fill('71988887777')
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
  })
  expect(await fichaDe(nome('Beatriz'))).toMatchObject({
    responsavel_nome: 'Marta Lima', responsavel_cpf: CPF_DA_MAE, responsavel_parentesco: 'Mãe', responsavel_telefone: '(71) 98888-7777',
  })
})

test('a ficha marca "Menor de idade"; sem responsável, avisa na Visão geral, e a aba Dados o cadastra', async ({ browser }) => {
  const cliente = await rede.criarCliente(`Sem responsável ${marca}`)
  expect((await db().from('clients').update({ birth_date: NASCIMENTO_DA_MENOR }).eq('id', cliente)).error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.locator('[data-menor]')).toHaveText('Menor de idade')
    await expect(p.locator('[data-aviso-do-menor]')).toContainText('Menor de idade (16 anos), sem responsável legal no cadastro.')

    await p.goto(`/${slug}/clients/${cliente}?aba=dados`)
    const bloco = p.locator('[data-responsavel-legal]')
    await bloco.getByLabel('Nome do responsável').fill('João Souza')
    await bloco.getByLabel('Parentesco').selectOption('Pai')
    await p.getByRole('button', { name: /Salvar dados/ }).click()
    await expect(p.getByRole('button', { name: 'Salvo' })).toBeVisible()

    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.locator('[data-responsavel-da-ficha]')).toContainText('Responsável: João Souza (Pai)')
    await expect(p.locator('[data-aviso-do-menor]')).toHaveCount(0)
  })
  const { data } = await db().from('clients').select('responsavel_nome, responsavel_parentesco').eq('id', cliente).single()
  expect(data).toEqual({ responsavel_nome: 'João Souza', responsavel_parentesco: 'Pai' })
})

test('a janela da agenda e o atendimento mostram "Menor" e o responsável — ou avisam que falta', async ({ browser }) => {
  const comResp = await menorAgendada(`Com resp ${marca}`, { responsavel_nome: 'Marta Lima', responsavel_parentesco: 'Mãe', responsavel_telefone: '(71) 98888-7777' }, '10:00')
  const semResp = await menorAgendada(`Sem resp ${marca}`, {}, '11:00')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await expect(p.locator(`[data-agendamento="${comResp.agendamento}"] [data-menor]`).first(), 'o bloco da grade').toBeVisible()
    await p.locator(`[data-agendamento="${comResp.agendamento}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.locator('[data-menor]')).toContainText('Menor')
    await expect(janela.locator('[data-responsavel-do-agendamento]')).toContainText('Responsável: Marta Lima (Mãe) · (71) 98888-7777')

    await p.goto(`/${slug}/agenda/${semResp.agendamento}`)
    await expect(p.locator('[data-menor]').first()).toBeVisible()
    await expect(p.locator('[data-aviso-do-menor]')).toContainText('sem responsável legal no cadastro')
  })
})

test('o termo cita o responsável e é assinado por ele; sem responsável, fica incompleto', async ({ browser }) => {
  const sem = await menorAgendada(`Termo sem ${marca}`, {}, '14:00')
  const com = await menorAgendada(`Termo com ${marca}`, { responsavel_nome: 'Marta Lima', responsavel_cpf: CPF_DA_MAE, responsavel_parentesco: 'Mãe' }, '15:00')
  const docDe = async (cliente: string) => (await db().from('issued_documents').select('id').eq('client_id', cliente).single<{ id: string }>()).data!.id
  const docSem = await docDe(sem.cliente)
  const docCom = await docDe(com.cliente)
  docs.push(docSem, docCom)

  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${sem.cliente}`)
    await expect(p.locator('[data-falta-no-cadastro]'), 'A24: a falta aparece na Visão geral')
      .toContainText('falta no cadastro Responsável legal · Nome do responsável (menor de idade), Responsável legal · CPF do responsável')
  })
  expect((await db().from('issued_documents').select('status').eq('id', docSem).single()).data?.status).toBe('INCOMPLETO')

  await como(browser, async p => {
    await p.goto(`/${slug}/documentos/${docCom}/assinar`)
    await expect(p.getByText('Conferi o documento de identidade de')).toContainText('Marta Lima, responsável legal de')
    await p.getByRole('button', { name: 'Assinar no papel' }).click()
    await p.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
    await expect(p.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
  })
  const { data: doc } = await db().from('issued_documents').select('status, content').eq('id', docCom).single<{ status: string; content: string }>()
  expect(doc!.status).toBe('ASSINADO')
  expect(doc!.content).toContain('Marta Lima')
  expect(doc!.content).toContain('529.982.247-25')
  // A evidência da assinatura é do RESPONSÁVEL: o nome dele (de quem) e o CPF dele.
  const { data: menor } = await db().from('clients').select('name').eq('id', com.cliente).single<{ name: string }>()
  const { data: ass } = await db().from('document_signatures').select('signer_name, signer_document').eq('issued_document_id', docCom).single()
  expect(ass).toEqual({ signer_name: `Marta Lima, responsável legal de ${menor!.name}`, signer_document: CPF_DA_MAE })
})
