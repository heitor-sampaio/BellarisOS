import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import { apagarAgendamentos, apagarClientes } from './apoio/limpeza'

/**
 * "Entrar como" um membro — o suporte com impersonificação (fase 2, 2026-10-03).
 *
 * As regras que este arquivo prova:
 *  - sem autorização vigente da clínica (ou com ela vencida), não entra;
 *  - com ela, entra numa sessão REAL do membro, com o aviso fixo na topbar;
 *  - o que faz fica registrado "via suporte" (histórico, eventos, acessos);
 *  - prontuário fora (pela tela E pelo PostgREST com o token), salvo autorização;
 *  - nada sai para o paciente; senha e fatores da conta não mudam;
 *  - sair, revogar e vencer encerram de verdade: o token capturado deixa de
 *    alcançar a rede e o refresh deixa de valer;
 *  - apagar cookie não tira o aviso.
 *
 * Numa rede `[e2e]` própria, com o atendente criado pelo teste.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const URL_SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ANAMNESE = `ANAMNESE-SUPORTE-${marca}`

interface Fx {
  outra: OutraRede; alvo: MembroDeTeste; gestor: MembroDeTeste; atendente: AtendenteDeTeste
  clienteId: string; agendamentoId: string; conversaId: string
}
let f: Fx | null = null
const criado: { outra?: OutraRede; membros: MembroDeTeste[]; atendente?: AtendenteDeTeste; agendamentos: string[]; clientes: string[]; conversas: string[] } =
  { membros: [], agendamentos: [], clientes: [], conversas: [] }
let sup: { ctx: BrowserContext; page: Page } | null = null

test.beforeAll(async () => {
  test.setTimeout(240_000)
  const b = db()
  const outra = await criarOutraRede(`si${marca}`)
  criado.outra = outra
  const alvo = await criarMembro(`sialvo${marca}`, {
    tenant: outra.tenantId, rotulo: 'Alvo',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  criado.membros.push(alvo)
  const gestor = await criarMembro(`sigest${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  criado.membros.push(gestor)
  const atendente = await criarAtendente(`si${marca}`, { papel: 'SUPORTE' })
  criado.atendente = atendente

  const clienteId = await outra.criarCliente('Paciente Suporte')
  const { error: eMr } = await b.from('medical_records')
    .upsert({ client_id: clienteId, general_anamnesis: { queixa: ANAMNESE } }, { onConflict: 'client_id' })
  expect(eMr).toBeNull()
  const { data: ap, error: eAp } = await b.from('appointments').insert({
    branch_id: outra.branchId, client_id: clienteId, procedure_id: outra.procedureId,
    professional_id: outra.professionalId, status: 'SCHEDULED', source: 'INTERNAL',
    scheduled_at: new Date(Date.now() + 24 * 3600_000).toISOString(), duration_min: 30, price: 0,
  }).select('id').single<{ id: string }>()
  expect(eAp).toBeNull()
  criado.agendamentos.push(ap!.id)
  const fone = '5548' + String(Date.now()).slice(-9)
  const { data: conv, error: eCv } = await b.from('conversations').insert({
    tenant_id: outra.tenantId, channel: 'whatsapp', status: 'open', provider: 'uazapi',
    contact_name: `[e2e] Conversa suporte ${marca}`, contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
    last_message_at: new Date().toISOString(), last_message: 'oi',
  }).select('id').single<{ id: string }>()
  expect(eCv).toBeNull()
  criado.conversas.push(conv!.id)

  f = { outra, alvo, gestor, atendente, clienteId, agendamentoId: ap!.id, conversaId: conv!.id }
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  const anote = (o: string, e: { message: string } | null) => { if (e) falhas.push(`${o}: ${e.message}`) }
  if (sup) await sup.ctx.close()
  if (criado.outra) {
    const t = criado.outra.tenantId
    anote('sessões', (await b.from('support_sessions').delete().eq('tenant_id', t)).error)
    anote('autorizações', (await b.from('support_grants').delete().eq('tenant_id', t)).error)
    anote('registros', (await b.from('platform_audit_log').delete().eq('tenant_id', t)).error)
  }
  await apagarAgendamentos(criado.agendamentos)
  for (const c of criado.conversas) {
    anote('mensagens', (await b.from('messages').delete().eq('conversation_id', c)).error)
    anote('conversas', (await b.from('conversations').delete().eq('id', c)).error)
  }
  if (criado.outra) anote('contatos', (await b.from('contacts').delete().eq('tenant_id', criado.outra.tenantId)).error)
  for (const m of criado.membros) {
    anote('notificações', (await b.from('user_notifications').delete().eq('user_id', m.userId)).error)
    await m.limpar()
  }
  if (criado.atendente) await criado.atendente.limpar()
  if (criado.clientes.length) await apagarClientes(criado.clientes)
  if (criado.outra) await criado.outra.limpar()
  expect(falhas).toEqual([])
})

// --- apoio --------------------------------------------------------------------

/** A sessão do Supabase guardada nos cookies do navegador (o token "capturado"). */
async function sessaoDoNavegador(ctx: BrowserContext): Promise<{ access_token: string; refresh_token: string }> {
  const pedacos = (await ctx.cookies())
    .filter(c => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  let valor = pedacos.map(c => c.value).join('')
  if (valor.startsWith('base64-')) valor = Buffer.from(valor.slice(7), 'base64url').toString('utf8')
  return JSON.parse(valor)
}

async function rest(token: string, caminho: string): Promise<unknown[]> {
  const r = await fetch(`${URL_SUPA}/rest/v1/${caminho}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  const corpo = await r.json().catch(() => [])
  return Array.isArray(corpo) ? corpo : []
}

async function renovar(refresh: string): Promise<boolean> {
  const r = await fetch(`${URL_SUPA}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }),
  })
  return r.ok
}

