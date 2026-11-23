import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Os atritos de setup e configuração da 12ª simulação (2026-11-10/11, a Helena
 * da Margarida e a Cláudia da Acácia), numa rede [e2e] própria:
 *
 * - A2: no cargo novo, o Relatórios ligado vinha sem nenhuma aba. Princípio
 *   3: o Relatórios em "Ver" pede as abas. (O alcance "só os meus" × "todos"
 *   que a A2 também tratava saiu do cargo: SM1, o Heitor, 2026-11-23.)
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cfg12${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cfg12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // A9: um preço, e nenhum custo (antes de qualquer tela abrir: a lista fica em cache).
  expect((await db().from('procedures').update({ price: 150 }).eq('id', rede.procedureId)).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

// Sem o "só os meus" (SM1, o Heitor, 2026-11-23): o cargo é módulo × nível, sem alcance a escolher.
test('A2: o cargo novo não tem alcance a escolher, e o Relatórios em "Ver" pede as abas', async ({ browser }) => {
  const rotulo = `${PREFIXO} Contadora ${marca}`
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await p.getByRole('button', { name: 'Novo' }).click()
    await p.getByPlaceholder('Ex.: Agenda e caixa').fill(rotulo)
    await p.getByRole('button', { name: 'Criar' }).click()
    await expect(p.getByRole('heading', { name: /O que .* acessa/ })).toContainText(rotulo)

    const financeiro = p.locator('[data-modulo="financial"]')
    // Nem sem acesso nem ligado há alcance a escolher.
    await expect(financeiro.getByRole('button', { name: 'Só as próprias comissões' })).toHaveCount(0)
    await expect(financeiro.getByRole('button', { name: 'Financeiro completo' })).toHaveCount(0)
    await financeiro.getByRole('button', { name: 'Ver', exact: true }).click()
    await expect(financeiro.getByRole('button', { name: 'Só as próprias comissões' })).toHaveCount(0)
    await expect(financeiro.getByRole('button', { name: 'Financeiro completo' })).toHaveCount(0)

    const relatorios = p.locator('[data-modulo="reports"]')
    await relatorios.getByRole('button', { name: 'Ver', exact: true }).click()

    // Salvar sem escolher: a tela pede, e nada é gravado.
    await p.getByRole('button', { name: 'Salvar acessos' }).click()
    const pedido = p.locator('[data-falta-escolher]')
    await expect(pedido).toContainText('Relatórios')
    await expect(pedido).toContainText(/relatório/i)
    await expect(pedido, 'o Financeiro ligado não pede nada').not.toContainText('Financeiro e comissões')
    await expect(p.getByText('Acessos salvos.')).toHaveCount(0)

    await relatorios.getByRole('button', { name: 'Financeiro', exact: true }).click()
    await p.getByRole('button', { name: 'Salvar acessos' }).click()
    await expect(p.getByText('Acessos salvos.')).toBeVisible()
  })
  const { data: cargo } = await db().from('tenant_roles').select('id').eq('tenant_id', rede.tenantId).eq('label', rotulo).single<{ id: string }>()
  const { data: fin } = await db().from('role_permissions').select('level, scope').eq('role_id', cargo!.id).eq('module', 'financial').single()
  expect(fin, 'o que a dona escolheu, não um padrão escondido').toEqual({ level: 'VIEW', scope: 'ALL' })
  const { data: abas } = await db().from('role_report_tabs').select('tab').eq('role_id', cargo!.id)
  expect((abas ?? []).length, 'o Relatórios foi salvo com a aba marcada').toBeGreaterThan(0)
})

