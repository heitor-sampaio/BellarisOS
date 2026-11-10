import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Os atritos do CRM, das automações e das campanhas da 7ª simulação
 * (2026-11-05), pelas regras de sempre:
 * - A11: Enter no nome da etapa não gravava;
 * - A12: o editor de automação não avisava ao sair com alteração solta, e o
 *   "Salvar" só aparecia depois de mexer;
 * - A13: a lista de automações só tinha um círculo, sem "Rascunho";
 * - A14: as origens do lead eram uma lista fixa (princípio 1: a clínica
 *   cadastra as dela, com as de hoje como padrão);
 * - A15: o "Revisar" da campanha não mostrava o filtro do público;
 * - A16: a coluna "origem" do CSV não se mapeava (nos contatos) e a prévia
 *   dizia "a origem se junta";
 * - A17: a prévia não dizia que o e-mail da outra linha se perde;
 * - A18: o card com avaliação agendada não dizia "Agendado"; a venda não
 *   sugeria levar o card a Ganho (nenhum card anda sozinho — princípio 6);
 * - A19: a 1440 px, perder pelo quadro exigia rolar até a coluna Perdido;
 * - A20: não havia conversão por origem no Funil comercial;
 * - A21: o card seguia o nome antigo da ficha renomeada.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const fim = String(Date.now()).slice(-4)
let rede: OutraRede
let dona: MembroDeTeste
let funil = ''
const etapa: Record<'novo' | 'avaliacao' | 'ganho' | 'perdido', string> = { novo: '', avaliacao: '', ganho: '', perdido: '' }
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function lead(rotulo: string, campos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome(rotulo), phone: `5548${fim}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    crm_stage_id: etapa.novo, ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, `criar o lead ${rotulo}`).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`cr7${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cr7d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const { data: f } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'Vendas', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  funil = f!.id
  const etapas = [['novo', 'Novo', 'OPEN'], ['avaliacao', 'Avaliação', 'OPEN'], ['ganho', 'Fechado', 'WON'], ['perdido', 'Perdido', 'LOST']] as const
  for (const [i, [k, n, o]] of etapas.entries()) {
    const { data } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: funil, name: n, color: '#c34d6b', position: i, outcome: o }).select('id').single<{ id: string }>()
    etapa[k] = data!.id
  }
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await dona?.limpar()
  await rede?.limpar()
})

test('A11: Enter no nome da etapa grava — e diz que gravou', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades')
    await p.getByTitle('Configurar funis').click()
    const campo = p.getByLabel('Nome da etapa Avaliação')
    await campo.fill('Avaliação marcada')
    await campo.press('Enter')
    await expect(p.locator('dialog[open] [data-etapa-salva]')).toContainText('Salvo')
  })
  await expect.poll(async () => (await db().from('crm_stages').select('name').eq('id', etapa.avaliacao).single()).data?.name).toBe('Avaliação marcada')
  await db().from('crm_stages').update({ name: 'Avaliação' }).eq('id', etapa.avaliacao)
})

test('A12/A13: a lista diz "Rascunho"; o editor tem o "Salvar" à vista e avisa ao sair com alteração solta', async ({ browser }) => {
  const { data, error } = await db().from('automations').insert({ tenant_id: rede.tenantId, nome: nome('Automação A12') }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/automacoes')
    const cartao = p.getByRole('link', { name: new RegExp(`Automação A12 ${marca}`) })
    await expect(cartao.locator('[data-situacao-da-automacao]')).toHaveText('Rascunho')

    await p.goto(`/admin/automacoes/${data!.id}`)
    const salvar = p.getByRole('button', { name: 'Salvar', exact: true })
    await expect(salvar, 'à vista, mesmo sem nada a salvar').toBeVisible()
    await expect(salvar).toBeDisabled()
    await p.getByLabel('Nome da automação').fill(nome('Automação A12 nova'))
    await expect(salvar).toBeEnabled()
    await p.locator('.auto-barra').getByRole('link', { name: 'Automações' }).click()
    const aviso = p.locator('[data-sair-sem-salvar]')
    await expect(aviso).toContainText('alterações não salvas')
    await expect(p).toHaveURL(new RegExp(`/admin/automacoes/${data!.id}`))
    await aviso.getByRole('button', { name: 'Continuar editando' }).click()
    await expect(p.getByLabel('Nome da automação')).toHaveValue(nome('Automação A12 nova'))
  })
})

