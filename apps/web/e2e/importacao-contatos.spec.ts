import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O importador de contatos (pedido do Heitor, 2026-10-13): um CSV, as colunas
 * relacionadas com os campos do sistema, a prévia com os erros, e a importação
 * em segundo plano.
 *  - Destino escolhido a cada importação: clientes (a ficha) ou contatos do CRM.
 *  - Quem já existe (CPF; sem CPF, telefone) só tem o VAZIO completado.
 *  - Sem acesso ao portal criado, e sem evento de domínio (uma planilha não pode
 *    virar mil mensagens de boas-vindas).
 *  - Oportunidade no funil, opcional — e importar de novo não a duplica.
 *  - O relatório de erros se baixa.
 *
 * Numa rede `[e2e]` própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let admin: MembroDeTeste
let soVe: MembroDeTeste
/** Só o CRM, sem clientes: a SDR que importa uma lista de leads. */
let soCrm: MembroDeTeste
let etapaArquivada: string
let unidadeNome: string
let funil: string
let etapa: string
const sufixo = String(Date.now()).slice(-7)
const FONE_ANA = `48 9${sufixo.slice(0, 4)}-${sufixo.slice(-4)}`
const FONE_ANA_DIG = `55489${sufixo}`
const CPF_ANA = '52998224725'
let anaId: string

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`imp${marca}`)
  unidadeNome = (await db().from('branches').select('name').eq('id', outra.branchId).single()).data!.name as string
  admin = await criarMembro(`imp${marca}`, { tenant: outra.tenantId, rotulo: 'Recepção', permissoes: [
    { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
  ] })
  soVe = await criarMembro(`impv${marca}`, { tenant: outra.tenantId, rotulo: 'Só vê', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  soCrm = await criarMembro(`impc${marca}`, { tenant: outra.tenantId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
  const f = await db().from('crm_funnels').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  funil = f.data!.id
  const e = await db().from('crm_stages').insert({ tenant_id: outra.tenantId, funnel_id: funil, name: 'Importados', position: 0 }).select('id').single<{ id: string }>()
  etapa = e.data!.id
  // Um funil arquivado: a etapa dele não recebe oportunidade (some do quadro).
  const fa = await db().from('crm_funnels').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Arquivado ${marca}`, archived_at: new Date().toISOString() }).select('id').single<{ id: string }>()
  const ea = await db().from('crm_stages').insert({ tenant_id: outra.tenantId, funnel_id: fa.data!.id, name: 'Velha', position: 0 }).select('id').single<{ id: string }>()
  etapaArquivada = ea.data!.id
  // Ana já é cliente, sem e-mail: a planilha só completa o vazio.
  const c = await db().from('clients').insert({
    tenant_id: outra.tenantId, branch_id: outra.branchId, name: `${PREFIXO} Ana Original ${marca}`,
    phone: FONE_ANA_DIG, document: CPF_ANA, tags: ['antiga'], is_active: true,
  }).select('id').single<{ id: string }>()
  expect(c.error).toBeNull()
  anaId = c.data!.id
})
test.afterAll(async () => {
  const b = db()
  if (outra) {
    const t = outra.tenantId
    const { data: ls } = await b.from('leads').select('id').eq('tenant_id', t)
    if (ls?.length) { await b.from('lead_events').delete().in('lead_id', ls.map(l => l.id)); await b.from('leads').delete().in('id', ls.map(l => l.id)) }
    await b.from('contacts').delete().eq('tenant_id', t)
    await b.from('crm_stages').delete().eq('tenant_id', t)
    await b.from('crm_funnels').delete().eq('tenant_id', t)
    await b.from('crm_quadro_sinais').delete().eq('tenant_id', t)
    await b.from('importacoes').delete().eq('tenant_id', t)
    await b.from('domain_events').delete().eq('tenant_id', t)
    const { data: cs } = await b.from('clients').select('id').eq('tenant_id', t)
    if (cs?.length) { await b.from('loyalty_accounts').delete().in('client_id', cs.map(x => x.id)); await b.from('clients').delete().in('id', cs.map(x => x.id)) }
  }
  await admin?.limpar(); await soVe?.limpar(); await soCrm?.limpar()
  await outra?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O CSV como o Excel brasileiro salva: `;` e Windows-1252. */
function csv1252(texto: string): Buffer {
  // Os acentos do português cabem num byte só em 1252 (= latin1 nestes caracteres).
  return Buffer.from(texto, 'latin1')
}

async function abrirArquivo(p: Page, nome: string, conteudo: Buffer) {
  await p.goto('/admin/importar-contatos')
  await expect(p.getByRole('heading', { name: 'Importar contatos' })).toBeVisible()
  await p.getByLabel('Arquivo CSV').setInputFiles({ name: nome, mimeType: 'text/csv', buffer: conteudo })
}

const importacao = async (nome: string) => (await db().from('importacoes')
  .select('id, status, total, novas, completadas, sem_mudanca, com_erro, oportunidades, erros')
  .eq('tenant_id', outra.tenantId).eq('nome_arquivo', nome).order('criada_em', { ascending: false }).limit(1)).data?.[0]

test('importar como clientes: completa o vazio de quem existe, cria o novo e relata os erros', async ({ browser }) => {
  const nome = `clientes-${marca}.csv`
  const arquivo = csv1252([
    'Nome;Celular;CPF;E-mail;Data de nascimento;Tags',
    `Ana da Planilha;${FONE_ANA};529.982.247-25;ana@exemplo.com;15/03/1990;vip`,
    `${PREFIXO} Conceição ${marca};(47) 98888-${sufixo.slice(-4)};168.995.350-09;;05/01/1985;botox, retorno`,
    `Carla;(47) 97777-0000;111.111.111-11;;;`,
    `${PREFIXO} Conceição de novo ${marca};(47) 96666-0000;168.995.350-09;;;`,
  ].join('\r\n'))

  await como(browser, admin, async p => {
    await abrirArquivo(p, nome, arquivo)
    await p.getByRole('button', { name: 'Como clientes', exact: true }).click()
    await p.getByLabel('Unidade').selectOption({ label: unidadeNome })
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()

    // As colunas sugeridas pelo cabeçalho.
    await expect(p.getByLabel('Campo da coluna Celular')).toHaveValue('phone')
    await expect(p.getByLabel('Campo da coluna Data de nascimento')).toHaveValue('birth_date')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()

    // A prévia: o que entra e o que tem erro, com o motivo.
    const previa = p.locator('[data-previa]')
    await expect(previa).toContainText('2 linhas prontas')
    await expect(previa).toContainText('2 com erro')
    await expect(previa).toContainText('CPF inválido')
    await expect(previa).toContainText('Repetida na planilha')
    await p.getByRole('button', { name: /Importar 2 linhas/ }).click()

    const andamento = p.locator('[data-importacao]')
    await expect(andamento).toContainText('Concluída', { timeout: 60_000 })
    await expect(andamento).toContainText('1 novo')
    await expect(andamento).toContainText('1 completado')
    await expect(andamento).toContainText('2 com erro')
    // A lista de clientes mostra quem entrou (o cache expira ao terminar).
    await p.goto('/admin/clients')
    await expect(p.getByText(`${PREFIXO} Conceição ${marca}`)).toBeVisible({ timeout: 15_000 })

    // O relatório de erros se baixa (e só com a sessão — api-sem-credencial).
    const r = await importacao(nome)
    const erros = await p.request.get(`/api/importacoes/${r!.id}/erros`)
    expect(erros.status()).toBe(200)
    expect(await erros.text()).toContain('CPF inválido')
  })

  // Ana: o nome e as tags que a clínica tinha ficam; o vazio (e-mail,
  // nascimento) foi completado; a tag nova se junta.
  const { data: ana } = await db().from('clients').select('name, email, birth_date, tags, auth_id').eq('id', anaId).single()
  expect(ana).toMatchObject({ name: `${PREFIXO} Ana Original ${marca}`, email: 'ana@exemplo.com', auth_id: null })
  expect(String(ana!.birth_date)).toContain('1990-03-15')
  expect([...(ana!.tags as string[])].sort()).toEqual(['antiga', 'vip'])

  // A nova: com a unidade (a tag é por onde a lista filtra), a acentuação
  // certa, a conta de fidelidade — e sem acesso ao portal.
  const { data: nova } = await db().from('clients').select('id, name, phone, branch_id, tags, auth_id')
    .eq('tenant_id', outra.tenantId).eq('document', '16899535009').single()
  expect(nova).toMatchObject({ name: `${PREFIXO} Conceição ${marca}`, branch_id: outra.branchId, auth_id: null })
  expect(nova!.tags).toEqual(expect.arrayContaining(['botox', 'retorno', `Unidade: ${unidadeNome}`]))
  const { count: contas } = await db().from('loyalty_accounts').select('client_id', { count: 'exact', head: true }).eq('client_id', nova!.id)
  expect(contas).toBe(1)

  // Nenhum evento: a automação de "cliente cadastrado" não pode disparar.
  const { count: eventos } = await db().from('domain_events').select('id', { count: 'exact', head: true }).eq('tenant_id', outra.tenantId)
  expect(eventos).toBe(0)
})

test('importar como contatos, com oportunidade no funil — e de novo não duplica', async ({ browser }) => {
  const nome = `leads-${marca}.csv`
  const arquivo = Buffer.from([
    'Nome,WhatsApp,Tags',
    `${PREFIXO} Lead Um ${marca},(21) 99999-${sufixo.slice(-4)},evento`,
    `${PREFIXO} Lead Dois ${marca},(21) 98888-${sufixo.slice(-4)},`,
  ].join('\n'), 'utf-8')

  for (const vez of [1, 2]) {
    await como(browser, admin, async p => {
      await abrirArquivo(p, nome, arquivo)
      await p.getByRole('button', { name: 'Como contatos do CRM', exact: true }).click()
      await p.getByRole('button', { name: 'Continuar', exact: true }).click()
      await expect(p.getByLabel('Campo da coluna WhatsApp')).toHaveValue('phone')
      await p.getByRole('button', { name: 'Continuar', exact: true }).click()
      await p.getByLabel('Criar oportunidade no funil').check()
      await p.getByLabel('Etapa').selectOption(etapa)
      await p.getByRole('button', { name: /Importar 2 linhas/ }).click()
      await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
    })
    const r = await importacao(nome)
    expect(r).toMatchObject(vez === 1
      ? { novas: 2, oportunidades: 2, com_erro: 0 }
      : { novas: 0, sem_mudanca: 2, oportunidades: 0, com_erro: 0 })
  }

  const { data: pessoas } = await db().from('contacts').select('name, phone, tags')
    .eq('tenant_id', outra.tenantId).like('name', `${PREFIXO} Lead%`).order('name')
  expect(pessoas).toEqual([
    { name: `${PREFIXO} Lead Dois ${marca}`, phone: `552198888${sufixo.slice(-4)}`, tags: [] },
    { name: `${PREFIXO} Lead Um ${marca}`, phone: `552199999${sufixo.slice(-4)}`, tags: ['evento'] },
  ])
  const { data: leads } = await db().from('leads').select('crm_stage_id, contato_id').eq('tenant_id', outra.tenantId)
  expect(leads).toHaveLength(2)
  expect(leads!.every(l => l.crm_stage_id === etapa && l.contato_id)).toBe(true)
  const { count: eventos } = await db().from('domain_events').select('id', { count: 'exact', head: true }).eq('tenant_id', outra.tenantId)
  expect(eventos).toBe(0)
})

test('aparece em Ações em lote', async ({ browser }) => {
  await como(browser, admin, async p => {
    await p.goto('/admin/settings?tab=lotes')
    await expect(p.locator('[data-acao-em-lote]', { hasText: `clientes-${marca}.csv` })).toContainText('Importação de clientes')
    await expect(p.locator('[data-acao-em-lote]', { hasText: `clientes-${marca}.csv` })).toContainText('Concluída')
  })
})

test('quem só vê clientes não importa (nem pela action direta)', async ({ browser }) => {
  await como(browser, soVe, async p => {
    const r = await chamarAcao(p, 'actions/importacao.ts', 'importarContatos', '/admin/importar-contatos', [{
      destino: 'clientes', branchId: outra.branchId, nomeArquivo: `furo-${marca}.csv`,
      mapeamento: ['name', 'phone'], linhas: [['Furo', '48999990000']], oportunidade: null,
    }])
    expect(r.texto).not.toContain('importacaoId')
  })
  expect(await importacao(`furo-${marca}.csv`)).toBeUndefined()
})

test('quem só tem o CRM importa contatos; "Sem responsável" vale; e o contato sem o nono dígito é achado', async ({ browser }) => {
  // O WhatsApp guarda muito celular brasileiro SEM o nono dígito (12 dígitos).
  const s4 = sufixo.slice(-4)
  const guardado = `55217777${s4}`
  const { data: pessoa, error } = await db().from('contacts').insert({
    tenant_id: outra.tenantId, name: guardado, phone: guardado, identifiers: [guardado],
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const nome = `sem-nono-${marca}.csv`
  await como(browser, soCrm, async p => {
    await abrirArquivo(p, nome, Buffer.from(`Nome;Celular\n${PREFIXO} Mel ${marca};(21) 97777-${s4}\n`, 'utf-8'))
    // Só o destino que o cargo alcança.
    await expect(p.getByRole('button', { name: 'Como clientes', exact: true })).toHaveCount(0)
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await p.getByLabel('Criar oportunidade no funil').check()
    await p.getByLabel('Etapa').selectOption(etapa)
    await p.getByLabel('Responsável').selectOption({ label: 'Sem responsável' })
    await p.getByRole('button', { name: /Importar 1 linha/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })
  expect(await importacao(nome)).toMatchObject({ novas: 0, completadas: 1, oportunidades: 1 })
  // A MESMA pessoa: ganhou o nome, e nenhuma outra nasceu com o número de 13 dígitos.
  const { data: iguais } = await db().from('contacts').select('id, name')
    .eq('tenant_id', outra.tenantId).overlaps('identifiers', [guardado, `552197777${s4}`])
  expect(iguais).toEqual([{ id: pessoa!.id, name: `${PREFIXO} Mel ${marca}` }])
  const { data: lead } = await db().from('leads').select('contato_id, owner_id').eq('tenant_id', outra.tenantId).eq('name', `${PREFIXO} Mel ${marca}`).single()
  expect(lead).toEqual({ contato_id: pessoa!.id, owner_id: null })
})

test('a importação de clientes não se lê por quem só tem o CRM', async ({ browser }) => {
  const r = await importacao(`clientes-${marca}.csv`)
  await como(browser, soCrm, async p => {
    const resp = await chamarAcao(p, 'actions/importacao.ts', 'andamentoDaImportacao', '/admin/importar-contatos', [r!.id])
    expect(resp.texto).not.toContain('CPF inválido')
    expect(resp.texto).not.toContain('"status"')
    expect((await p.request.get(`/api/importacoes/${r!.id}/erros`)).status()).toBe(403)
  })
})

test('a etapa de um funil arquivado não recebe oportunidade', async ({ browser }) => {
  await como(browser, admin, async p => {
    const r = await chamarAcao(p, 'actions/importacao.ts', 'importarContatos', '/admin/importar-contatos', [{
      destino: 'contatos', nomeArquivo: `arquivado-${marca}.csv`, mapeamento: ['name', 'phone'],
      linhas: [['X', '21966660000']], oportunidade: { etapaId: etapaArquivada, responsavelId: null },
    }])
    expect(r.texto).toContain('Etapa do funil não encontrada')
  })
  expect(await importacao(`arquivado-${marca}.csv`)).toBeUndefined()
})
