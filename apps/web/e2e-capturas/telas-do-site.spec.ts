import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { banco } from '../e2e/apoio/banco'
import { apagarClientes } from '../e2e/apoio/limpeza'
import { clienteComSessao, type ClienteDeTeste, type MembroDeTeste } from '../e2e/apoio/sessao'
import { redeDoCopilot, contraAFalsa, type RedeDoCopilot } from '../e2e/apoio/copilot'
import { subirOpenaiFalsa, type OpenaiFalsa } from '../e2e/apoio/openai-falsa'

/**
 * As TELAS REAIS do site (bellarisos.com — 2026-10-17). Não é teste: é a
 * câmera. Monta uma clínica de demonstração com dados FICTÍCIOS numa rede
 * `[e2e]` própria, fotografa as telas que o site mostra e apaga tudo.
 *
 *   pnpm --filter web exec playwright test -c playwright.capturas.config.ts
 *
 * As fotos vão para `apps/site/public/telas/` com os nomes de
 * `apps/site/lib/telas.ts`. Mudou a tela na clínica, roda de novo.
 *
 * Os nomes de rede, unidade e pessoas aparecem nas fotos: durante a captura a
 * rede se chama "Clínica Aurora" (o prefixo `[e2e]` volta antes de apagar, para
 * a varredura achá-la se algo cair no meio).
 */