test('A14: a clínica nasce com as origens de sempre e cadastra a dela, que o "Novo lead" oferece', async ({ browser }) => {
  const { data: padrao } = await db().from('crm_origens').select('nome').eq('tenant_id', rede.tenantId)
  expect((padrao ?? []).map(o => o.nome)).toEqual(expect.arrayContaining(['Meta Ads', 'Instagram', 'Indicação', 'Outro']))
  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades')
    await p.getByTitle('Configurar funis').click()
    const secao = p.locator('dialog[open] [data-origens-do-lead]')
    await expect(secao).toContainText('Meta Ads')
    await secao.getByLabel('Nova origem').fill('Feira de noivas')
    await secao.getByRole('button', { name: 'Adicionar origem' }).click()
    await expect(secao.getByRole('button', { name: 'Feira de noivas' })).toBeVisible()
    await p.keyboard.press('Escape')

    await p.reload()
    await p.getByRole('button', { name: 'Novo lead' }).click()
    await expect(p.locator('dialog[open] select[name="source"] option', { hasText: 'Feira de noivas' })).toHaveCount(1)
  })
})

test('A15: o "Revisar" da campanha mostra os filtros do público', async ({ browser }) => {
  const { data, error } = await db().from('notification_campaigns').insert({
    tenant_id: rede.tenantId, name: nome('Campanha A15'), type: 'IMMEDIATE', title: 'Oi', body: 'Novidade',
    audience_rules: { tags: ['VIP'], has_app_account: true },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto(`/admin/notificacoes/${data!.id}/editar`)
    for (let i = 0; i < 3; i++) await p.getByRole('button', { name: /Próximo/ }).click()
    const filtros = p.locator('[data-filtros-do-publico]')
    await expect(filtros).toContainText('Tags: VIP')
    await expect(filtros).toContainText('Só quem tem o app')
  })
})

test('A16/A17: a origem do CSV se mapeia nos contatos, a prévia diz como entra e diz o e-mail que se perde', async ({ browser }) => {
  const fone = `(48) 9${fim}-7777`
  const conteudo = [
    'Nome,WhatsApp,E-mail,Origem',
    `${nome('Marta')},${fone},marta-${marca}@exemplo.com,facebook`,
    `${nome('Joana')},${fone},joana-${marca}@exemplo.com,Feira de noivas`,
  ].join('\n')
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=importacoes')
    await expect(async () => {
      await p.getByLabel('Arquivo CSV').setInputFiles({ name: `origem-${marca}.csv`, mimeType: 'text/csv', buffer: Buffer.from(conteudo, 'utf-8') })
      await expect(p.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled({ timeout: 1500 })
    }).toPass()
    await p.getByRole('button', { name: 'Como contatos do CRM', exact: true }).click()
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(p.getByLabel('Campo da coluna Origem')).toHaveValue('op_origem')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    const previa = p.locator('[data-previa]')
    await expect(previa.locator('[data-origens-da-planilha]')).toContainText('facebook → Meta Ads')
    await expect(previa.locator('[data-origens-da-planilha]')).toContainText('entra como tag da pessoa')
    await expect(previa).not.toContainText('a origem se juntam')
    await expect(previa).toContainText(`o e-mail desta linha (joana-${marca}@exemplo.com) não entra`)
  })
})

