import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { apagarAgendamentos, apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * "Quem só pode ver só pode ver" (o Heitor, 5ª simulação, 2026-11-01): os
 * botões que apareciam para quem não pode usá-los, e a recusa que derrubava a
 * tela inteira ou chegava em inglês. Cada um com um membro de verdade (o cargo
 * só com Ver, sem o módulo, ou o "só os meus") e o controle de quem pode.
 *
 * - D4: "Cadastrar cliente" no inbox para Clientes = Ver; ao enviar, 500 e a
 *   página virava "Você não tem acesso".
 * - D5: a aba Dados editável para quem só vê, e o "Salvar" dava 500 mudo.
 * - D6: a aba Planejamento em "Carregando planos…" para sempre, sem Agenda.
 * - A23: "+ Agendar" sem a Agenda e "Adicionar primeiro documento" sem poder anexar.
 * - D7: "Novo lançamento" no Financeiro da rede para Financeiro = Ver, e a
 *   recusa "Forbidden", em inglês.
 * - D8: o termo que bloqueia, sem saída para o médico que não colhe assinatura.
 * - D9: "Fechar agora" e a dica do J-35 para quem tem o prontuário só em Ver.
 * - A39: "Editar registro" com o texto "Apenas gerentes podem editar".
 * - A43: "Só a administração da rede vê esta lista" ao médico da rede.
 * - A5: o cargo com Relatórios em Ver e nenhuma aba some do resumo sem dizer.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let sdr: MembroDeTeste | null = null
let clinico: MembroDeTeste | null = null
let contadora: MembroDeTeste | null = null
let medico: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let cliente = ''
let conversa = ''
let procComTermo = ''
const agendamentos: string[] = []
test.describe.configure({ timeout: 180_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendamento(extra: Record<string, unknown>): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: medico!.userId,
    status: 'CONFIRMED', source: 'INTERNAL', duration_min: 30, price: 120,
    scheduled_at: new Date(Date.now() + 2 * 3600_000).toISOString(), ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o agendamento').toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(300_000)
  rede = await criarOutraRede(`pqv${marca}`)
  const t = rede.tenantId
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', t)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ price: 120 }).eq('id', rede.procedureId)).error).toBeNull()
  cliente = await rede.criarCliente('Cliente só ver')

  sdr = await criarMembro(`pqvs${marca}`, { tenant: t, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }] })
  clinico = await criarMembro(`pqvc${marca}`, { tenant: t, rotulo: 'Clínico', permissoes: [{ modulo: 'medical_records', nivel: 'VIEW', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }] })
  contadora = await criarMembro(`pqvf${marca}`, { tenant: t, rotulo: 'Contadora', permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'ALL' }, { modulo: 'reports', nivel: 'VIEW', escopo: 'ALL' }] })
  medico = await criarMembro(`pqvm${marca}`, {
    tenant: t, rotulo: 'Médico',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'documents', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', medico.userId)).error).toBeNull()
  gerente = await criarMembro(`pqvg${marca}`, {
    tenant: t, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'medical_records', nivel: 'VIEW', escopo: 'ALL' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  dona = await criarMembro(`pqvd${marca}`, { tenant: t, donoDaRede: true, rotulo: 'Dona', permissoes: [] })

  // O termo que BLOQUEIA o início, num procedimento só dele.
  const { data: m, error: eM } = await db().rpc('documento_modelo_salvar', {
    p_tenant: t, p_modelo: null, p_nome: `${PREFIXO} Termo que bloqueia ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, {{cliente.nome}}, autorizo {{procedimento.nome}}.',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(eM, 'o modelo do termo').toBeNull()
  const { data: pr, error: ePr } = await db().from('procedures').insert({
    tenant_id: t, name: `${PREFIXO} Bioestimulador ${marca}`, category: 'e2e', duration_min: 30, price: 120,
    consent_template_id: (m as { id: string }).id,
  }).select('id').single<{ id: string }>()
  expect(ePr, 'o procedimento com termo').toBeNull()
  procComTermo = pr!.id

  const fone = '5548' + String(Date.now()).slice(-9)
  const { data: c, error: eC } = await db().from('conversations').insert({
    tenant_id: t, channel: 'whatsapp', status: 'open', provider: 'uazapi',
    contact_name: `${PREFIXO} Lead do inbox ${marca}`, contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
    last_message_at: new Date().toISOString(), last_message: 'oi',
  }).select('id').single<{ id: string }>()
  expect(eC, 'a conversa').toBeNull()
  conversa = c!.id
})

test.afterAll(async () => {
  if (rede) {
    const { data: docs } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((docs ?? []).map(d => d.id as string))).toEqual([])
    expect(await apagarAgendamentos(agendamentos)).toEqual([])
    await db().from('clients').delete().eq('tenant_id', rede.tenantId).like('name', `${PREFIXO} Cadastro furado%`)
  }
  if (conversa) await apagarConversas([conversa])
  for (const m of [sdr, clinico, contadora, medico, gerente, dona]) await m?.limpar()
  await rede?.limpar()
})

test('D4: o SDR com Clientes em Ver não vê "Cadastrar cliente" no inbox, e a action recusa com { error }', async ({ browser }) => {
  await como(browser, sdr!, async p => {
    await p.goto('/admin/inbox')
    await p.locator('button.inbox-conversa').filter({ hasText: `Lead do inbox ${marca}` }).click()
    await expect(p.getByPlaceholder('Nome').first(), 'o painel do contato abriu').toBeVisible()
    await expect(p.getByRole('button', { name: 'Cadastrar cliente' }), 'sem o botão').toHaveCount(0)

    const r = await chamarAcaoComFormulario(p, 'actions/clients.ts', 'addClient', '/admin/inbox', [undefined], {
      name: `${PREFIXO} Cadastro furado ${marca}`, phone: '(48) 99123-4567', _branchId: rede!.branchId, _slug: slug,
    })
    expect(r.status, 'a recusa não é um 500').toBeLessThan(500)
    expect(r.texto).toContain('Seu cargo só consulta os clientes')
  })
  expect((await db().from('clients').select('id').eq('tenant_id', rede!.tenantId).like('name', `${PREFIXO} Cadastro furado%`)).data, 'nada gravado').toEqual([])
})

test('D5, D6, A23: na ficha, quem só vê não edita os Dados, não agenda, não anexa e não fica em "Carregando planos…"', async ({ browser }) => {
  await como(browser, sdr!, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await expect(p.getByText(`Cliente só ver pqv${marca}`).first()).toBeVisible()
    await expect(p.getByRole('button', { name: '+ Agendar' }), 'A23: sem a Agenda, sem "+ Agendar"').toHaveCount(0)
    await expect(p.getByPlaceholder(/Preferências, restrições/), 'as anotações só se leem').not.toBeEditable()
    // D6: sem a Agenda e sem o prontuário, não há Planejamento.
    await expect(p.getByRole('main').getByRole('tab', { name: 'Planejamento', exact: true })).toHaveCount(0)

    await p.goto(`/admin/clients/${cliente}?aba=dados`)
    await expect(p.locator('[data-cadastro-so-leitura]'), 'D5: a aba diz que é só leitura').toContainText('Seu cargo só consulta')
    await expect(p.getByRole('button', { name: 'Salvar dados' })).toHaveCount(0)
    await expect(p.getByLabel('Número do documento')).toBeDisabled()

    await p.goto(`/admin/clients/${cliente}?aba=documentos`)
    await expect(p.getByText('Nenhum documento anexado')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Adicionar primeiro documento' }), 'A23: sem poder anexar').toHaveCount(0)

    // A action recusa com { error }, não com 500.
    const r = await chamarAcao(p, 'actions/clients.ts', 'updateClientContactData', `/admin/clients/${cliente}`, [cliente, {
      name: 'Nome furado', document: null, phone: null, email: null, birthDate: null, zipCode: null, address: null,
      addressNumber: null, addressComplement: null, neighborhood: null, city: null, state: null,
    }, slug])
    expect(r.status).toBeLessThan(500)
    expect(r.texto).toContain('Seu cargo só consulta os clientes')
  })
  expect((await db().from('clients').select('name').eq('id', cliente).single<{ name: string }>()).data?.name).not.toBe('Nome furado')

  // D6: com o prontuário e sem a Agenda, o Planejamento mostra os injetáveis — nada fica carregando.
  await como(browser, clinico!, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=planejamento`)
    await expect(p.getByText('Nenhum planejamento de injetáveis ainda.')).toBeVisible()
    await expect(p.getByText('Carregando planos…')).toHaveCount(0)
  })
})

test('D7: a contadora (Financeiro em Ver) não vê "Novo lançamento", e a recusa fala português', async ({ browser }) => {
  await como(browser, contadora!, async p => {
    await p.goto('/admin/financeiro')
    await expect(p.getByRole('heading', { name: /Financeiro/ }).first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Novo lançamento' })).toHaveCount(0)
    const r = await chamarAcaoComFormulario(p, 'actions/financial.ts', 'createTransactionAdvanced', '/admin/financeiro', [undefined], {
      _branchId: rede!.branchId, _slug: slug, type: 'EXPENSE', category: 'Outros', description: `${PREFIXO} furo ${marca}`, amount: '10',
    })
    expect(r.texto).not.toContain('Forbidden')
    expect(r.texto).toContain('Seu cargo não libera esta ação.')
  })
})

test('D8: o médico que não colhe assinatura lê quem colhe o termo que bloqueia', async ({ browser }) => {
  const id = await agendamento({ procedure_id: procComTermo })
  await como(browser, medico!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByText('Para assinar · bloqueia').first()).toBeVisible()
    await expect(p.getByRole('link', { name: 'Colher assinatura' })).toHaveCount(0)
    await expect(p.locator('[data-quem-colhe]')).toContainText('recepção')
  })
})

