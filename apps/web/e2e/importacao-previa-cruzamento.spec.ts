import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A prévia da importação diz o que vai ser FUNDIDO (A15 da 5ª simulação):
 * dizia "10 linhas prontas", e a "Renata Quintas" sumiu na Luana Prado pelo
 * telefone — só o resultado final dizia "1 completado"; e não dizia quem
 * entrava sem telefone. cli-07 (revisão do Heitor, 2026-11-02): a filha com o
 * telefone da mãe completava a ficha rápida da mãe sem perguntar. O Heitor,
 * 25/11, escolheu "Vem desmarcada, a não ser que o nome case": com o mesmo
 * telefone sem CPF e outro nome, "completar a ficha de Marlene" (e o "juntar"
 * com a linha anterior) vem desmarcada; marcada só quando o nome casa.
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let admin: MembroDeTeste
const fim = String(Date.now()).slice(-4)
const FONE_MARLENE = `(48) 9${fim}-1111`
const FONE_LUANA = `5551997${fim}22`
const CPF_ANA = '52998224725'
const CPF_FILHA = '11144477735'
const MARLENE = `${PREFIXO} Marlene ${marca}`
const ANA = `${PREFIXO} Ana ${marca}`
const LUANA = `${PREFIXO} Luana Prado ${marca}`
let marleneId = ''

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ic${marca}`)
  // As Importações são da rede toda: só a Admin da rede (o Heitor, 18/11:
  // "Configuração da rede toda só pela conta admin").
  admin = await criarMembro(`ic${marca}`, { tenant: rede.tenantId, rotulo: 'Recepção', donoDaRede: true, permissoes: [] })
  const m = await db().from('clients').insert({ tenant_id: rede.tenantId, branch_id: rede.branchId, name: MARLENE, phone: FONE_MARLENE, is_active: true, tags: [] })
    .select('id').single<{ id: string }>()
  expect(m.error).toBeNull()
  marleneId = m.data!.id
  expect((await db().from('clients').insert({ tenant_id: rede.tenantId, branch_id: rede.branchId, name: ANA, phone: '(48) 98888-0000', document: CPF_ANA, is_active: true, tags: [] })).error).toBeNull()
  expect((await db().from('contacts').insert({ tenant_id: rede.tenantId, name: LUANA, phone: FONE_LUANA, identifiers: [FONE_LUANA], tags: [] })).error).toBeNull()
})

test.afterAll(async () => {
  const b = db()
  const t = rede?.tenantId
  if (t) {
    await b.from('contacts').delete().eq('tenant_id', t)
    await b.from('importacoes').delete().eq('tenant_id', t)
    const { data: cs } = await b.from('clients').select('id').eq('tenant_id', t)
    if (cs?.length) { await b.from('loyalty_accounts').delete().in('client_id', cs.map(x => x.id)); await b.from('clients').delete().in('id', cs.map(x => x.id)) }
  }
  await admin?.limpar()
  await rede?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function ateAPrevia(p: Page, nome: string, conteudo: string, destino: 'Como clientes' | 'Como contatos do CRM') {
  await p.goto('/admin/settings?tab=importacoes')
  await expect(p.getByRole('link', { name: 'Importações', exact: true })).toBeVisible()
  // Repete até a hidratação: antes dela, o arquivo escolhido não chega ao estado.
  await expect(async () => {
    await p.getByLabel('Arquivo CSV').setInputFiles({ name: nome, mimeType: 'text/csv', buffer: Buffer.from(conteudo, 'utf-8') })
    await expect(p.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled({ timeout: 1500 })
  }).toPass()
  await p.getByRole('button', { name: destino, exact: true }).click()
  // A unidade é só a dos PACOTES de antes (pedido de 18/11): sem a coluna do pacote, não se pergunta.
  await expect(p.locator('#importar-unidade')).toHaveCount(0)
  await p.getByRole('button', { name: 'Continuar', exact: true }).click()
  await p.getByRole('button', { name: 'Continuar', exact: true }).click()
  return p.locator('[data-previa]')
}

test('cli-07 e A15: a prévia diz quem completa qual ficha, e "completar a ficha de Marlene" vem desmarcada (outro nome): a filha ganha a ficha dela', async ({ browser }) => {
  const nome = `cruzamento-${marca}.csv`
  const filha = `${PREFIXO} Filha da Marlene ${marca}`
  const conteudo = [
    'Nome,Celular,CPF',
    `${filha},${FONE_MARLENE},${CPF_FILHA}`,
    `Ana da Planilha,(47) 97777-${fim},${CPF_ANA}`,
    `${PREFIXO} Nova ${marca},(47) 96666-${fim},`,
  ].join('\n')
  await como(browser, admin, async p => {
    const previa = await ateAPrevia(p, nome, conteudo, 'Como clientes')
    await expect(previa).toContainText('3 linhas prontas')
    // O que vai ser fundido, antes de importar.
    await expect(previa).toContainText(`completa a ficha de ${ANA} (o mesmo CPF)`, { timeout: 15_000 })
    const completar = previa.getByRole('checkbox', { name: `Completar a ficha de ${MARLENE}` })
    // Outro nome no mesmo telefone sem CPF: vem desmarcada (o Heitor, 25/11).
    await expect(completar).not.toBeChecked()
    await expect(previa).toContainText(`vira uma ficha nova (com o mesmo telefone de ${MARLENE})`)
    await p.getByRole('button', { name: /Importar 3 linhas/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })
  // A filha ganhou a ficha dela; a da mãe ficou como estava.
  const { data: dela } = await db().from('clients').select('document, phone').eq('tenant_id', rede.tenantId).eq('name', filha).single()
  expect(dela).toMatchObject({ document: CPF_FILHA })
  const { data: mae } = await db().from('clients').select('name, document').eq('id', marleneId).single()
  expect(mae).toEqual({ name: MARLENE, document: null })
})

test('D4: duas fichas sem CPF no telefone, a linha completa a do mesmo nome (sem acento nem caixa), não a mais antiga', async ({ browser }) => {
  const fone = `(48) 9${fim}-4444`
  const edna = `${PREFIXO} Edna ${marca}`
  const filomena = `${PREFIXO} Filomena Sá ${marca}`
  // A Edna é a mais antiga do telefone; a Filomena, a do nome da linha.
  const e = await db().from('clients').insert({ tenant_id: rede.tenantId, branch_id: rede.branchId, name: edna, phone: fone, is_active: true, tags: [] })
    .select('id').single<{ id: string }>()
  expect(e.error).toBeNull()
  const f = await db().from('clients').insert({ tenant_id: rede.tenantId, branch_id: rede.branchId, name: filomena, phone: fone, is_active: true, tags: [] })
    .select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  const conteudo = [
    'Nome,Celular,E-mail',
    `${PREFIXO} FILOMENA SA ${marca.toUpperCase()},${fone},filomena-${marca}@exemplo.com`,
  ].join('\n')
  await como(browser, admin, async p => {
    const previa = await ateAPrevia(p, `mesmo-nome-${marca}.csv`, conteudo, 'Como clientes')
    await expect(previa).toContainText('1 linha pronta')
    // O nome casa (sem acento nem caixa): a caixa vem marcada, com a ficha do mesmo nome.
    await expect(previa.getByRole('checkbox', { name: `Completar a ficha de ${filomena}` })).toBeChecked({ timeout: 15_000 })
    await expect(previa.getByRole('checkbox', { name: `Completar a ficha de ${edna}` })).toHaveCount(0)
    await p.getByRole('button', { name: /Importar 1 linha/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })
  const { data: fichas } = await db().from('clients').select('id, name, email').eq('tenant_id', rede.tenantId).in('id', [e.data!.id, f.data!.id]).order('name')
  expect(fichas).toEqual([
    { id: e.data!.id, name: edna, email: null },
    { id: f.data!.id, name: filomena, email: `filomena-${marca}@exemplo.com` },
  ])
})

test('A15: nos contatos, a prévia diz quem junta pelo telefone e quem entra sem telefone', async ({ browser }) => {
  const conteudo = [
    'Nome,WhatsApp,E-mail',
    `Renata Quintas,(51) 997${fim}22,`,
    `${PREFIXO} Só e-mail ${marca},,so-email-${marca}@exemplo.com`,
  ].join('\n')
  await como(browser, admin, async p => {
    const previa = await ateAPrevia(p, `contatos-${marca}.csv`, conteudo, 'Como contatos do CRM')
    await expect(previa).toContainText('2 linhas prontas')
    await expect(previa).toContainText(`junta com ${LUANA} (o mesmo telefone)`, { timeout: 15_000 })
    await expect(previa).toContainText('1 sem telefone')
  })
})

test('A14: na ficha, o mesmo telefone com outro nome mostra os dois nomes, vem separada e deixa marcar para juntar', async ({ browser }) => {
  const foneA = `(47) 9${fim}-0001`
  const foneB = `(47) 9${fim}-0002`
  const bianca = `${PREFIXO} Bianca ${marca}`
  const karina = `${PREFIXO} Karina ${marca}`
  const clara = `${PREFIXO} Clara ${marca}`
  const clarinha = `${PREFIXO} Clarinha ${marca}`
  const conteudo = [
    'Nome,Celular,E-mail',
    `${bianca},${foneA},bianca-${marca}@exemplo.com`,
    `${karina},${foneA},karina-${marca}@exemplo.com`,
    `${clara},${foneB},`,
    `${clarinha},${foneB},clarinha-${marca}@exemplo.com`,
  ].join('\n')
  await como(browser, admin, async p => {
    const previa = await ateAPrevia(p, `mesmo-telefone-${marca}.csv`, conteudo, 'Como clientes')
    // Nenhuma é "repetida": são outros nomes.
    await expect(previa).toContainText('4 linhas prontas')
    await expect(previa).toContainText(`Linha 3 · ${karina} tem o mesmo telefone da linha 2 · ${bianca}`)
    const juntarKarina = previa.getByRole('checkbox', { name: `Juntar ${karina} com ${bianca} (linha 2)` })
    // Outro nome: vem desmarcada (o Heitor, 25/11: "Vem desmarcada, a não ser que o nome case").
    await expect(juntarKarina).not.toBeChecked()
    await expect(previa).toContainText(`${karina} vira uma ficha separada`)
    // A Clarinha também vem desmarcada; marcada, junta com a Clara (completa o que está em branco).
    const juntarClarinha = previa.getByRole('checkbox', { name: `Juntar ${clarinha} com ${clara} (linha 4)` })
    await expect(juntarClarinha).not.toBeChecked()
    await juntarClarinha.check()
    await expect(previa).toContainText(`junta com a ficha de ${clara}`)
    await p.getByRole('button', { name: /Importar 4 linhas/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })
  const { data: fichas } = await db().from('clients').select('name, email').eq('tenant_id', rede.tenantId)
    .in('name', [bianca, karina, clara, clarinha]).order('name')
  expect(fichas).toEqual([
    { name: bianca, email: `bianca-${marca}@exemplo.com` },
    { name: clara, email: `clarinha-${marca}@exemplo.com` },
    { name: karina, email: `karina-${marca}@exemplo.com` },
  ])
})

test('A14: no contato, o mesmo telefone com outro nome diz os dois nomes e qual fica', async ({ browser }) => {
  const fone = `(47) 9${fim}-0003`
  const conteudo = [
    'Nome,WhatsApp',
    `Bianca Planilha,${fone}`,
    `Karina Planilha,${fone}`,
  ].join('\n')
  await como(browser, admin, async p => {
    const previa = await ateAPrevia(p, `contatos-mesmo-telefone-${marca}.csv`, conteudo, 'Como contatos do CRM')
    await expect(previa).toContainText('Linha 3 · Karina Planilha junta com a linha 2 · Bianca Planilha (o mesmo telefone)')
    await expect(previa).toContainText('o nome que fica é Bianca Planilha')
    await expect(previa).toContainText('Duas pessoas no mesmo telefone? Importe como clientes')
  })
})
