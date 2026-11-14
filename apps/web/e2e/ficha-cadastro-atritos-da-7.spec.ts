import { randomUUID } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { diaEmQueAUnidadeAbre, haMinutosHoje } from './apoio/datas'

/**
 * Os atritos do cadastro e da ficha da 7ª simulação (2026-11-05), pelas regras
 * de sempre:
 * - A22: "Cadastrar" sem responder "É a mesma pessoa do lead?" não fazia nada
 *   nem dizia por quê;
 * - A23: "Unificar" não deixava registro no Histórico da ficha;
 * - A24: o CPF que trava o termo só aparecia na janela do agendamento;
 * - A25: a falta não aparecia na Visão geral, e "Não compareceu" gravava sem
 *   confirmar;
 * - A26: "Pedir no portal" aparecia para quem não tem o app, e só no clique
 *   dizia que ela não tem.
 * Numa rede [e2e] própria.
 */



const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
let slug = ''
let etapa = ''
const nome = (r: string) => `${PREFIXO} Atrito ${r} ${marca}`
const sufixo = String(Date.now()).slice(-4)
const docs: string[] = []
const comAcessoFalso: string[] = []

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function preencher(p: Page, d: { nome: string; telefone: string }) {
  await p.goto('/admin/clients/new')
  await expect(async () => {
    await p.locator('input[name="name"]').fill(d.nome)
    await p.locator('input[name="phone"]').fill('')
    await p.locator('input[name="phone"]').fill(d.telefone)
    await expect(p.locator('input[name="phone"]')).toHaveValue(/\(\d\d\)/, { timeout: 1000 })
  }).toPass()
}

const fichasDe = async (n: string) => (await db().from('clients').select('id').eq('tenant_id', rede.tenantId).eq('name', n)).data ?? []

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`at7${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  const { data: funil } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'F', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  const { data: aberta } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' }).select('id').single<{ id: string }>()
  etapa = aberta!.id
  recepcao = await criarMembro(`at7r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'VIEW' },
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'documents', nivel: 'MANAGE' },
    ],
  })
  // O termo pede o CPF (A24) — o mesmo modelo serve ao "Pedir no portal" (A26).
  const { error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo com CPF ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA',
    p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, CPF {{cliente.cpf}}, autorizo.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const { data: modelo } = await db().from('document_templates').select('id').eq('tenant_id', rede.tenantId).eq('kind', 'TERMO').single<{ id: string }>()
  expect((await db().from('procedures').update({ consent_template_id: modelo!.id }).eq('id', rede.procedureId)).error).toBeNull()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  if (comAcessoFalso.length) await db().from('clients').update({ auth_id: null }).in('id', comAcessoFalso)
  const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
  const ids = [...new Set([...docs, ...(data ?? []).map(d => d.id as string)])]
  if (ids.length) expect(await apagarDocumentosEmitidos(ids)).toEqual([])
  await db().from('procedures').update({ consent_template_id: null }).eq('id', rede.procedureId)
  await recepcao?.limpar()
  await rede?.limpar()
})

test('A22: "Cadastrar" com a pergunta do lead sem resposta diz o que falta — e não grava', async ({ browser }) => {
  const nacional = `719${sufixo}0001`
  const { error } = await db().from('leads').insert({ tenant_id: rede.tenantId, name: nome('do lead'), phone: `55${nacional}`, crm_stage_id: etapa })
  expect(error).toBeNull()
  await como(browser, async p => {
    await preencher(p, { nome: nome('A22'), telefone: `(71) 9${sufixo}-0001` })
    await expect(p.getByText(/É a mesma pessoa do contato/)).toBeVisible()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.locator('[data-falta-responder]')).toContainText('Responda antes de cadastrar: é a mesma pessoa do contato')
  })
  expect(await fichasDe(nome('A22'))).toEqual([])
})

