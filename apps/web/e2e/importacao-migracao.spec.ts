import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A migração pela planilha (F35, a 8ª simulação, 2026-11-06). A Lúcia trouxe
 * 33 linhas de 5 anos de clínica:
 *  - D2 (princípio 2: só se recusa o impossível): a Isabela, com o CPF
 *    123.456.789-00, sumiu inteira. Agora entra SEM o CPF, e o resultado diz
 *    "Isabela: CPF inválido…: importada sem o CPF". Sem nome, recusa.
 *  - A5: a coluna do responsável legal; a menor sem ele é avisada no resultado.
 *  - A6: o resultado lista as recusadas e as importadas com aviso, o CSV traz
 *    as duas, e a importação fica no histórico da aba.
 *  - Decisão 1 (c) do Heitor ("concordo"): "cliente desde" (a ficha de antes
 *    do mês não conta como cliente nova — A7), "última visita" (alimenta o
 *    "Reativar clientes", sem inventar atendimento) e "pacote: procedimento;
 *    total; usadas" (cria o pacote trazido de fora — A8).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let unidadeNome = ''
const PROC = `${PREFIXO} Limpeza mig ${marca}`
const sufixo = String(Date.now()).slice(-6)
const fone = (i: number) => `(85) 9${i}${sufixo.slice(0, 3)}-${sufixo.slice(3, 6)}${i}`
const nome = (n: string) => `${PREFIXO} ${n} ${marca}`
/** dd/mm/aaaa de N dias atrás, no fuso de Brasília. */
const diasAtras = (d: number) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - d * 86_400_000))
const iso = (d: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - d * 86_400_000))
const ARQUIVO = `migracao-${marca}.csv`

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`mig${marca}`)
  unidadeNome = (await db().from('branches').select('name').eq('id', rede.branchId).single()).data!.name as string
  expect((await db().from('procedures').update({ name: PROC, price: 150 }).eq('id', rede.procedureId)).error).toBeNull()
  dona = await criarMembro(`migd${marca}`, { tenant: rede.tenantId, rotulo: 'Dona', permissoes: [
    { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
  ] })
})
test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const ficha = async (n: string) => (await db().from('clients')
  .select('id, name, document, birth_date, cliente_desde, ultima_visita_antes, responsavel_nome, responsavel_parentesco')
  .eq('tenant_id', rede.tenantId).eq('name', nome(n)).maybeSingle()).data

test('a planilha da migração: o CPF ruim não derruba a ficha, as datas de antes e o pacote entram, e o resultado diz tudo', async ({ browser }) => {
  const csv = [
    'Nome;Celular;CPF;Nascimento;Cliente desde;Última visita;Pacote;Responsável legal;Parentesco',
    `${nome('Isabela')};${fone(1)};123.456.789-00;10/02/1995;03/2021;${diasAtras(120)};;;`,
    `${nome('Tatiana')};${fone(2)};;10/03/2011;2024;;;;`,
    `${nome('Camila')};${fone(3)};;;01/2020;${diasAtras(20)};"${PROC}; 10; 7; 1500";;`,
    `${nome('Lara')};${fone(4)};;12/05/2012;;;;Marta Lima;Mãe`,
    `;${fone(5)};;;;;;;`,
  ].join('\r\n')

  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=importacoes')
    await p.getByLabel('Arquivo CSV').setInputFiles({ name: ARQUIVO, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') })
    await p.getByLabel('Unidade', { exact: true }).selectOption({ label: unidadeNome })
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    // As colunas da migração são sugeridas pelo cabeçalho.
    await expect(p.getByLabel('Campo da coluna Cliente desde')).toHaveValue('cliente_desde')
    await expect(p.getByLabel('Campo da coluna Última visita')).toHaveValue('ultima_visita')
    await expect(p.getByLabel('Campo da coluna Pacote')).toHaveValue('pacote')
    await expect(p.getByLabel('Campo da coluna Responsável legal')).toHaveValue('responsavel_nome')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()

    // A prévia: 4 entram (1 com aviso de CPF, 1 menor sem responsável), 1 recusada.
    const previa = p.locator('[data-previa]')
    await expect(previa).toContainText('4 linhas prontas')
    await expect(previa).toContainText('1 recusada')
    await expect(previa.locator('[data-importadas-com-aviso]')).toContainText(`${nome('Isabela')}: CPF inválido ("123.456.789-00"): importada sem o CPF.`)
    await expect(previa.locator('[data-importadas-com-aviso]')).toContainText(`${nome('Tatiana')}: Menor de idade (15 anos) sem responsável legal`)
    await p.getByRole('button', { name: /Importar 4 linhas/ }).click()

    const resultado = p.locator('[data-importacao]')
    await expect(resultado).toContainText('Concluída', { timeout: 60_000 })
    await expect(resultado).toContainText('4 novos')
    await expect(resultado).toContainText('1 recusada')
    await expect(resultado.locator('[data-importadas-com-aviso]')).toContainText(`${nome('Isabela')}: CPF inválido`)
    await expect(resultado.locator('[data-importadas-com-aviso]')).toContainText(`${nome('Tatiana')}: Menor de idade (15 anos), sem responsável legal`)
    await expect(resultado.locator('[data-linhas-recusadas]')).toContainText('Nome vazio')

    // A6: o CSV traz as recusadas e as importadas com aviso.
    const { data: imp } = await db().from('importacoes').select('id').eq('tenant_id', rede.tenantId).eq('nome_arquivo', ARQUIVO).single()
    const r = await p.request.get(`/api/importacoes/${imp!.id}/erros`)
    expect(r.status()).toBe(200)
    const texto = await r.text()
    expect(texto).toContain('Linha;Nome;Situação;Motivo')
    expect(texto).toContain(`${nome('Isabela')};Importada com aviso;"CPF inválido`)
    expect(texto).toContain(';Recusada;Nome vazio.')

    // A6: e ela fica no histórico da aba (volta ao passo 1 com a lista).
    await p.goto('/admin/settings?tab=importacoes')
    const anterior = p.locator('[data-importacao-anterior]', { hasText: ARQUIVO })
    await expect(anterior).toContainText('4 novos')
    await expect(anterior).toContainText('2 com aviso')
    await expect(anterior).toContainText('1 recusada')
    await expect(anterior.getByRole('link', { name: /Baixar o relatório/ })).toBeVisible()
  })

  // A Isabela entrou, sem o CPF, com o resto.
  const isabela = await ficha('Isabela')
  expect(isabela).toMatchObject({ document: null, cliente_desde: '2021-03-01', ultima_visita_antes: iso(120) })
  expect(String(isabela!.birth_date)).toContain('1995-02-10')
  // A5: a menor com o responsável da planilha.
  expect(await ficha('Lara')).toMatchObject({ responsavel_nome: 'Marta Lima', responsavel_parentesco: 'Mãe' })
  // A8: o pacote de antes da Camila — 7 de 10 usadas antes do sistema, R$ 150 a sessão.
  const camila = await ficha('Camila')
  const { data: pacotes } = await db().from('client_packages')
    .select('de_fora, price, valor_referencia, usadas_antes, total_sessions, used_sessions, package_sessions(status, preco)').eq('client_id', camila!.id)
  expect(pacotes).toHaveLength(1)
  expect(pacotes![0]).toMatchObject({ de_fora: true, price: null, usadas_antes: 7, total_sessions: 10, used_sessions: 7 })
  expect(Number(pacotes![0]!.valor_referencia)).toBe(1500)
  const sessoes = pacotes![0]!.package_sessions as { status: string; preco: number }[]
  expect(sessoes.filter(s => s.status === 'USED')).toHaveLength(7)
  expect(sessoes.every(s => Number(s.preco) === 150)).toBe(true)
  const { count: lancamentos } = await db().from('financial_transactions').select('id', { count: 'exact', head: true }).eq('client_id', camila!.id)
  expect(lancamentos).toBe(0)
})