async function trocarSenha(token: string, senha: string): Promise<number> {
  const r = await fetch(`${URL_SUPA}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ password: senha }),
  })
  return r.status
}

async function sessoesAtivas(): Promise<{ id: string; status: string }[]> {
  const { data } = await db().from('support_sessions').select('id, status').eq('tenant_id', f!.outra.tenantId).eq('status', 'ativa')
  return (data ?? []) as { id: string; status: string }[]
}

async function autorizar(browser: Browser, clinico = false) {
  const ctx = await browser.newContext({ storageState: f!.gestor.estado })
  try {
    const p = await ctx.newPage()
    const r = await chamarAcao(p, 'actions/suporte-autorizacao.ts', 'autorizarSuporte', '/admin/settings',
      [{ userId: f!.alvo.userId, horas: 24, incluiClinico: clinico }])
    expect(r.texto, 'o gestor autoriza').toContain('"ok":true')
  } finally { await ctx.close() }
}

/** Entra pela tela: detalhe da rede → "Entrar como" → motivo → Entrar. */
async function entrar(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: f!.atendente.estado })
  const page = await ctx.newPage()
  await page.goto(`/suporte/redes/${f!.outra.tenantId}`)
  const linha = page.locator('tr', { hasText: `Alvo sialvo${marca}` })
  await linha.getByRole('button', { name: 'Entrar como' }).click()
  await linha.getByLabel('Motivo do acesso').fill('Conferir a agenda que a clínica relatou')
  await linha.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 })
  await expect(page.getByRole('status', { name: 'Modo suporte' })).toBeVisible()
  return { ctx, page }
}

// --- provas ---------------------------------------------------------------------

test.describe.serial('suporte: entrar como', () => {
  test('sem autorização da clínica, não entra', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.atendente.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/suporte/redes/${f!.outra.tenantId}`)
      await expect(p.locator('tr', { hasText: `Alvo sialvo${marca}` }).getByText('Sem autorização da clínica para entrar')).toBeVisible()
      const r = await p.request.post('/api/suporte/entrar', {
        form: { tenantId: f!.outra.tenantId, userId: f!.alvo.userId, motivo: 'tentando sem autorização' }, maxRedirects: 0,
      })
      expect(r.status()).toBe(303)
      expect(new URL(r.headers().location ?? 'http://x').searchParams.get('erro') ?? '').toContain('Sem autorização vigente')
    } finally { await ctx.close() }
    expect(await sessoesAtivas()).toHaveLength(0)
  })

  test('autorização vencida não vale', async ({ browser }) => {
    const { data: g, error } = await db().from('support_grants').insert({
      tenant_id: f!.outra.tenantId, target_user_id: f!.alvo.userId, via: 'configuracoes',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const ctx = await browser.newContext({ storageState: f!.atendente.estado })
    try {
      const r = await ctx.request.post('/api/suporte/entrar', {
        form: { tenantId: f!.outra.tenantId, userId: f!.alvo.userId, motivo: 'tentando com autorização vencida' }, maxRedirects: 0,
      })
      expect(new URL(r.headers().location ?? 'http://x').searchParams.get('erro') ?? '').toContain('Sem autorização vigente')
    } finally { await ctx.close() }
    expect(await sessoesAtivas()).toHaveLength(0)
    await db().from('support_grants').update({ revoked_at: new Date().toISOString() }).eq('id', g!.id)
  })

  test('com autorização, entra na conta com o aviso fixo — e a clínica é avisada', async ({ browser }) => {
    await autorizar(browser)
    sup = await entrar(browser)
    expect(await sessoesAtivas()).toHaveLength(1)
    const { data: avisos } = await db().from('user_notifications').select('id').eq('user_id', f!.alvo.userId).eq('type', 'suporte.acesso')
    expect((avisos ?? []).length).toBeGreaterThan(0)
  })

  test('o que o suporte faz fica registrado "via suporte"', async () => {
    const r = await chamarAcao(sup!.page, 'actions/appointments.ts', 'updateAppointmentStatus', '/admin/agenda',
      [f!.agendamentoId, 'CONFIRMED', 'x'])
    expect(r.status).toBe(200)
    const [sessao] = await sessoesAtivas()
    await expect.poll(async () => {
      const { data } = await db().from('appointment_history').select('changed_by_name').eq('appointment_id', f!.agendamentoId)
      return ((data ?? []) as { changed_by_name: string }[]).map(h => h.changed_by_name).join('|')
    }).toContain('(via suporte:')
    const { data: ev } = await db().from('domain_events').select('suporte_sessao_id, ator_nome')
      .eq('entidade_id', f!.agendamentoId).eq('nome', 'agendamento.confirmado')
    expect(ev?.[0]?.suporte_sessao_id).toBe(sessao!.id)
    const { data: acessos } = await db().from('support_access_log').select('path, action_id').eq('session_id', sessao!.id)
    expect((acessos ?? []).some(a => a.action_id)).toBe(true)
    expect((acessos ?? []).some(a => (a.path ?? '').includes('/admin/dashboard'))).toBe(true)
  })

  test('prontuário fora — na tela e pelo PostgREST com o token da sessão', async ({ browser }) => {
    await sup!.page.goto(`/admin/clients/${f!.clienteId}`)
    await expect(sup!.page.getByText('Paciente Suporte').first()).toBeVisible()
    expect(await sup!.page.content()).not.toContain(ANAMNESE)
    const token = (await sessaoDoNavegador(sup!.ctx)).access_token
    expect(await rest(token, `medical_records?select=id&client_id=eq.${f!.clienteId}`)).toHaveLength(0)
    // O resto da rede ele alcança (a sessão é a do membro):
    expect(await rest(token, `clients?select=id&id=eq.${f!.clienteId}`)).toHaveLength(1)
    // Controle: o próprio membro, com o token dele, vê o prontuário.
    expect(await rest(f!.alvo.accessToken, `medical_records?select=id&client_id=eq.${f!.clienteId}`)).toHaveLength(1)
    const ctx = await browser.newContext({ storageState: f!.alvo.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/admin/clients/${f!.clienteId}`)
      await expect(p.getByText('Paciente Suporte').first()).toBeVisible()
      expect(await p.content()).toContain(ANAMNESE)
    } finally { await ctx.close() }
  })

  test('nada sai para o paciente; senha e fatores da conta não mudam', async () => {
    const r = await chamarAcao(sup!.page, 'actions/inbox.ts', 'sendMessage', '/admin/inbox', [f!.conversaId, 'mensagem do suporte'])
    expect(r.texto).toContain('modo suporte')
    const { data: msgs } = await db().from('messages').select('id').eq('conversation_id', f!.conversaId)
    expect(msgs ?? []).toHaveLength(0)
    const token = (await sessaoDoNavegador(sup!.ctx)).access_token
    expect(await trocarSenha(token, `Nova-${marca}-x9!`)).not.toBe(200)
  })

  test('o atendente não abre o /suporte de dentro da conta do membro', async () => {
    await sup!.page.goto('/suporte/redes')
    await expect(sup!.page).not.toHaveURL(/\/suporte\//)
  })

  test('"Sair" encerra a sessão e devolve o atendente ao painel; o token antigo morre', async () => {
    const capturada = await sessaoDoNavegador(sup!.ctx)
    await sup!.page.goto('/admin/dashboard')
    await sup!.page.getByRole('link', { name: 'Sair' }).click()
    await expect(sup!.page).toHaveURL(new RegExp(`/suporte/redes/${f!.outra.tenantId}`), { timeout: 30_000 })
    expect(await sessoesAtivas()).toHaveLength(0)
    expect(await renovar(capturada.refresh_token), 'o refresh do membro gerado para o suporte morreu').toBe(false)
    expect(await rest(capturada.access_token, `clients?select=id&id=eq.${f!.clienteId}`), 'o token restante não alcança a rede').toHaveLength(0)
    // Controle da trava de senha: sem sessão de suporte, o próprio membro troca.
    expect(await trocarSenha(f!.alvo.accessToken, `Nova-${marca}-x9!`)).toBe(200)
    await sup!.ctx.close()
    sup = null
  })

  test('a clínica revoga no meio: a sessão cai na próxima tela', async ({ browser }) => {
    sup = await entrar(browser)
    const capturada = await sessaoDoNavegador(sup.ctx)
    const { data: g } = await db().from('support_grants').select('id').eq('target_user_id', f!.alvo.userId).is('revoked_at', null).single<{ id: string }>()
    const ctx = await browser.newContext({ storageState: f!.gestor.estado })
    try {
      const p = await ctx.newPage()
      const r = await chamarAcao(p, 'actions/suporte-autorizacao.ts', 'revogarAutorizacaoDeSuporte', '/admin/settings', [g!.id])
      expect(r.texto).toContain('"ok":true')
    } finally { await ctx.close() }
    await sup.page.goto(`/admin/clients/${f!.clienteId}`)
    await expect(sup.page).toHaveURL(/\/suporte\/redes\//, { timeout: 30_000 })
    expect(await rest(capturada.access_token, `clients?select=id&id=eq.${f!.clienteId}`)).toHaveLength(0)
    expect(await renovar(capturada.refresh_token)).toBe(false)
    await sup.ctx.close()
    sup = null
  })

  test('apagar cookie não tira o aviso; vencer o prazo encerra', async ({ browser }) => {
    await autorizar(browser)
    sup = await entrar(browser)
    // O atendente apaga o que pode: o cookie de volta. O aviso vem do servidor.
    await sup.ctx.clearCookies({ name: 'bellaris_suporte_volta' })
    await sup.page.reload()
    await expect(sup.page.getByRole('status', { name: 'Modo suporte' })).toBeVisible()

    const [sessao] = await sessoesAtivas()
    await db().from('support_sessions').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', sessao!.id)
    // O servidor guarda a sessão por até 15 s; depois disso, vencida, cai.
    await expect.poll(async () => {
      await sup!.page.goto('/admin/dashboard')
      return sup!.page.url()
    }, { timeout: 45_000, intervals: [5_000] }).toMatch(/\/login/)
    await sup.ctx.close()
    sup = null
  })
})