test('A23: "Unificar com a ficha de X" deixa a linha no Histórico da ficha', async ({ browser }) => {
  const telefone = `(71) 9${sufixo}-0002`
  const existente = await rede.criarCliente(`Unificar ${marca}`)
  expect((await db().from('clients').update({ phone: telefone, email: null }).eq('id', existente)).error).toBeNull()
  await como(browser, async p => {
    await preencher(p, { nome: nome('A23'), telefone })
    await p.locator('input[name="email"]').fill(`e2e-at7u${marca}@bellaris.invalid`)
    await p.getByRole('button', { name: /Unificar com a ficha de/ }).click()
    await expect(p).toHaveURL(new RegExp(`/admin/clients/${existente}`))
    await p.goto(`/admin/clients/${existente}?aba=historico`)
    await expect(p.locator('[data-evento="CLIENT_UNIFIED"]')).toContainText('Ficha unificada pelo cadastro')
    await expect(p.locator('[data-evento="CLIENT_UNIFIED"]')).toContainText('e-mail')
  })
})

test('A24: o CPF que trava o termo aparece na Visão geral da ficha, com o caminho', async ({ browser }) => {
  const cliente = await rede.criarCliente(`Sem CPF ${marca}`)
  expect((await db().from('clients').update({ document: null }).eq('id', cliente)).error).toBeNull()
  const { error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(`${diaEmQueAUnidadeAbre(2)}T10:00:00-03:00`).toISOString(),
  })
  expect(error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    const aviso = p.locator('[data-falta-no-cadastro]')
    await expect(aviso).toContainText('não pode ser assinado: falta no cadastro CPF')
    await expect(aviso.getByRole('link', { name: 'Completar o cadastro' })).toHaveAttribute('href', /aba=dados/)
  })
})

test('A25: a falta aparece na Visão geral; "Não compareceu" pergunta antes de gravar', async ({ browser }) => {
  const cliente = await rede.criarCliente(`Falta ${marca}`)
  const { data, error } = await db().from('appointments').insert([
    { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'NO_SHOW', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: haMinutosHoje(40) },
  ]).select('id, status')
  expect(error).toBeNull()
  const hoje = data!.find(a => a.status === 'SCHEDULED')!.id
  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.locator('[data-faltas-da-cliente]')).toContainText('Não compareceu 1 vez')

    await p.goto(`/${slug}/agenda`)
    await p.locator(`[data-agendamento="${hoje}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.getByRole('button', { name: 'Não compareceu' }).click()
    const pergunta = janela.locator('[data-confirmar-falta]')
    await expect(pergunta).toContainText('Marcar que')
    expect((await db().from('appointments').select('status').eq('id', hoje).single()).data?.status, 'ainda não gravou').toBe('SCHEDULED')
    await pergunta.getByRole('button', { name: 'Confirmar a falta' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', hoje).single()).data?.status).toBe('NO_SHOW')
  })
})

test('A26: "Pedir no portal" só para quem tem o app; sem ele, a tela diz antes por quê', async ({ browser }) => {
  const agendada = async (rotulo: string, hora: string) => {
    const cliente = await rede.criarCliente(rotulo)
    const { error } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(`${diaEmQueAUnidadeAbre(3)}T${hora}:00-03:00`).toISOString(),
    })
    expect(error).toBeNull()
    return cliente
  }
  const semApp = await agendada(`Sem app ${marca}`, '11:00')
  const comApp = await agendada(`Com app ${marca}`, '12:00')
  // O controle: a ficha COM login (o portal oferece). Um id qualquer basta para a tela; sai no fim.
  expect((await db().from('clients').update({ auth_id: randomUUID(), document: '11144477735' }).eq('id', comApp)).error).toBeNull()
  comAcessoFalso.push(comApp)
  expect((await db().from('clients').update({ document: '39053344705' }).eq('id', semApp)).error).toBeNull()

  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${semApp}?aba=documentos`)
    const termos = p.getByRole('region', { name: 'Termos e contratos' })
    await expect(termos.getByRole('link', { name: 'Colher assinatura' })).toBeVisible()
    await expect(termos.getByRole('button', { name: 'Pedir no portal' })).toHaveCount(0)
    await expect(termos.locator('[data-sem-portal]')).toContainText('Sem acesso ao app: colha na clínica, por link ou no papel.')

    await p.goto(`/${slug}/clients/${comApp}?aba=documentos`)
    await expect(p.getByRole('region', { name: 'Termos e contratos' }).getByRole('button', { name: 'Pedir no portal' }), 'controle: com o app, o botão está lá').toBeVisible()
  })
})
