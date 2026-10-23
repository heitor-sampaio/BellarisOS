import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'
import { addDaysTZ, dayKeyTZ, startOfDayTZ, startOfMonthTZ } from '../lib/datetime'

/**
 * A varredura das listas que o PostgREST cortava (2026-10-22).
 *
 * Ele devolve no máximo 1000 linhas por consulta, e leitura sem paginar
 * chegava cortada EM SILÊNCIO — a agenda da unidade foi a primeira achada
 * (2026-10-21). A varredura achou o mesmo nas listas de clientes, na "última
 * visita", no público das campanhas e das automações, no quadro de
 * oportunidades, no inbox, no relatório comercial, na agenda da rede, no
 * financeiro, nas comissões, na fila do checkout, nas automações e nos
 * injetáveis.
 *
 * Uma rede `[e2e]` própria com MAIS de 1000 linhas em cada lista, e um alvo em
 * cada uma — o registro que a ordem da consulta deixava para depois da linha
 * 1000. O teste é: o alvo aparece.
 */

test.setTimeout(300_000)

const marca = Date.now().toString(36)
const db = () => banco()
const LOTE = 1010
let rede: OutraRede | null = null
let dono: MembroDeTeste | null = null
let slug = ''
let nomeDaUnidade = ''
let zz = ''                 // a cliente "Zz", a última do alfabeto
const lote: string[] = []   // as 1010 clientes do lote
const hoje = startOfDayTZ(new Date())
const inicioDoMes = startOfMonthTZ(new Date())

/** Insere em lotes de 250 e devolve os ids. */
async function emLotes(tabela: string, linhas: Record<string, unknown>[]): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < linhas.length; i += 250) {
    const { data, error } = await db().from(tabela).insert(linhas.slice(i, i + 250)).select('id')
    expect(error, `semear ${tabela}`).toBeNull()
    ids.push(...((data ?? []) as { id: string }[]).map(l => l.id))
  }
  return ids
}