test('D9, A39: com o prontuário só em Ver, nada de "Fechar agora", da dica do J-35 nem de "Editar registro"', async ({ browser }) => {
  const emCurso = await agendamento({
    status: 'IN_PROGRESS', scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  })
  const concluido = await agendamento({
    status: 'COMPLETED', scheduled_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    started_at: new Date(Date.now() - 3 * 3600_000).toISOString(), completed_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  })
  // Controle: o médico, que escreve no prontuário, gera o plano e edita o registro dele.
  await como(browser, medico!, async p => {
    await p.goto(`/${slug}/agenda/${emCurso}`)
    await expect(p.getByRole('button', { name: 'Gerar plano e enviar à recepção' })).toBeVisible()
    await p.goto(`/${slug}/agenda/${concluido}`)
    await expect(p.getByText('Registro bloqueado para edição')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Editar registro' })).toBeVisible()
    await expect(p.getByText(/Apenas gerentes podem editar/), 'A39: o texto não contradiz o botão').toHaveCount(0)
  })
  await como(browser, gerente!, async p => {
    await p.goto(`/${slug}/agenda/${emCurso}`)
    await expect(p.getByText('Quem conclui é o profissional (concluir grava o prontuário).')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Fechar agora' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Gerar plano e enviar à recepção' })).toHaveCount(0)
    await expect(p.locator('[data-dica-do-avulso]')).toHaveCount(0)
    await p.goto(`/${slug}/agenda/${concluido}`)
    await expect(p.getByText('Registro bloqueado para edição')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Editar registro' }), 'A39: sem o prontuário em Gerenciar, sem desbloquear').toHaveCount(0)
  })
})

test('A43: "Acessos ao prontuário" diz a regra de verdade a quem o vê', async ({ browser }) => {
  await como(browser, medico!, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=fichas`)
    const secao = p.getByRole('region', { name: 'Acessos ao prontuário' })
    await expect(secao).toBeVisible()
    await expect(secao).not.toContainText('Só a administração da rede')
    await expect(secao).toContainText('Prontuário em Gerenciar')
  })
})

test('A5: o resumo do cargo diz que Relatórios sem aba marcada não aparece', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await p.getByText(`Contadora pqvf${marca}`).first().click()
    await expect(p.getByRole('heading', { name: new RegExp(`Contadora pqvf${marca}`) })).toBeVisible()
    await expect(p.locator('[data-relatorios-sem-aba]')).toContainText('Relatórios')
  })
})
