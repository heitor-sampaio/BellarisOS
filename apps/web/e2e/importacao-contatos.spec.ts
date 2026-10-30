import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O importador de contatos (pedido do Heitor, 2026-10-13) — em Configurações →
 * Importações (a pedido dele, saiu de Clientes e de Oportunidades): um CSV, as colunas
 * relacionadas com os campos do sistema, a prévia com os erros, e a importação
 * em segundo plano.
 *  - Destino escolhido a cada importação: clientes (a ficha) ou contatos do CRM.
 *  - Quem já existe (CPF; sem CPF, telefone) só tem o VAZIO completado.
 *  - Sem acesso ao portal criado, e sem evento de domínio (uma planilha não pode
 *    virar mil mensagens de boas-vindas).
 *  - Oportunidade no funil, opcional — e importar de novo não a duplica.
 *  - O relatório de erros se baixa.
 *  - Os campos da oportunidade (origem, valor, etapa, responsável, procedimento,
 *    UTM…) e, no cliente, a unidade e a situação por linha (2026-10-13, "quanto
 *    mais completa, melhor").
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
let etapa2: string
let unidadeNorte: string
const NORTE = `${PREFIXO} Norte ${marca}`
/** Membro do CRM com "só os meus": não escolhe o responsável de ninguém. */
let soOsMeus: MembroDeTeste
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
  const e2 = await db().from('crm_stages').insert({ tenant_id: outra.tenantId, funnel_id: funil, name: 'Qualificados', position: 1 }).select('id').single<{ id: string }>()
  etapa2 = e2.data!.id
  // A segunda unidade: a planilha diz em qual unidade está cada cliente.
  const un = await db().from('branches').insert({ tenant_id: outra.tenantId, name: NORTE, slug: `e2e-norte-${marca}` }).select('id').single<{ id: string }>()
  expect(un.error).toBeNull()
  unidadeNorte = un.data!.id
  soOsMeus = await criarMembro(`impo${marca}`, { tenant: outra.tenantId, rotulo: 'SDR só os meus', permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }] })
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
    if (ls?.length) {
      await b.from('lead_events').delete().in('lead_id', ls.map(l => l.id))
      await b.from('lead_procedures').delete().in('lead_id', ls.map(l => l.id))
      await b.from('leads').delete().in('id', ls.map(l => l.id))
    }
    await b.from('contacts').delete().eq('tenant_id', t)
    await b.from('crm_stages').delete().eq('tenant_id', t)
    await b.from('crm_funnels').delete().eq('tenant_id', t)
    await b.from('crm_quadro_sinais').delete().eq('tenant_id', t)
    await b.from('importacoes').delete().eq('tenant_id', t)
    await b.from('domain_events').delete().eq('tenant_id', t)
    const { data: cs } = await b.from('clients').select('id').eq('tenant_id', t)
    if (cs?.length) { await b.from('loyalty_accounts').delete().in('client_id', cs.map(x => x.id)); await b.from('clients').delete().in('id', cs.map(x => x.id)) }
    if (unidadeNorte) await b.from('branches').delete().eq('id', unidadeNorte)
  }
  await admin?.limpar(); await soVe?.limpar(); await soCrm?.limpar(); await soOsMeus?.limpar()
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
  await p.goto('/admin/settings?tab=importacoes')
  await expect(p.getByRole('link', { name: 'Importações', exact: true })).toBeVisible()
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
    await p.getByLabel('Unidade', { exact: true }).selectOption({ label: unidadeNome })
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
      await p.getByLabel('Criar oportunidade no funil').check()
      await p.getByLabel('Etapa', { exact: true }).selectOption(etapa)
      await p.getByRole('button', { name: 'Continuar', exact: true }).click()
      await expect(p.getByLabel('Campo da coluna WhatsApp')).toHaveValue('phone')
      await p.getByRole('button', { name: 'Continuar', exact: true }).click()
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
    const r = await chamarAcao(p, 'actions/importacao.ts', 'importarContatos', '/admin/settings', [{
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
    await p.getByLabel('Criar oportunidade no funil').check()
    await p.getByLabel('Etapa', { exact: true }).selectOption(etapa)
    await p.getByLabel('Responsável', { exact: true }).selectOption({ label: 'Sem responsável' })
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
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

// D-10 (decisão do Heitor, frente de cadastro de 2026-10-29): (a) a linha que
// só tem e-mail entra como contato; (b) o telefone repetido JUNTA as tags e a
// origem à pessoa que já existe, sem trocar os outros campos.
test('contatos: a linha só com e-mail entra, e o telefone repetido junta tags e origem à pessoa', async ({ browser }) => {
  const s4 = sufixo.slice(-4)
  const emailSo = `e2e-so-email-${marca}@bellaris.invalid`
  const nome = `email-e-repetido-${marca}.csv`
  const arquivo = Buffer.from([
    'Nome;WhatsApp;Email;Tags;Origem',
    `${PREFIXO} Lia ${marca};(21) 96666-${s4};;vip;Instagram`,
    `${PREFIXO} Lia de novo ${marca};(21) 96666-${s4};lia-${marca}@bellaris.invalid;botox;Indicação`,
    `${PREFIXO} Só Email ${marca};;${emailSo};feira;Evento`,
  ].join('\n'), 'utf-8')
  await como(browser, admin, async p => {
    await abrirArquivo(p, nome, arquivo)
    await p.getByRole('button', { name: 'Como contatos do CRM', exact: true }).click()
    await p.getByLabel('Criar oportunidade no funil').check()
    await p.getByLabel('Etapa', { exact: true }).selectOption(etapa)
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(p.getByLabel('Campo da coluna Origem')).toHaveValue('op_origem')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await p.getByRole('button', { name: /Importar 3 linhas/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })
  expect(await importacao(nome)).toMatchObject({ com_erro: 0, novas: 2, completadas: 1, oportunidades: 2 })

  // (b) A Lia é UMA pessoa: o nome da primeira linha fica, o e-mail vazio é
  // completado, e as tags e as origens das duas linhas se juntam.
  const { data: lia } = await db().from('contacts').select('id, name, email, tags')
    .eq('tenant_id', outra.tenantId).overlaps('identifiers', [`552196666${s4}`])
  expect(lia).toHaveLength(1)
  expect(lia![0]!.name).toBe(`${PREFIXO} Lia ${marca}`)
  expect(lia![0]!.email).toBe(`lia-${marca}@bellaris.invalid`)
  expect([...(lia![0]!.tags as string[])].sort()).toEqual(['Indicação', 'Instagram', 'botox', 'vip'])
  const { count: leadsDaLia } = await db().from('leads').select('id', { count: 'exact', head: true }).eq('contato_id', lia![0]!.id)
  expect(leadsDaLia, 'a oportunidade aberta não se duplica').toBe(1)

  // (a) A pessoa só com e-mail, e a oportunidade nela (sem nascer outra pessoa).
  const { data: soEmail } = await db().from('contacts').select('id, phone, email, tags, identifiers')
    .eq('tenant_id', outra.tenantId).eq('email', emailSo)
  expect(soEmail).toHaveLength(1)
  expect(soEmail![0]).toMatchObject({ phone: null, identifiers: [] })
  expect([...(soEmail![0]!.tags as string[])].sort()).toEqual(['Evento', 'feira'])
  const { data: leadEmail } = await db().from('leads').select('contato_id, email').eq('tenant_id', outra.tenantId).eq('name', `${PREFIXO} Só Email ${marca}`)
  expect(leadEmail).toEqual([{ contato_id: soEmail![0]!.id, email: emailSo }])
})

test('a importação de clientes não se lê por quem só tem o CRM', async ({ browser }) => {
  const r = await importacao(`clientes-${marca}.csv`)
  await como(browser, soCrm, async p => {
    const resp = await chamarAcao(p, 'actions/importacao.ts', 'andamentoDaImportacao', '/admin/settings', [r!.id])
    expect(resp.texto).not.toContain('CPF inválido')
    expect(resp.texto).not.toContain('"status"')
    expect((await p.request.get(`/api/importacoes/${r!.id}/erros`)).status()).toBe(403)
  })
})

test('a etapa de um funil arquivado não recebe oportunidade', async ({ browser }) => {
  await como(browser, admin, async p => {
    const r = await chamarAcao(p, 'actions/importacao.ts', 'importarContatos', '/admin/settings', [{
      destino: 'contatos', nomeArquivo: `arquivado-${marca}.csv`, mapeamento: ['name', 'phone'],
      linhas: [['X', '21966660000']], oportunidade: { etapaId: etapaArquivada, responsavelId: null },
    }])
    expect(r.texto).toContain('Etapa do funil não encontrada')
  })
  expect(await importacao(`arquivado-${marca}.csv`)).toBeUndefined()
})

test('as importações moram em Configurações: os botões de Clientes e de Oportunidades saíram, e o caminho antigo leva à aba', async ({ browser }) => {
  await como(browser, admin, async p => {
    await p.goto('/admin/clients')
    await expect(p.getByRole('button', { name: 'Importar contatos' })).toHaveCount(0)
    await p.goto(`/admin/oportunidades?funil=${funil}`)
    await expect(p.getByRole('link', { name: /Importar/ })).toHaveCount(0)
    await p.goto('/admin/importar-contatos')
    await expect(p).toHaveURL(/\/admin\/settings\?tab=importacoes/)
  })
  // Quem só tem o CRM chega pelo menu: Configurações, só com a aba dele.
  await como(browser, soCrm, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.getByRole('navigation').getByText('Configurações (Tags e Importações)', { exact: true })).toBeVisible()
    await p.goto('/admin/settings')
    await expect(p.getByRole('link', { name: 'Importações', exact: true })).toBeVisible()
    await expect(p.getByRole('link', { name: 'Integrações', exact: true })).toHaveCount(0)
  })
})

test('contatos com os campos da oportunidade: e-mail e rede social na pessoa; origem, valor, etapa, responsável, procedimento, campanha e observações no card', async ({ browser }) => {
  const nome = `completo-${marca}.csv`
  const s4 = sufixo.slice(-4)
  const emailDoProf = `e2e-prof-imp${marca}@bellaris.invalid`
  const procedimento = `${PREFIXO} Proc imp${marca}`
  const arquivo = Buffer.from([
    'Nome,Celular,E-mail,Instagram,Origem,Valor,Etapa,Vendedor,Procedimento,utm_campaign,Obs',
    `${PREFIXO} Rica ${marca},(31) 99999-${s4},rica@exemplo.com,@rica,facebook,"R$ 1.500,00",qualificados,${emailDoProf},${procedimento},black-friday,Quer na sexta`,
    `${PREFIXO} Sem Etapa ${marca},(31) 98888-${s4},,,,,Perdidos,,,,`,
  ].join('\n'), 'utf-8')

  await como(browser, admin, async p => {
    await abrirArquivo(p, nome, arquivo)
    await p.getByRole('button', { name: 'Como contatos do CRM', exact: true }).click()
    await p.getByLabel('Criar oportunidade no funil').check()
    await p.getByLabel('Etapa', { exact: true }).selectOption(etapa)
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()

    await expect(p.getByLabel('Campo da coluna Instagram')).toHaveValue('social_media')
    await expect(p.getByLabel('Campo da coluna Origem')).toHaveValue('op_origem')
    await expect(p.getByLabel('Campo da coluna Vendedor')).toHaveValue('op_responsavel')
    await expect(p.getByLabel('Campo da coluna Etapa')).toHaveValue('op_etapa')
    await expect(p.getByLabel('Campo da coluna Procedimento')).toHaveValue('op_procedimentos')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()

    const previa = p.locator('[data-previa]')
    await expect(previa).toContainText('1 linha pronta')
    await expect(previa).toContainText('Etapa não encontrada no funil escolhido: "Perdidos"')
    await p.getByRole('button', { name: /Importar 1 linha/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })
  expect(await importacao(nome)).toMatchObject({ novas: 1, oportunidades: 1, com_erro: 1 })

  const { data: pessoa } = await db().from('contacts').select('id, email, social_media')
    .eq('tenant_id', outra.tenantId).eq('name', `${PREFIXO} Rica ${marca}`).single()
  expect(pessoa).toMatchObject({ email: 'rica@exemplo.com', social_media: '@rica' })
  const { data: lead } = await db().from('leads')
    .select('id, email, social_media, source, value, crm_stage_id, owner_id, notes, utm_campaign, contato_id')
    .eq('tenant_id', outra.tenantId).eq('name', `${PREFIXO} Rica ${marca}`).single()
  expect(lead).toMatchObject({
    email: 'rica@exemplo.com', social_media: '@rica', source: 'Meta Ads', crm_stage_id: etapa2,
    owner_id: outra.professionalId, notes: 'Quer na sexta', utm_campaign: 'black-friday', contato_id: pessoa!.id,
  })
  expect(Number(lead!.value)).toBe(1500)
  const { data: procs } = await db().from('lead_procedures').select('procedure_id').eq('lead_id', lead!.id)
  expect(procs).toEqual([{ procedure_id: outra.procedureId }])
})

test('clientes com a unidade e a situação de cada linha', async ({ browser }) => {
  const nome = `unidades-${marca}.csv`
  const s4 = sufixo.slice(-4)
  const arquivo = csv1252([
    'Nome;Celular;Unidade;Situação',
    `${PREFIXO} Nortista ${marca};(51) 99999-${s4};${NORTE.toLowerCase()};Inativo`,
    `${PREFIXO} Padrão ${marca};(51) 98888-${s4};;Ativo`,
    `${PREFIXO} Marciano ${marca};(51) 97777-${s4};Marte;`,
  ].join('\r\n'))

  await como(browser, admin, async p => {
    await abrirArquivo(p, nome, arquivo)
    await p.getByRole('button', { name: 'Como clientes', exact: true }).click()
    await p.getByLabel('Unidade', { exact: true }).selectOption({ label: unidadeNome })
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(p.getByLabel('Campo da coluna Unidade')).toHaveValue('unidade')
    await expect(p.getByLabel('Campo da coluna Situação')).toHaveValue('ativo')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    const previa = p.locator('[data-previa]')
    await expect(previa).toContainText('2 linhas prontas')
    await expect(previa).toContainText('Unidade não encontrada: "Marte"')
    await p.getByRole('button', { name: /Importar 2 linhas/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })

  const { data: nortista } = await db().from('clients').select('branch_id, is_active, tags')
    .eq('tenant_id', outra.tenantId).eq('name', `${PREFIXO} Nortista ${marca}`).single()
  expect(nortista).toMatchObject({ branch_id: unidadeNorte, is_active: false })
  expect(nortista!.tags).toContain(`Unidade: ${NORTE}`)
  const { data: padrao } = await db().from('clients').select('branch_id, is_active, tags')
    .eq('tenant_id', outra.tenantId).eq('name', `${PREFIXO} Padrão ${marca}`).single()
  expect(padrao).toMatchObject({ branch_id: outra.branchId, is_active: true })
  expect(padrao!.tags).toContain(`Unidade: ${unidadeNome}`)
})

test('a coluna de responsável pede o "todos" do CRM (o "só os meus" não distribui leads)', async ({ browser }) => {
  await como(browser, soOsMeus, async p => {
    const r = await chamarAcao(p, 'actions/importacao.ts', 'importarContatos', '/admin/settings', [{
      destino: 'contatos', nomeArquivo: `distribui-${marca}.csv`, mapeamento: ['name', 'phone', 'op_responsavel'],
      linhas: [['X', '21955550000', `e2e-prof-imp${marca}@bellaris.invalid`]], oportunidade: { etapaId: etapa },
    }])
    expect(r.texto).toContain('Seu cargo não define o responsável de outra pessoa')
  })
  expect(await importacao(`distribui-${marca}.csv`)).toBeUndefined()
})