async function abrir(browser: Browser, caminho: string, fazer: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dono!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(caminho)
    await fazer(p)
  } finally {
    await ctx.close()
  }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ls${marca}`)
  // A rede [e2e] já configurada: senão o dono cai no /setup em vez da tela.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  dono = await criarMembro(`lsd${marca}`, { permissoes: [], tenant: rede.tenantId, donoDaRede: true })
  const u = (await db().from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()).data!
  slug = u.slug; nomeDaUnidade = u.name

  // As 1010 clientes do lote ("Lote 0001"…), da unidade (a tag é a da lista da
  // unidade), e a "Zz", que a ordem por nome deixa por último.
  lote.push(...await emLotes('clients', Array.from({ length: LOTE }, (_, i) => ({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, is_active: true,
    name: `${PREFIXO} Lote ${String(i).padStart(4, '0')} ${marca}`, tags: [`Unidade: ${nomeDaUnidade}`],
    phone: '5500' + String(Date.now() + i).slice(-9),
  }))))
  zz = await rede.criarCliente('Zz Última')
  expect((await db().from('clients').update({ tags: [`Unidade: ${nomeDaUnidade}`] }).eq('id', zz)).error).toBeNull()

  // Um atendimento CONCLUÍDO de cada cliente do lote, HOJE, de minuto em
  // minuto desde a meia-noite. A Zz foi atendida há 60 dias: na "última
  // visita", os mais recentes vinham primeiro e ela ficava depois da linha 1000.
  const base = { branch_id: rede.branchId, procedure_id: rede.procedureId, professional_id: rede.professionalId, source: 'INTERNAL', duration_min: 30, price: 0 }
  const atendimentos = await emLotes('appointments', lote.map((cliente, i) => ({
    ...base, client_id: cliente, status: 'COMPLETED', scheduled_at: new Date(hoje.getTime() + i * 60_000).toISOString(),
  })))
  await emLotes('appointments', [{ ...base, client_id: zz, status: 'COMPLETED', scheduled_at: addDaysTZ(hoje, -60).toISOString() }])

  // Uma comissão de R$ 1 por atendimento do lote, lançada neste mês.
  const mes = dayKeyTZ(new Date()).slice(0, 7)
  await emLotes('commissions', atendimentos.map((a, i) => ({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, appointment_id: a, amount: 1,
    type: 'FIXED_AMOUNT', rule_value: 1, period_ref: mes,
    released_at: new Date(Math.max(inicioDoMes.getTime() + 60_000, Date.now() - (i + 1) * 1000)).toISOString(),
  })))
})

test.afterAll(async () => {
  // Apagar mais de 1000 clientes com o que elas têm passa do minuto padrão
  // dos hooks.
  test.setTimeout(300_000)
  if (rede) {
    const b = db()
    await b.from('commissions').delete().eq('branch_id', rede.branchId)
    await b.from('financial_transactions').delete().eq('branch_id', rede.branchId)
    for (let i = 0; i < 3; i++) await b.from('appointments').delete().eq('branch_id', rede.branchId)
    await b.from('treatment_plans').delete().eq('branch_id', rede.branchId)
    await b.from('automation_runs').delete().eq('tenant_id', rede.tenantId)
    await b.from('automations').delete().eq('tenant_id', rede.tenantId)
    const mapas = ((await b.from('injectable_maps').select('id, client_id').eq('tenant_id', rede.tenantId)).data ?? []) as { id: string; client_id: string }[]
    for (const c of new Set(mapas.map(m => m.client_id))) await b.from('injectable_applications').delete().eq('client_id', c)
    await b.from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
    await b.from('leads').delete().eq('tenant_id', rede.tenantId)
    await b.from('conversations').delete().eq('tenant_id', rede.tenantId)
    await b.from('contacts').delete().eq('tenant_id', rede.tenantId)
    const falhas = []
    for (let i = 0; i < lote.length; i += 150) falhas.push(...await apagarClientes(lote.slice(i, i + 150)))
    expect(falhas).toEqual([])
  }
  await dono?.limpar(); await rede?.limpar()
})

test('a lista de clientes da rede e da unidade traz a 1011ª, com a última visita dela', async ({ browser }) => {
  for (const caminho of ['/admin/clients', `/${slug}/clients`]) {
    await abrir(browser, caminho, async p => {
      await p.getByPlaceholder('Buscar por nome…').fill('Zz Última')
      const linha = p.getByRole('button', { name: /Zz Última/ })
      await expect(linha, `${caminho}: a Zz está na lista`).toHaveCount(1)
      await expect(linha, `${caminho}: e com a última visita`).toContainText('Última visita')
    })
  }
})

test('o público da campanha conta todas as que fizeram o procedimento', async ({ browser }) => {
  await abrir(browser, '/admin/notificacoes/nova', async p => {
    const r = await chamarAcao(p, 'actions/notification-campaigns.ts', 'previewAudienceCount', '/admin/notificacoes/nova', [{ procedure_ids: [rede!.procedureId] }])
    expect(r.texto).toContain(`"count":${LOTE + 1}`)
  })
})

test('o público no banco: aniversário, sem retorno e o teto, depois do filtro', async () => {
  // A Zz faz aniversário hoje; o lote, não. Ela foi atendida há 60 dias; o
  // lote, hoje. Os dois filtros eram feitos em JavaScript sobre um lote
  // ARBITRÁRIO de 1000 (ou 501) clientes — a aniversariante podia nem vir.
  const dia = dayKeyTZ(new Date())
  expect((await db().from('clients').update({ birth_date: `1990-${dia.slice(5)}` }).eq('id', zz)).error).toBeNull()
  const publico = async (filtros: Record<string, unknown>, limite?: number) => {
    let q = db().rpc('clientes_do_publico', { p_tenant: rede!.tenantId, p_filtros: filtros })
    if (limite) q = q.limit(limite)
    const { data, error } = await q
    expect(error, 'clientes_do_publico').toBeNull()
    return ((data ?? []) as { id: string }[]).map(c => c.id)
  }
  expect(await publico({ aniversario: { mes: Number(dia.slice(5, 7)), dia: Number(dia.slice(8, 10)) } })).toEqual([zz])
  const semRetorno = await publico({ branch_ids: [rede!.branchId], sem_retorno_desde: addDaysTZ(hoje, -30).toISOString() })
  expect(semRetorno).toEqual([zz])
  // Contado no banco, como `contarPublico`: lido direto, o próprio PostgREST
  // cortaria em 1000.
  const { count, error: eConta } = await db().rpc('clientes_do_publico',
    { p_tenant: rede!.tenantId, p_filtros: { procedure_ids: [rede!.procedureId] } }, { count: 'exact', head: true })
  expect(eConta, 'contar o público').toBeNull()
  expect(count, 'todas as que fizeram o procedimento').toBe(LOTE + 1)
  expect(await publico({}, 5)).toHaveLength(5)
})

test('a agenda da rede traz o horário depois da linha 1000 do dia', async ({ browser }) => {
  // Os 1010 do lote ocupam o dia de hoje de minuto em minuto desde a
  // meia-noite (até 16:49); o alvo é às 16:55, logo depois deles e dentro da
  // grade (às 23:50 caía fora do horário que a agenda mostra).
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: zz, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 10, price: 0,
    scheduled_at: new Date(hoje.getTime() + (16 * 60 + 55) * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await abrir(browser, `/admin/agenda?date=${dayKeyTZ(new Date())}`, async p => {
    // Presença, como em agenda-mais-de-mil: com 1010 blocos no mesmo dia e
    // profissional, o do alvo pode ficar sem área visível — o que se prova é
    // que ele chegou à grade.
    await expect(p.locator(`[data-agendamento="${data!.id}"]`), 'o 1011º do dia está na grade').toHaveCount(1)
  })
})

test('o quadro de oportunidades, o inbox e o relatório comercial veem a 1011ª oportunidade', async ({ browser }) => {
  // Abrir o quadro cria o funil padrão da rede.
  await abrir(browser, '/admin/oportunidades', async () => {})
  const etapa = (await db().from('crm_stages').select('id, crm_funnels!inner(tenant_id)').eq('crm_funnels.tenant_id', rede!.tenantId)
    .order('position').limit(1).single<{ id: string }>()).data!.id
  const contatos = await emLotes('contacts', Array.from({ length: LOTE + 1 }, (_, i) => ({ tenant_id: rede!.tenantId, name: `${PREFIXO} Pessoa ${i} ${marca}` })))
  // A mais ANTIGA do mês é a alvo: o quadro e o inbox vêm da mais nova para a
  // mais antiga.
  await emLotes('leads', contatos.map((contato, i) => ({
    tenant_id: rede!.tenantId, contato_id: contato, crm_stage_id: etapa,
    name: i === 0 ? `${PREFIXO} Zz Oportunidade antiga ${marca}` : `${PREFIXO} Oportunidade ${i} ${marca}`,
    created_at: new Date(inicioDoMes.getTime() + 60_000 + i * 1000).toISOString(),
  })))

  await abrir(browser, '/admin/oportunidades', async p => {
    // Presença: o card mais antigo fica no fim de uma coluna de 1011, fora da
    // área visível dela. Com o corte, ele nem chegava à página.
    await expect(p.getByText(`Zz Oportunidade antiga ${marca}`).first(), 'o card mais antigo está no quadro').toBeAttached()
  })
  await abrir(browser, '/admin/inbox', async p => {
    await p.getByTitle('Nova conversa').click()
    await expect(p.locator('option', { hasText: `Zz Oportunidade antiga ${marca}` }), 'e no seletor da nova conversa').toHaveCount(1)
  })
  await abrir(browser, '/admin/reports?tab=comercial&period=month', async p => {
    await expect(p.locator('.card', { hasText: 'Leads recebidos' }).first()).toContainText(/1\.011/)
  })
})

test('o financeiro da unidade traz o lançamento mais antigo do mês e as comissões inteiras', async ({ browser }) => {
  await emLotes('financial_transactions', Array.from({ length: LOTE + 1 }, (_, i) => ({
    branch_id: rede!.branchId, type: 'EXPENSE', category: 'e2e', amount: 1, is_paid: true, created_by: 'e2e',
    description: i === 0 ? `${PREFIXO} Zz Lançamento antigo ${marca}` : `${PREFIXO} Despesa ${i} ${marca}`,
    paid_at: new Date(inicioDoMes.getTime() + 60_000 + i * 1000).toISOString(),
  })))
  await abrir(browser, `/${slug}/financeiro`, async p => {
    await expect(p.getByText(`Zz Lançamento antigo ${marca}`).first(), 'o lançamento mais antigo do mês').toBeVisible()
    // As 1010 comissões de R$ 1: o total do card soma todas.
    await expect(p.getByText(/R\$\s?1\.010,00/).first(), 'o total das comissões').toBeVisible()
  })
  // O extrato da rede tinha teto de 500. A tabela dele mostra as 100 primeiras
  // e AVISA quantas há — o aviso dizia "100 de 500" com 1011 no mês.
  await abrir(browser, '/admin/financeiro', async p => {
    await expect(p.getByText(`Exibindo 100 de ${LOTE + 1} registros`, { exact: false }), 'e no extrato da rede, todos').toBeVisible()
  })
})

test('a fila do checkout traz a proposta mais nova', async ({ browser }) => {
  // A fila vem da mais antiga para a mais nova: a mais NOVA ficava de fora.
  await emLotes('treatment_plans', Array.from({ length: LOTE + 1 }, (_, i) => ({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, status: 'PROPOSED',
    client_id: i === LOTE ? zz : lote[i], name: `${PREFIXO} Plano ${i} ${marca}`,
    created_at: new Date(Date.now() - (LOTE + 1 - i) * 1000).toISOString(),
  })))
  await abrir(browser, '/admin/checkout', async p => {
    await expect(p.getByText(/Zz Última/).first(), 'a proposta mais nova está na fila').toBeVisible()
  })
  // A lista de planejamentos vem da mais nova para a mais antiga, com teto de 200.
  await abrir(browser, '/admin/planejamentos', async p => {
    await expect(p.getByText(`Plano 0 ${marca}`, { exact: false }).first(), 'o planejamento mais antigo na lista').toBeVisible()
  })
})

test('a lista de automações conta todas as execuções da semana', async ({ browser }) => {
  const { data: a, error } = await db().from('automations').insert({ tenant_id: rede!.tenantId, nome: `${PREFIXO} Muitas ${marca}`, status: 'PAUSADA' })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await emLotes('automation_runs', Array.from({ length: LOTE }, () => ({ tenant_id: rede!.tenantId, automation_id: a!.id, status: 'ok', simulacao: false })))
  await abrir(browser, '/admin/automacoes', async p => {
    await expect(p.getByText(`${LOTE}`, { exact: true }).first(), 'as 1010 execuções').toBeVisible()
  })
})

test('os injetáveis trazem a última aplicação de quem só tem aplicação antiga', async ({ browser }) => {
  // Uma cliente do lote com 1010 aplicações recentes; a Zz, com uma de 90 dias.
  // O mapa da Zz é o mais antigo, atrás de 300 mais novos: a lista tinha teto
  // de 300, da edição mais recente para a mais antiga.
  const outra = lote[0]!
  const mapa = (c: string, i: number) => ({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: c, name: `${PREFIXO} Mapa ${i} ${marca}`, points: [],
    updated_at: new Date(Date.now() - (400 - i) * 1000).toISOString(),
  })
  await emLotes('injectable_maps', [mapa(zz, 0), ...lote.slice(0, 300).map((c, i) => mapa(c, i + 1))])
  await emLotes('injectable_applications', Array.from({ length: LOTE }, (_, i) => ({ client_id: outra, points: [], applied_at: new Date(Date.now() - i * 1000).toISOString() })))
  const antiga = addDaysTZ(hoje, -90)
  await emLotes('injectable_applications', [{ client_id: zz, points: [], applied_at: antiga.toISOString() }])
  await abrir(browser, '/admin/injetaveis', async p => {
    await expect(p.getByRole('link', { name: /Zz Última/ }).first(), 'a Zz com a última aplicação').toContainText(`última aplicação em ${antiga.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  })
})