test('importar de novo não traz o pacote duas vezes', async ({ browser }) => {
  const csv = ['Nome;Celular;Pacote', `${nome('Camila')};${fone(3)};"${PROC}; 10; 7; 1500"`].join('\r\n')
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=importacoes')
    await p.getByLabel('Arquivo CSV').setInputFiles({ name: `de-novo-${marca}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') })
    await p.getByLabel('Unidade', { exact: true }).selectOption({ label: unidadeNome })
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await p.getByRole('button', { name: /Importar 1 linha/ }).click()
    await expect(p.locator('[data-importacao]')).toContainText('Concluída', { timeout: 60_000 })
  })
  const camila = await ficha('Camila')
  const { count } = await db().from('client_packages').select('id', { count: 'exact', head: true }).eq('client_id', camila!.id)
  expect(count).toBe(1)
})

test('"cliente desde" de antes do mês não é cliente nova; a "última visita" de antes alimenta o "Reativar clientes"', async () => {
  const agora = new Date()
  const inicioDoMes = new Date(`${iso(0).slice(0, 8)}01T00:00:00-03:00`).toISOString()
  // A7: só a Lara (sem "cliente desde") é nova este mês; Isabela (2021), Tatiana (2024) e Camila (2020), não.
  const { data: nucleo, error } = await db().rpc('metrics_core', { p_tenant: rede.tenantId, p_branch_ids: null, p_from: inicioDoMes, p_to: agora.toISOString() })
  expect(error).toBeNull()
  expect(Number((nucleo as { new_clients: number }[])[0]!.new_clients)).toBe(1)
  const { data: serie } = await db().rpc('metrics_new_clients_series', { p_tenant: rede.tenantId, p_branch_ids: null, p_from: inicioDoMes, p_to: agora.toISOString(), p_granularity: 'month' })
  expect((serie as { count: number }[]).reduce((s, x) => s + Number(x.count), 0)).toBe(1)

  // O "Reativar": a Isabela (última visita há 120 dias, antes do sistema) sumiu;
  // a Camila (há 20 dias) não; a Tatiana (cliente desde 2024, sem visita) sumiu.
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: reativar, error: e2 } = await db().rpc('metrics_clientes_para_reativar_rede', { p_tenant: rede.tenantId, p_desde: desde, p_limite: 50 })
  expect(e2).toBeNull()
  const r = reativar as { total: number; lista: { name: string; ultima_visita: string | null; antes_do_sistema: boolean }[]; recentes_sem_visita: number }
  const nomes = r.lista.map(x => x.name)
  expect(nomes).toContain(nome('Isabela'))
  expect(nomes).toContain(nome('Tatiana'))
  expect(nomes).not.toContain(nome('Camila'))
  const isabela = r.lista.find(x => x.name === nome('Isabela'))!
  expect(isabela.antes_do_sistema).toBe(true)
  expect(isabela.ultima_visita?.slice(0, 10)).toBe(iso(120))
  // Só a Lara é cadastrada nos 90 dias sem visita (as outras são clientes de antes).
  expect(r.recentes_sem_visita).toBe(1)
})