test.skip(!contraAFalsa(), 'só contra o build: o Copilot precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const SAIDA = path.resolve(__dirname, '..', '..', 'site', 'public', 'telas')
const COMPUTADOR = { width: 1440, height: 900 }
const CELULAR = { width: 390, height: 844 }

const db = banco()
let rede: RedeDoCopilot
let portal: ClienteDeTeste
let falsa: OpenaiFalsa
let nomeOriginal = ''
const clientes: string[] = []
const conversas: string[] = []
const membrosExtras: MembroDeTeste[] = []
let mariana = ''
let conversaAberta = ''
let mapaId = ''
let automacaoId = ''
let pacoteId = ''

/** Hoje em São Paulo, 'AAAA-MM-DD'. */
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const emSP = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString()
const diasAtras = (n: number) => {
  const d = new Date(`${hojeSP()}T12:00:00-03:00`)
  d.setDate(d.getDate() - n)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}
const fone = (i: number) => `55119${String(81000000 + i * 7919).slice(-8)}`

async function inserir<T = { id: string }>(tabela: string, linha: Record<string, unknown> | Record<string, unknown>[], o_que: string): Promise<T[]> {
  const { data, error } = await db.from(tabela).insert(linha).select('id')
  expect(error, o_que).toBeNull()
  return data as T[]
}

/** `semMenu`: corta o menu lateral (244 px, `--sidebar-w`) — o site o mostra só no hero. */
async function fotografar(page: Page, arquivo: string, semMenu = false) {
  // As fontes e as imagens carregadas, sem o cursor piscando no meio.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SAIDA, `${arquivo}.png`), animations: 'disabled', caret: 'hide', ...(semMenu ? { clip: { x: 244, y: 0, width: COMPUTADOR.width - 244, height: COMPUTADOR.height } } : {}) })
}

test.beforeAll(async () => {
  test.setTimeout(300_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot('site')
  const { tenantId, branchId } = rede.outra

  const { data: t } = await db.from('tenants').select('name, slug').eq('id', tenantId).single<{ name: string; slug: string }>()
  nomeOriginal = t!.name
  await db.from('tenants').update({ name: 'Clínica Aurora' }).eq('id', tenantId)
  const { data: b } = await db.from('branches').update({ name: 'Aurora · Jardins' }).eq('id', branchId).select('slug').single<{ slug: string }>()

  // A equipe: a dona e três profissionais.
  await db.from('users').update({ name: 'Helena Duarte' }).eq('id', rede.dono.userId)
  await db.from('users').update({ name: 'Dra. Ana Lima', provides_services: true, branch_id: branchId }).eq('id', rede.outra.professionalId)
  const profissionais = [rede.outra.professionalId]
  for (const [marca, nome] of [['pb', 'Dra. Bianca Rocha'], ['pc', 'Camila Souza']] as const) {
    const m = await rede.membro(marca, [{ modulo: 'agenda', nivel: 'VIEW' }])
    membrosExtras.push(m)
    await db.from('users').update({ name: nome, provides_services: true, branch_id: branchId }).eq('id', m.userId)
    profissionais.push(m.userId)
  }

  // O catálogo.
  await db.from('procedures').update({ name: 'Avaliação', category: 'Facial', duration_min: 30, price: 0 }).eq('id', rede.outra.procedureId)
  const procs = await inserir('procedures', [
    { tenant_id: tenantId, name: 'Toxina botulínica', category: 'Injetáveis', duration_min: 45, price: 1200 },
    { tenant_id: tenantId, name: 'Preenchimento labial', category: 'Injetáveis', duration_min: 60, price: 1500 },
    { tenant_id: tenantId, name: 'Limpeza de pele', category: 'Facial', duration_min: 60, price: 220 },
    { tenant_id: tenantId, name: 'Bioestimulador de colágeno', category: 'Injetáveis', duration_min: 60, price: 1800 },
    { tenant_id: tenantId, name: 'Peeling químico', category: 'Facial', duration_min: 45, price: 350 },
    { tenant_id: tenantId, name: 'Drenagem linfática', category: 'Corporal', duration_min: 50, price: 180 },
  ], 'procedimentos')
  const [toxina, labial, limpeza, bio, peeling, drenagem] = procs.map(p => p.id)
  const salas = await inserir('rooms', [1, 2, 3].map(n => ({ branch_id: branchId, name: `Sala ${n}` })), 'salas')

  // A cliente do portal é a Mariana: a que aparece na ficha e no celular.
  portal = await clienteComSessao('site', { id: branchId, slug: b!.slug }, { tenant: tenantId })
  mariana = portal.clientId
  await db.from('clients').update({ name: 'Mariana Costa', email: 'mariana.costa@exemplo.com.br', phone: fone(0), birth_date: '1991-03-14T12:00:00Z', tags: ['VIP'] }).eq('id', mariana)

  const nomes = ['Juliana Martins', 'Beatriz Ferreira', 'Larissa Gomes', 'Patrícia Nunes', 'Renata Barbosa', 'Tatiane Ribeiro',
    'Aline Cardoso', 'Gabriela Pires', 'Letícia Moura', 'Carolina Dias', 'Isabela Freitas']
  const outras = await inserir('clients', nomes.map((name, i) => ({ tenant_id: tenantId, branch_id: branchId, name, phone: fone(i + 1) })), 'clientes')
  clientes.push(...outras.map(c => c.id))
  await db.from('loyalty_accounts').upsert(clientes.map(c => ({ client_id: c })), { onConflict: 'client_id' })
  const c = (i: number) => outras[i]!.id

  // A agenda de hoje.
  const hoje = hojeSP()
  const [ana, bianca, camila] = profissionais
  const ag = (cli: string, prof: string, proc: string, hora: string, dur: number, preco: number, status: string, sala: number) => ({
    branch_id: branchId, client_id: cli, professional_id: prof, procedure_id: proc, room_id: salas[sala]!.id,
    scheduled_at: emSP(hoje, hora), duration_min: dur, price: preco, status, source: 'INTERNAL',
  })
  await inserir('appointments', [
    ag(c(0), ana!, toxina!, '09:00', 45, 1200, 'COMPLETED', 0),
    ag(mariana, ana!, labial!, '10:00', 60, 1500, 'IN_PROGRESS', 0),
    ag(c(1), ana!, bio!, '11:30', 60, 1800, 'CONFIRMED', 0),
    ag(c(2), ana!, toxina!, '14:00', 45, 1200, 'CONFIRMED', 0),
    ag(c(3), ana!, rede.outra.procedureId, '15:30', 30, 0, 'SCHEDULED', 0),
    ag(c(4), bianca!, peeling!, '09:30', 45, 350, 'COMPLETED', 1),
    ag(c(5), bianca!, limpeza!, '11:00', 60, 220, 'CONFIRMED', 1),
    ag(c(6), bianca!, labial!, '13:30', 60, 1500, 'SCHEDULED', 1),
    ag(c(7), bianca!, limpeza!, '16:00', 60, 220, 'SCHEDULED', 1),
    ag(c(8), camila!, drenagem!, '08:30', 50, 180, 'COMPLETED', 2),
    ag(c(9), camila!, drenagem!, '10:30', 50, 180, 'CONFIRMED', 2),
    ag(c(10), camila!, limpeza!, '14:30', 60, 220, 'SCHEDULED', 2),
  ], 'agenda de hoje')
  // O histórico da Mariana (a ficha).
  await inserir('appointments', [
    { ...ag(mariana, ana!, toxina!, '10:00', 45, 1200, 'COMPLETED', 0), scheduled_at: emSP(diasAtras(28), '10:00') },
    { ...ag(mariana, bianca!, limpeza!, '15:00', 60, 220, 'COMPLETED', 1), scheduled_at: emSP(diasAtras(14), '15:00') },
    // O retorno marcado (o portal mostra o próximo horário).
    { ...ag(mariana, bianca!, limpeza!, '15:00', 60, 0, 'CONFIRMED', 1), scheduled_at: emSP(diasAtras(-4), '15:00') },
  ], 'histórico da Mariana')

  // O pacote da Mariana.
  const [pacote] = await inserir('service_packages', { tenant_id: tenantId, procedure_id: limpeza, name: 'Limpeza de pele · 5 sessões', total_sessions: 5, price: 900, validity_days: 180 }, 'pacote')
  pacoteId = pacote!.id
  await inserir('client_packages', { client_id: mariana, package_id: pacoteId, branch_id: branchId, total_sessions: 5, used_sessions: 2, price: 900, purchased_at: emSP(diasAtras(30), '12:00') }, 'pacote da Mariana')

  // O financeiro do mês: as receitas dos atendimentos e as despesas da casa.
  const receitas: [string, number, string, string][] = [
    ['Toxina botulínica', 1200, 'CREDIT_CARD', 'Procedimentos'], ['Preenchimento labial', 1500, 'PIX', 'Procedimentos'],
    ['Bioestimulador de colágeno', 1800, 'CREDIT_CARD', 'Procedimentos'], ['Limpeza de pele · 5 sessões', 900, 'PIX', 'Pacotes'],
    ['Peeling químico', 350, 'DEBIT_CARD', 'Procedimentos'], ['Toxina botulínica', 1200, 'PIX', 'Procedimentos'],
    ['Drenagem linfática', 180, 'PIX', 'Procedimentos'], ['Preenchimento labial', 1500, 'CREDIT_CARD', 'Procedimentos'],
    ['Bioestimulador de colágeno', 1800, 'PIX', 'Procedimentos'], ['Limpeza de pele', 220, 'CASH', 'Procedimentos'],
    ['Toxina botulínica', 1200, 'CREDIT_CARD', 'Procedimentos'], ['Peeling químico', 350, 'PIX', 'Procedimentos'],
  ]
  const diaDoMes = Number(hoje.slice(8, 10))
  const dia = (i: number) => `${hoje.slice(0, 8)}${String(Math.max(1, Math.min(diaDoMes, 1 + (i * 3) % Math.max(diaDoMes, 1)))).padStart(2, '0')}`
  const linhas = [
    ...receitas.flatMap(([descricao, valor, forma, categoria], i) => [0, 1].map(k => ({
      branch_id: branchId, type: 'INCOME', category: categoria, description: descricao, amount: valor, payment_method: forma,
      is_paid: true, paid_at: emSP(dia(i + k * 5), '12:00'), ...(k === 0 && i < 2 ? { client_id: mariana } : {}), due_date: emSP(dia(i + k * 5), '12:00'), created_by: 'e2e-capturas',
    }))),
    ...([['Aluguel', 6500, 'Aluguel'], ['Produtos e insumos', 4200, 'Produtos'], ['Anúncios', 1500, 'Marketing'], ['Energia e internet', 690, 'Contas']] as const)
      .map(([descricao, valor, categoria], i) => ({
        branch_id: branchId, type: 'EXPENSE', category: categoria, description: descricao, amount: valor, payment_method: 'PIX',
        is_paid: true, paid_at: emSP(dia(i * 4), '09:00'), due_date: emSP(dia(i * 4), '09:00'), created_by: 'e2e-capturas',
      })),
  ]
  await inserir('financial_transactions', linhas, 'financeiro do mês')

  // O planejador de injetáveis da Mariana: toxina no terço superior.
  const pontos = [
    [0.44, 0.24], [0.5, 0.23], [0.56, 0.24], [0.47, 0.30], [0.53, 0.30], [0.5, 0.33],
    [0.34, 0.37], [0.33, 0.40], [0.66, 0.37], [0.67, 0.40],
  ].map(([x, y], i) => ({ id: `p${i}`, x, y, product: 'Toxina botulínica', dose: i < 3 ? 4 : i < 6 ? 5 : 3, unit: 'UI', applied: null, view: 'rosto_f' }))
  const [mapa] = await inserir('injectable_maps', { tenant_id: tenantId, client_id: mariana, branch_id: branchId, name: 'Toxina · terço superior', view: 'rosto_f', points: pontos }, 'planejamento')
  mapaId = mapa!.id

  // Uma automação de boas-vindas.
  const [auto] = await inserir('automations', {
    tenant_id: tenantId, nome: 'Boas-vindas à cliente nova', status: 'ATIVA', gatilhos: ['cliente.criado'],
    grafo: {
      nos: [
        { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, config: { evento: 'cliente.criado' } },
        { id: 'c1', tipo: 'condicao.se', pos: { x: 280, y: 0 }, config: { grupo: { juncao: 'e', regras: [{ campo: 'cliente.telefone', operador: 'preenchido' }] } } },
        { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 560, y: -90 }, config: { alvo: 'usuario', alvoId: rede.dono.userId, titulo: 'Cliente nova: dar as boas-vindas', corpo: '{{cliente.nome}} · {{cliente.telefone}}' } },
        { id: 'a2', tipo: 'acao.notificar_equipe', pos: { x: 560, y: 90 }, config: { alvo: 'usuario', alvoId: rede.dono.userId, titulo: 'Completar o telefone da cliente nova', corpo: '{{cliente.nome}}' } },
      ],
      ligacoes: [{ id: 'l1', de: 'g1', para: 'c1' }, { id: 'l2', de: 'c1', para: 'a1', saida: 'sim' }, { id: 'l3', de: 'c1', para: 'a2', saida: 'nao' }],
    },
  }, 'automação')
  automacaoId = auto!.id

  // Um número de WhatsApp no ar (de mentira: nada sai dele), senão o inbox avisa
  // que o canal não está conectado.
  const [numero] = await inserir('whatsapp_numbers', { tenant_id: tenantId, provider: 'official', label: 'WhatsApp da clínica', phone_e164: '5511981000099', phone_number_id: 'e2e-capturas-do-site', waba_id: 'e2e-capturas-do-site', is_active: true, is_default: true, config: { provider: 'official', phoneNumberId: 'e2e-capturas-do-site', wabaId: 'e2e-capturas-do-site', accessToken: 'e2e', modo: 'cloud_api' } }, 'número de WhatsApp')

  // As conversas do WhatsApp.
  const agora = Date.now()
  const conversasDaDemo: { cli: string; nome: string; i: number; msgs: [string, string][] }[] = [
    { cli: mariana, nome: 'Mariana Costa', i: 0, msgs: [
      ['inbound', 'Oi! Vi o anúncio do preenchimento labial. Vocês têm horário essa semana?'],
      ['outbound', 'Oi, Mariana! Temos sim 😊 A Dra. Ana tem quinta às 10h ou sexta às 15h30.'],
      ['inbound', 'Quinta às 10h é perfeito!'],
      ['outbound', 'Agendado: quinta, 10h, com a Dra. Ana Lima. Vou te mandar o termo para assinar pelo celular.'],
      ['inbound', 'Assinei aqui. Preciso ir de jejum?'],
      ['outbound', 'Não precisa! Só evite álcool nas 24h antes. Te esperamos ✨'],
    ] },
    { cli: c(1), nome: 'Juliana Martins', i: 1, msgs: [['inbound', 'Bom dia! Confirmo meu horário das 11h30.']] },
    { cli: c(5), nome: 'Renata Barbosa', i: 5, msgs: [['inbound', 'Quanto fica o pacote de limpeza de pele?'], ['outbound', 'O pacote de 5 sessões sai por R$ 900, em até 3x.']] },
    { cli: c(6), nome: 'Tatiane Ribeiro', i: 6, msgs: [['inbound', 'Consigo remarcar para a semana que vem?']] },
    { cli: c(2), nome: 'Larissa Gomes', i: 2, msgs: [['outbound', 'Larissa, seu retorno da toxina está chegando! Quer agendar?'], ['inbound', 'Quero sim, pode ser dia 20?']] },
  ]
  for (const [ordem, cv] of conversasDaDemo.entries()) {
    const [contato] = await inserir('contacts', { tenant_id: tenantId, name: cv.nome, phone: fone(cv.i) }, 'contato')
    const fim = agora - ordem * 23 * 60_000
    const ultima = cv.msgs.at(-1)!
    const [conversa] = await inserir('conversations', {
      tenant_id: tenantId, branch_id: branchId, client_id: cv.cli, contato_id: contato!.id, channel: 'whatsapp', status: 'open', whatsapp_number_id: numero!.id, provider: 'official',
      contact_name: cv.nome, contact_phone: fone(cv.i), last_message: ultima[1], last_message_direction: ultima[0],
      last_message_at: new Date(fim).toISOString(), unread_count: ultima[0] === 'inbound' ? (ordem === 0 ? 0 : 1) : 0,
    }, 'conversa')
    conversas.push(conversa!.id)
    if (ordem === 0) conversaAberta = conversa!.id
    await inserir('messages', cv.msgs.map(([direction, content], k) => ({
      conversation_id: conversa!.id, tenant_id: tenantId, direction, content, channel: 'whatsapp', status: direction === 'outbound' ? 'read' : 'delivered',
      whatsapp_number_id: numero!.id, is_read: true, sent_by_name: direction === 'outbound' ? 'Helena Duarte' : null,
      created_at: new Date(fim - (cv.msgs.length - 1 - k) * 4 * 60_000).toISOString(),
    })), 'mensagens')
  }

  // Os termos: assinados e a caminho. Todo documento nasce de um modelo
  // (a versão dele), como na clínica.
  const modelos = new Map<string, { template_id: string; template_version_id: string }>()
  for (const titulo of ['Termo de consentimento · Preenchimento labial', 'Termo de consentimento · Toxina botulínica', 'Termo de consentimento · Bioestimulador de colágeno']) {
    const [m] = await inserir('document_templates', { tenant_id: tenantId, name: titulo, kind: 'TERMO', source: 'EDITOR', moment: 'AGENDAMENTO', enforcement: 'BLOQUEIA', current_version: 1 }, 'modelo de termo')
    const [v] = await inserir('document_template_versions', { tenant_id: tenantId, template_id: m!.id, version: 1, source: 'EDITOR', body_markup: titulo }, 'versão do modelo')
    modelos.set(titulo, { template_id: m!.id, template_version_id: v!.id })
  }
  const doc = (cli: string, titulo: string, status: string, dias: number) => ({
    ...modelos.get(titulo)!,
    tenant_id: tenantId, branch_id: branchId, client_id: cli, kind: 'TERMO', source: 'EDITOR', title: titulo,
    moment: 'AGENDAMENTO', enforcement: 'BLOQUEIA', status, content_text: titulo,
    ...(status === 'ASSINADO' ? { signed_at: emSP(diasAtras(dias), '10:20') } : {}),
  })
  await inserir('issued_documents', [
    doc(mariana, 'Termo de consentimento · Preenchimento labial', 'ASSINADO', 0),
    doc(mariana, 'Termo de consentimento · Toxina botulínica', 'ASSINADO', 28),
    doc(c(1), 'Termo de consentimento · Bioestimulador de colágeno', 'PENDENTE', 0),
    doc(c(2), 'Termo de consentimento · Toxina botulínica', 'ASSINADO', 2),
    doc(c(6), 'Termo de consentimento · Preenchimento labial', 'PENDENTE', 0),
    doc(c(0), 'Termo de consentimento · Toxina botulínica', 'ASSINADO', 0),
  ], 'termos')
})

test.afterAll(async () => {
  test.setTimeout(300_000)
  if (!rede) return
  const { tenantId, branchId } = rede.outra
  await db.from('tenants').update({ name: nomeOriginal || '[e2e] Outra rede site' }).eq('id', tenantId)
  await db.from('messages').delete().in('conversation_id', conversas)
  await db.from('leads').delete().eq('tenant_id', tenantId)
  await db.from('conversations').delete().in('id', conversas)
  await db.from('contacts').delete().eq('tenant_id', tenantId)
  await db.from('whatsapp_number_users').delete().in('whatsapp_number_id', ((await db.from('whatsapp_numbers').select('id').eq('tenant_id', tenantId)).data ?? []).map(n => n.id))
  await db.from('whatsapp_numbers').delete().eq('tenant_id', tenantId)
  await db.from('financial_transactions').delete().eq('branch_id', branchId)
  await db.from('injectable_maps').delete().eq('tenant_id', tenantId)
  await db.from('automation_runs').delete().eq('automation_id', automacaoId)
  await db.from('automations').delete().eq('tenant_id', tenantId)
  await db.from('client_packages').delete().eq('package_id', pacoteId)
  const falhas = await apagarClientes(clientes)
  for (const f of falhas) console.warn(`[capturas] não apagou ${f.o_que}: ${f.erro}`)
  await portal?.limpar()
  await db.from('service_packages').delete().eq('tenant_id', tenantId)
  await db.from('rooms').delete().eq('branch_id', branchId)
  await db.from('copilot_mensagens').delete().eq('tenant_id', tenantId)
  await db.from('copilot_conversas').delete().eq('tenant_id', tenantId)
  await db.from('copilot_uso_mensal').delete().eq('tenant_id', tenantId)
  await rede.limpar(async () => { for (const m of membrosExtras) await m.limpar() })
  await falsa?.fechar()
})

async function comoDona(browser: import('@playwright/test').Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: rede.dono.estado, viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: viewport.width < 500 ? 3 : 1.5 })
  return { ctx, page: await ctx.newPage() }
}

