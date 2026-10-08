import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import { apagarAgendamentos, apagarClientes } from './apoio/limpeza'
import { entrarComo } from './apoio/suporte'

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
 * Numa rede `[e2e]` própria, com o atendente criado pelo teste. Desde
 * 2026-10-06 o painel (host do suporte) e a conta do membro (host da clínica)
 * são origens diferentes: a conta abre numa aba nova, e o "Sair" volta ao
 * painel no host do suporte.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')
const SUP = () => urlDaPlataforma('suporte')

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
  test.setTimeout(600_000)
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
  // Só os da CLÍNICA: o mesmo contexto tem a sessão do atendente no host do suporte.
  const pedacos = (await ctx.cookies(process.env.E2E_BASE_URL))
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

/** Entra pela tela: detalhe da rede no painel → "Entrar como" → motivo → Entrar → aba nova na clínica. */
async function entrar(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  return entrarComo(browser, f!.atendente.estado, f!.outra.tenantId, `Alvo sialvo${marca}`)
}

// --- provas ---------------------------------------------------------------------

test.describe.serial('suporte: entrar como', () => {
  test('sem autorização da clínica, não entra', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.atendente.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`${SUP()}/redes/${f!.outra.tenantId}`)
      await expect(p.locator('tr', { hasText: `Alvo sialvo${marca}` }).getByText('Sem autorização da clínica para entrar')).toBeVisible()
      const r = await p.request.post(`${SUP()}/api/entrar`, {
        form: { tenantId: f!.outra.tenantId, userId: f!.alvo.userId, motivo: 'tentando sem autorização' }, maxRedirects: 0,
        // O Origin que o formulário do painel leva (sem ele, a rota recusa antes).
        headers: { origin: new URL(SUP()).origin },
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
      const r = await ctx.request.post(`${SUP()}/api/entrar`, {
        form: { tenantId: f!.outra.tenantId, userId: f!.alvo.userId, motivo: 'tentando com autorização vencida' }, maxRedirects: 0,
        headers: { origin: new URL(SUP()).origin },
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

  // O risco aceito que virou trava (2026-10-08): o atendente tem o token da
  // sessão no navegador e falava direto com o PostgREST — gravava o que a RLS
  // deixa ao membro, fora do registro de acesso. Agora a sessão de suporte não
  // grava pelo PostgREST (política RESTRICTIVE `suporte_sem_escrita`); o que
  // ela muda, muda pelo app, que registra.
  test('o token da sessão de suporte NÃO grava pelo PostgREST; o do próprio membro grava', async () => {
    const patch = (token: string, notas: string) => fetch(`${URL_SUPA}/rest/v1/clients?id=eq.${f!.clienteId}`, {
      method: 'PATCH',
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ notes: notas }),
    }).then(async r => { const c = await r.json().catch(() => null); return Array.isArray(c) ? c.length : 0 })
    const notas = async () => (await db().from('clients').select('notes').eq('id', f!.clienteId).single()).data!.notes as string | null

    const doSuporte = (await sessaoDoNavegador(sup!.ctx)).access_token
    expect(await patch(doSuporte, `escrito pelo suporte ${marca}`), 'nenhuma linha').toBe(0)
    expect(await notas()).not.toBe(`escrito pelo suporte ${marca}`)
    // Controle: o membro, com a sessão DELE, grava (a RLS deixa).
    expect(await patch(f!.alvo.accessToken, `escrito pelo membro ${marca}`), 'o membro grava').toBe(1)
    expect(await notas()).toBe(`escrito pelo membro ${marca}`)
  })

  test('na clínica, nada do atendente: nem a sessão dele, nem cookie de volta, nem o painel', async () => {
    const naClinica = await sup!.ctx.cookies(process.env.E2E_BASE_URL)
    expect(naClinica.map(c => c.name)).not.toContain('bellaris_suporte_volta')
    const r = await sup!.page.goto('/suporte/redes')
    expect(r?.status()).toBe(404)
  })

  test('"Sair" encerra a sessão e devolve o atendente ao painel; o token antigo morre', async () => {
    const capturada = await sessaoDoNavegador(sup!.ctx)
    await sup!.page.goto('/admin/dashboard')
    await sup!.page.getByRole('link', { name: 'Sair' }).click()
    // De volta ao painel, NO HOST DO SUPORTE, onde o atendente segue logado.
    await expect(sup!.page).toHaveURL(`${SUP()}/redes/${f!.outra.tenantId}`, { timeout: 30_000 })
    await expect(sup!.page.getByRole('heading', { level: 1 })).toBeVisible()
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
    await expect(sup.page).toHaveURL(new RegExp(`^${SUP()}/redes/`), { timeout: 30_000 })
    expect(await rest(capturada.access_token, `clients?select=id&id=eq.${f!.clienteId}`)).toHaveLength(0)
    expect(await renovar(capturada.refresh_token)).toBe(false)
    await sup.ctx.close()
    sup = null
  })

  test('o aviso vem do servidor; vencer o prazo encerra e devolve ao painel', async ({ browser }) => {
    await autorizar(browser)
    sup = await entrar(browser)
    await sup.page.reload()
    await expect(sup.page.getByRole('status', { name: 'Modo suporte' })).toBeVisible()

    const [sessao] = await sessoesAtivas()
    await db().from('support_sessions').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', sessao!.id)
    // O servidor guarda a sessão por até 15 s; depois disso, vencida, cai.
    // Já voltou ao painel (o dashboard se atualiza sozinho e pode cair entre
    // duas voltas)? Então não navega de novo: o `goto` tirava o atendente do
    // painel e o levava ao login da clínica, já sem sessão (completa de 2026-10-08).
    await expect.poll(async () => {
      if (sup!.page.url().startsWith(SUP())) return sup!.page.url()
      await sup!.page.goto('/admin/dashboard')
      return sup!.page.url()
    }, { timeout: 45_000, intervals: [5_000] }).toMatch(new RegExp(`^${SUP()}/`))
    await sup.ctx.close()
    sup = null
  })

  // Achado na completa de 2026-10-08 (o trace do CI): a sessão venceu numa
  // navegação DENTRO do app (o pedido RSC do Next), e o fim rodou nesse pedido
  // — encerrou e apagou os cookies; o Next refez o pedido como navegação
  // inteira, já sem sessão, e o atendente caiu no /login da clínica.
  test('o pedido interno do Next (RSC, prefetch) ao fim NÃO encerra: só a navegação de verdade', async ({ browser }) => {
    await autorizar(browser)
    sup = await entrar(browser)
    // (O Next acerta o `_rsc` com um 307 para o hash dele; o pedido segue.)
    const r = await sup.page.request.get('/auth/suporte-fim?motivo=venceu&_rsc=x', {
      headers: { rsc: '1' },
    })
    expect(r.status()).toBe(200)
    expect(r.url(), 'não foi levado ao painel por este pedido').toMatch(new RegExp(`^${process.env.E2E_BASE_URL}/auth/suporte-fim`))
    expect(r.headers()['content-type'] ?? '', 'e não é RSC: o Next faz a navegação inteira').not.toContain('text/x-component')
    expect(await sessoesAtivas(), 'a sessão segue').toHaveLength(1)
    // A navegação inteira, sim, encerra e devolve ao painel.
    await sup.page.goto('/auth/suporte-fim?motivo=venceu')
    await expect(sup.page).toHaveURL(new RegExp(`^${SUP()}/`), { timeout: 30_000 })
    expect(await sessoesAtivas()).toHaveLength(0)
    await sup.ctx.close()
    sup = null
  })

  test('vencer o prazo no meio de uma navegação pelo menu também devolve ao painel', async ({ browser }) => {
    await autorizar(browser)
    sup = await entrar(browser)
    await sup.page.goto('/admin/dashboard')
    const [sessao] = await sessoesAtivas()
    await db().from('support_sessions').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', sessao!.id)
    // Clicando no menu (navegação do Next, não `goto`), até o cache de 15 s cair.
    await expect.poll(async () => {
      const p = sup!.page
      if (!p.url().startsWith(process.env.E2E_BASE_URL!)) return p.url()
      const destino = p.url().includes('/admin/agenda') ? 'Dashboard' : 'Agenda'
      await p.locator('aside nav').getByText(destino, { exact: true }).first().click({ timeout: 3_000 }).catch(() => {})
      await p.waitForLoadState('networkidle').catch(() => {})
      return p.url()
    }, { timeout: 60_000, intervals: [4_000] }).toMatch(new RegExp(`^${SUP()}/`))
    await sup.ctx.close()
    sup = null
  })
})