// Sem o "só os meus" (SM1, o Heitor, 2026-11-23): o módulo ligado grava sem alcance nenhum.
test('A2: a action grava o módulo ligado sem alcance a escolher', async ({ browser }) => {
  const { data: cargo, error } = await db().from('tenant_roles')
    .insert({ tenant_id: rede.tenantId, key: `CFG12_${marca}`.toUpperCase(), label: `Cargo cfg12 ${marca}`, is_system: false })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=permissions')
    const r = await chamarAcaoComFormulario(p, 'actions/permissions.ts', 'saveRolePermissions',
      '/admin/settings?tab=permissions', [undefined], { roleId: cargo!.id, 'level:agenda': 'MANAGE' })
    expect(r.texto, 'chegou à action').not.toContain('Server action not found')
    expect(r.texto).not.toContain('Escolha o que o cargo enxerga')
  })
  const { data: agenda } = await db().from('role_permissions').select('level, scope')
    .eq('role_id', cargo!.id).eq('module', 'agenda').maybeSingle<{ level: string; scope: string }>()
  expect(agenda, 'gravado, sem recorte').toEqual({ level: 'MANAGE', scope: 'ALL' })
})

test('A1: "Aberta 24 horas" se desfaz com um toque, e o horário de antes volta', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=unidades')
    await p.getByRole('button', { name: 'Nova unidade' }).click()
    const janela = p.getByRole('dialog', { name: 'Nova unidade' })
    await expect(janela.getByLabel('Segunda, abre às')).toHaveValue('08:00')
    const atalho = janela.getByRole('button', { name: 'Aberta 24 horas, todos os dias' })
    await expect(atalho).toHaveAttribute('aria-pressed', 'false')
    await atalho.click()
    await expect(janela.locator('[data-dia-inteiro]')).toHaveCount(7)
    await expect(atalho, 'o atalho diz que está ligado').toHaveAttribute('aria-pressed', 'true')
    await expect(janela.locator('[data-desfazer-24-horas]')).toBeVisible()
    await atalho.click()
    await expect(janela.locator('[data-dia-inteiro]'), 'o segundo toque desfaz').toHaveCount(0)
    await expect(janela.getByLabel('Segunda, abre às')).toHaveValue('08:00')
    await expect(janela.getByLabel('Domingo abre'), 'o domingo volta como estava (fechado)').not.toBeChecked()
  })
})

// A4 foi revista pelo Heitor em 2026-11-13 ("tira agora esse aviso de é de
// propósito na configuração da equipe"): a linha da Equipe não tem mais o
// atalho; o "sem comissão, de propósito" fica só na janela da comissão (A14 da 11ª).
test('A4 (revista): a linha da Equipe não tem o atalho "É de propósito"', async ({ browser }) => {
  expect((await db().from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', dona.userId)).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/team')
    const chip = p.locator(`[data-comissao="${dona.userId}"]`)
    await expect(chip).toHaveText('Sem comissão de atendimento') // A22 da 19ª: o chip diz qual comissão falta
    await expect(p.locator(`[data-de-proposito-atalho="${dona.userId}"]`)).toHaveCount(0)
    await expect(p.locator('tr').filter({ has: chip }).getByText('É de propósito')).toHaveCount(0)
  })
})

test('A5: o "De venda" do pacote diz que vence a comissão de venda de cada pessoa', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/pacotes')
    const card = p.locator('[aria-label="Pacotes"]')
    await card.getByRole('button', { name: 'Novo pacote' }).click()
    const comissao = card.getByRole('group', { name: 'Comissão do pacote' })
    const ajuda = comissao.locator('[data-ajuda-da-venda]')
    // A regra mora na dica do "De venda" (2026-11-16).
    const dica = comissao.getByRole('button', { name: 'Sobre a comissão de venda do pacote' })
    await dica.hover()
    await expect(ajuda, 'sem regra no pacote, vale a da pessoa').toContainText('vale a comissão de venda de quem vendeu')
    await comissao.getByRole('group', { name: 'Comissão de venda' }).getByRole('button', { name: 'Percentual' }).click()
    await dica.hover()
    await expect(ajuda).toContainText('no lugar da comissão de venda de cada pessoa')
  })
})