test('agenda do dia', async ({ browser }) => {
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto(`/${portal.slug}/agenda`)
  await expect(page.getByText('Mariana Costa').filter({ visible: true }).first()).toBeVisible()
  await fotografar(page, 'agenda')
  await ctx.close()
})

test('inbox, no computador e no celular', async ({ browser }) => {
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto(`/admin/inbox?c=${conversaAberta}`)
  await expect(page.getByText('Te esperamos').filter({ visible: true }).first()).toBeVisible()
  await fotografar(page, 'inbox', true)
  await ctx.close()

  const cel = await comoDona(browser, CELULAR)
  await cel.page.goto(`/admin/inbox?c=${conversaAberta}`)
  await expect(cel.page.getByText('Te esperamos').filter({ visible: true }).first()).toBeVisible()
  await fotografar(cel.page, 'inbox-celular')
  await cel.ctx.close()
})

test('ficha da cliente', async ({ browser }) => {
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto(`/admin/clients/${mariana}`)
  await expect(page.getByText('Mariana Costa').first()).toBeVisible()
  await fotografar(page, 'ficha', true)
  await ctx.close()
})

test('planejador de injetáveis', async ({ browser }) => {
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto(`/admin/injetaveis/${mapaId}`)
  await expect(page.locator('svg image').first()).toBeVisible()
  await fotografar(page, 'injetaveis', true)
  await ctx.close()
})