test('A18: o card diz "Agendado dd/mm hh:mm" e, depois da venda, sugere levar a Ganho (sem mover sozinho)', async ({ browser }) => {
  const agendada = await rede.criarCliente('Agendada A18')
  const dia = diaEmQueAUnidadeAbre(3)
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: agendada, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'COMMERCIAL', duration_min: 30, price: 0, scheduled_at: new Date(`${dia}T10:30:00-03:00`).toISOString(),
  })).error).toBeNull()
  const leadAgendado = await lead('Lead agendado A18', { client_id: agendada, crm_stage_id: etapa.avaliacao })

  const compradora = await rede.criarCliente('Compradora A18')
  // A oportunidade nasce um minuto antes: o `created_at` é o relógio do BANCO e
  // o `aceito_em` abaixo, o do runner — gravados com ~30 ms entre um e outro, a
  // diferença dos dois relógios bastava para a compra "vir antes" e a
  // sugestão não aparecer (completa de 10/11, F48).
  const leadComprou = await lead('Lead comprou A18', {
    client_id: compradora, crm_stage_id: etapa.avaliacao, created_at: new Date(Date.now() - 60_000).toISOString(),
  })
  expect((await db().from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: compradora, professional_id: rede.professionalId, status: 'ACCEPTED',
    name: 'Plano A18', aceito_em: new Date().toISOString(),
  })).error).toBeNull()

  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades')
    const [, m, d] = dia.split('-')
    await expect(p.locator(`[data-lead-id="${leadAgendado}"] [data-agendado-em]`)).toContainText(`Agendado ${d}/${m} 10:30`)
    const sugestao = p.locator(`[data-lead-id="${leadComprou}"] [data-sugere-ganho]`)
    await expect(sugestao).toContainText('Comprou Plano A18')
    expect((await db().from('leads').select('crm_stage_id').eq('id', leadComprou).single()).data?.crm_stage_id, 'nada se move sozinho').toBe(etapa.avaliacao)
    await sugestao.getByRole('button', { name: 'Mover para Fechado' }).click()
  })
  await expect.poll(async () => (await db().from('leads').select('crm_stage_id').eq('id', leadComprou).single()).data?.crm_stage_id).toBe(etapa.ganho)
})

test('A19: a 1440 px, perder pelo menu do card e pelo arraste, sem rolar até a coluna', async ({ browser }) => {
  const id = await lead('Lead perder A19')
  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades')
    const card = p.locator(`[data-lead-id="${id}"]`)
    // O menu do card (o clique também espera a tela hidratar).
    await card.getByTitle('Ações do lead').click()
    await card.getByRole('menuitem', { name: 'Marcar como perdido' }).click()
    await expect(p.getByRole('heading', { name: 'Por que perdeu?' })).toBeVisible()
    await p.getByRole('button', { name: 'Voltar' }).click()
    await expect(p.getByRole('heading', { name: 'Por que perdeu?' })).toHaveCount(0)

    // O arraste: o quadro mostra embaixo onde soltar o ganho e o perdido.
    const dt = await p.evaluateHandle(() => new DataTransfer())
    await card.dispatchEvent('dragstart', { dataTransfer: dt })
    const perdido = p.locator('[data-soltar-desfecho="LOST"]')
    await expect(perdido).toBeInViewport()
    await perdido.dispatchEvent('dragenter', { dataTransfer: dt })
    await perdido.dispatchEvent('drop', { dataTransfer: dt })
    await expect(p.getByRole('heading', { name: 'Por que perdeu?' })).toBeVisible()
  })
})

test('A20: o Funil comercial tem a conversão por origem', async ({ browser }) => {
  await lead('Insta 1 A20', { source: 'Instagram', crm_stage_id: etapa.ganho })
  await lead('Insta 2 A20', { source: 'Instagram' })
  await lead('Indicação A20', { source: 'Indicação' })
  await como(browser, dona, async p => {
    await p.goto('/admin/reports?tab=comercial')
    const tabela = p.locator('[data-conversao-por-origem]')
    const insta = tabela.getByRole('row', { name: /Instagram/ })
    await expect(insta).toContainText('50%')
    await expect(tabela.getByRole('row', { name: /Indicação/ })).toContainText('0%')
  })
})

test('A21: o card acompanha o nome da ficha ligada', async ({ browser }) => {
  const cliente = await rede.criarCliente('Lead 3 Cardoso')
  const id = await lead('Lead 3 Cardoso card', { client_id: cliente })
  const novo = nome('Patrícia Cardoso')
  await como(browser, dona, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=dados`)
    const campo = p.getByText('Nome *', { exact: true }).locator('xpath=following-sibling::input')
    await campo.fill(novo)
    await p.getByRole('button', { name: 'Salvar dados' }).click()
    await expect.poll(async () => (await db().from('clients').select('name').eq('id', cliente).single()).data?.name).toBe(novo)
  })
  await expect.poll(async () => (await db().from('leads').select('name').eq('id', id).single()).data?.name).toBe(novo)
  const { data: l } = await db().from('leads').select('contato_id').eq('id', id).single<{ contato_id: string }>()
  expect((await db().from('contacts').select('name').eq('id', l!.contato_id).single()).data?.name, 'a pessoa também').toBe(novo)
})