test('A6/A24: o prêmio da indicação diz que o número é sugestão e o que conta', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=fidelidade')
    const bloco = p.getByTestId('opcional-indicacao')
    await bloco.getByRole('button', { name: 'Pontos' }).click()
    await expect(bloco.getByLabel('Pontos para quem indicou')).toHaveValue('300')
    await expect(bloco.locator('[data-sugestao-de-pontos]')).toContainText('sugestão')
    // O que conta para o prêmio mora na dica (2026-11-16).
    await bloco.getByRole('button', { name: 'Como funciona o prêmio por indicação' }).hover()
    await expect(bloco).toContainText('quando a indicada pagar o primeiro atendimento ou a primeira compra')
    await expect(bloco).toContainText('pacote')
    await expect(bloco).toContainText('crédito interno')
    await expect(bloco).toContainText('o estorno de uma parte não tira o prêmio')
    // A pós-visita da campanha "Automática" saiu em 2026-11-14 (MK1): é o
    // modelo "Retorno depois do atendimento" das Automações.
  })
})

test('A9: com custo R$ 0,00, a calculadora não mostra "Margem de lucro 100%"', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/procedures')
    await p.locator('tr', { hasText: `Proc cfg12${marca}` }).getByRole('button', { name: 'Editar' }).click()
    await expect(p.locator('[data-margem-sem-custo]')).toContainText('Sem custo cadastrado')
    await expect(p.getByLabel('Margem de lucro (%)')).toHaveValue('')
  })
})

test('A11: quem tem só uma unidade, com Configurações em Gerenciar, lê por que a aba e a Equipe não abrem, e o /admin diz por que a levou à unidade', async ({ browser }) => {
  const { data: b } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  const slug = b!.slug
  const gerente = await criarMembro(`cfg12g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  try {
    await como(browser, gerente, async p => {
      await p.goto(`/${slug}/settings?tab=comissoes`)
      await expect(p.locator('[data-aba-fora-do-acesso]')).toContainText('Comissões')
      await p.goto(`/${slug}/settings?tab=permissions`)
      await expect(p.locator('[data-aba-fora-do-acesso]')).toContainText('Cargos')
      await p.goto(`/${slug}/settings?tab=commissions`)
      await expect(p.locator('[data-aba-fora-do-acesso]'), 'o nome em inglês é a mesma aba').toContainText('Comissões')
      await p.goto(`/${slug}/settings?tab=unidade`)
      await expect(p.locator('[data-aba-fora-do-acesso]'), 'a aba dela abre sem aviso').toHaveCount(0)

      await p.goto(`/${slug}/team`)
      // O "só vê" mora na dica do título (2026-11-16).
      await p.getByRole('button', { name: 'Sobre a equipe da unidade' }).hover()
      await expect(p.locator('[data-equipe-so-leitura]')).toContainText('Equipe em Gerenciar')

      await p.goto('/admin/settings')
      await expect(p).toHaveURL(new RegExp(`/${slug}/`))
      await expect(p.getByText(/O portal da rede é de quem tem “A rede inteira”/)).toBeVisible()
    })
  } finally {
    await gerente.limpar()
  }
})

test('A12: quem não monta o plano lê onde se libera — o Atendimento em Gerenciar (UM3)', async ({ browser }) => {
  const cliente = await rede.criarCliente('Plano A12')
  const { data: b } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  const recepcao = await criarMembro(`cfg12r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  try {
    await como(browser, recepcao, async p => {
      await p.goto(`/${b!.slug}/clients/${cliente}?aba=planejamento`)
      // UM3 (o Heitor, 2026-11-23): quem monta é quem tem o Atendimento em
      // Gerenciar na unidade — o texto diz a permissão, não mais o "Atende" (PT2).
      // O "quem monta" mora na dica do vazio (2026-11-16).
      await p.getByRole('button', { name: 'Quem monta o plano' }).hover()
      await expect(p.getByText(/Quem monta o plano é quem tem o Atendimento em Gerenciar nesta unidade/)).toBeVisible()
    })
  } finally {
    await recepcao.limpar()
  }
})