test('financeiro do mês', async ({ browser }) => {
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto('/admin/financeiro')
  await expect(page.getByText('Receita total').filter({ visible: true }).first()).toBeVisible()
  await fotografar(page, 'financeiro', true)
  await ctx.close()
})

test('editor de automação', async ({ browser }) => {
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto(`/admin/automacoes/${automacaoId}`)
  await expect(page.getByText('Quando acontecer').filter({ visible: true }).last()).toBeVisible()
  await fotografar(page, 'automacao', true)
  await ctx.close()
})

test('termos e contratos', async ({ browser }) => {
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto('/admin/documentos')
  await expect(page.getByText('Mariana Costa').filter({ visible: true }).first()).toBeVisible()
  await fotografar(page, 'documento', true)
  await ctx.close()
})

test('Copilot', async ({ browser }) => {
  falsa.zerar()
  falsa.roteiro.push({ texto: 'Amanhã a **Dra. Ana Lima** tem estes horários livres:\n\n- 10:00 — 45 min\n- 11:30 — 60 min\n- 15:00 — 45 min\n\nQuer que eu agende a toxina da Mariana Costa em algum deles?' })
  const { ctx, page } = await comoDona(browser, COMPUTADOR)
  await page.goto(`/${portal.slug}/agenda`)
  await page.getByRole('button', { name: 'Copilot', exact: true }).click()
  const painel = page.getByRole('dialog', { name: 'Copilot' })
  await painel.getByRole('textbox', { name: 'Mensagem para o Copilot' }).fill('Quais horários a Dra. Ana tem livres amanhã?')
  await painel.getByRole('button', { name: 'Enviar' }).click()
  await expect(painel.getByText('Quer que eu agende')).toBeVisible({ timeout: 30_000 })
  await fotografar(page, 'copilot', true)
  await ctx.close()
})

test('portal da cliente no celular', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: portal.estado, viewport: CELULAR, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`/${portal.slug}/cliente`)
  await expect(page.getByText(/Mariana/).filter({ visible: true }).first()).toBeVisible()
  await fotografar(page, 'portal-celular')
  await ctx.close()
})
