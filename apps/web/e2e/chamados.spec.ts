import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Chamados de suporte (fase 3, 2026-10-03): o botão "Ajuda" da topbar e a
 * fila do /suporte.
 *
 * As regras que este arquivo prova:
 *  - o chamado nasce pela tela com o contexto (tela, quem) e, se a pessoa
 *    marcar, já autoriza o suporte a entrar por 72 h;
 *  - o suporte vê na fila, responde e grava nota interna; a resposta chega no
 *    sino de quem abriu, e a nota interna nunca sai para a clínica;
 *  - "Pedir autorização" deixa a decisão com a clínica;
 *  - o chamado é de quem abriu (e de quem administra a rede): o colega não o
 *    lê nem pela action;
 *  - o sinal da fila só é lido pela plataforma.
 *
 * Numa rede `[e2e]` própria, com o atendente criado pelo teste.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const URL_SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ASSUNTO = `A agenda não abre ${marca}`
const NOTA = `NOTA-INTERNA-${marca}`
const RESPOSTA = `Resposta do suporte ${marca}`
// 1×1 transparente: só o cabeçalho importa para o servidor.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

let outra: OutraRede | null = null
const membros: MembroDeTeste[] = []
let atendente: AtendenteDeTeste | null = null
let alvo: MembroDeTeste, colega: MembroDeTeste, gestor: MembroDeTeste
let chamadoId = ''

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`ch${marca}`)
  alvo = await criarMembro(`chalvo${marca}`, {
    tenant: outra.tenantId, rotulo: 'Alvo', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
  colega = await criarMembro(`chcol${marca}`, {
    tenant: outra.tenantId, rotulo: 'Colega', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  gestor = await criarMembro(`chgest${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  membros.push(alvo, colega, gestor)
  atendente = await criarAtendente(`ch${marca}`, { papel: 'SUPORTE' })
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  const anote = (o: string, e: { message: string } | null) => { if (e) falhas.push(`${o}: ${e.message}`) }
  if (outra) {
    const t = outra.tenantId
    const { data: arquivos } = await b.storage.from('suporte-anexos').list(t)
    if (arquivos?.length) anote('anexos', (await b.storage.from('suporte-anexos').remove(arquivos.map(a => `${t}/${a.name}`))).error)
    anote('sessões', (await b.from('support_sessions').delete().eq('tenant_id', t)).error)
    anote('autorizações', (await b.from('support_grants').delete().eq('tenant_id', t)).error)
    anote('chamados', (await b.from('support_tickets').delete().eq('tenant_id', t)).error)
    anote('registros', (await b.from('platform_audit_log').delete().eq('tenant_id', t)).error)
  }
  for (const m of membros) {
    anote('notificações', (await b.from('user_notifications').delete().eq('user_id', m.userId)).error)
    await m.limpar()
  }
  if (atendente) await atendente.limpar()
  if (outra) await outra.limpar()
  expect(falhas).toEqual([])
})

async function rest(token: string, caminho: string): Promise<unknown[]> {
  const r = await fetch(`${URL_SUPA}/rest/v1/${caminho}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  const corpo = await r.json().catch(() => [])
  return Array.isArray(corpo) ? corpo : []
}

test.describe.serial('chamados de suporte', () => {
  test('a clínica abre o chamado pela Ajuda, com print e autorização', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: alvo.estado })
    try {
      const page = await ctx.newPage()
      await page.goto('/admin/dashboard')
      await page.getByRole('button', { name: 'Ajuda', exact: true }).click()
      const janela = page.getByRole('dialog', { name: 'Ajuda' })
      await janela.getByRole('button', { name: 'Novo chamado' }).click()
      await janela.locator('input[name="assunto"]').fill(ASSUNTO)
      await janela.locator('textarea[name="corpo"]').fill('Cliquei na agenda e a tela ficou em branco.')
      await janela.locator('input[name="anexo"]').setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: PNG })
      await janela.getByLabel(/Autorizo o suporte/).check()
      await janela.getByRole('button', { name: 'Enviar' }).click()
      await expect(janela.getByRole('heading', { name: new RegExp(`· ${ASSUNTO}`) })).toBeVisible({ timeout: 20_000 })
      await expect(janela.getByText(/Acesso do suporte autorizado até/)).toBeVisible()
    } finally { await ctx.close() }

    const { data: t, error } = await db().from('support_tickets')
      .select('id, status, opened_by_user_id, contexto, grant_id').eq('tenant_id', outra!.tenantId).eq('assunto', ASSUNTO)
      .single<{ id: string; status: string; opened_by_user_id: string; contexto: Record<string, unknown>; grant_id: string | null }>()
    expect(error).toBeNull()
    chamadoId = t!.id
    expect(t!.status).toBe('aberto')
    expect(t!.opened_by_user_id).toBe(alvo.userId)
    // O contexto: a tela vem do navegador; quem, da sessão.
    expect(t!.contexto.pagina).toBe('/admin/dashboard')
    expect(String(t!.contexto.usuario)).toContain(`chalvo${marca}`)
    const { data: g } = await db().from('support_grants').select('ticket_id, via, target_user_id, revoked_at')
      .eq('id', t!.grant_id!).single<{ ticket_id: string; via: string; target_user_id: string; revoked_at: string | null }>()
    expect(g).toMatchObject({ ticket_id: chamadoId, via: 'chamado', target_user_id: alvo.userId, revoked_at: null })
    const { data: msgs } = await db().from('support_ticket_messages').select('author_kind, anexos').eq('ticket_id', chamadoId)
    expect(msgs).toHaveLength(1)
    expect((msgs![0]!.anexos as unknown[]).length).toBe(1)
  })

  test('o chamado é de quem abriu: o colega não o lê; quem administra a rede, sim', async ({ browser }) => {
    for (const [quem, ve] of [[colega, false], [gestor, true]] as const) {
      const ctx = await browser.newContext({ storageState: quem.estado })
      try {
        const p = await ctx.newPage()
        const r = await chamarAcao(p, 'actions/chamados.ts', 'verChamado', '/admin/dashboard', [chamadoId])
        if (ve) expect(r.texto).toContain(ASSUNTO)
        else { expect(r.texto).toContain('Chamado não encontrado'); expect(r.texto).not.toContain(ASSUNTO) }
      } finally { await ctx.close() }
    }
  })

  test('o sinal da fila só é lido pela plataforma', async () => {
    expect(await rest(atendente!.accessToken, 'support_signals?select=id')).toHaveLength(1)
    expect(await rest(alvo.accessToken, 'support_signals?select=id')).toHaveLength(0)
    expect(await rest(alvo.accessToken, `support_tickets?select=id&id=eq.${chamadoId}`)).toHaveLength(0)
    expect(await rest(alvo.accessToken, `support_ticket_messages?select=id&ticket_id=eq.${chamadoId}`)).toHaveLength(0)
  })

  test('o suporte vê na fila, grava nota interna e responde', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: atendente!.estado })
    try {
      const page = await ctx.newPage()
      await page.goto('/suporte/chamados')
      await page.getByRole('link', { name: new RegExp(ASSUNTO) }).click()
      await expect(page.getByRole('heading', { name: new RegExp(ASSUNTO) })).toBeVisible()
      // Com a autorização do chamado, o "Entrar como" está à mão.
      await expect(page.getByRole('button', { name: 'Entrar como' })).toBeVisible()

      await page.getByRole('button', { name: 'Nota interna' }).click()
      await page.locator('textarea[name="corpo"]').fill(NOTA)
      await page.getByRole('button', { name: 'Gravar nota' }).click()
      await expect(page.getByText(NOTA)).toBeVisible({ timeout: 20_000 })

      await page.getByRole('button', { name: 'Nota interna' }).click()
      await page.locator('textarea[name="corpo"]').fill(RESPOSTA)
      await page.getByRole('button', { name: 'Enviar' }).click()
      await expect(page.getByText(RESPOSTA)).toBeVisible({ timeout: 20_000 })
    } finally { await ctx.close() }

    const { data: t } = await db().from('support_tickets').select('status, assigned_staff_id, last_staff_reply_at')
      .eq('id', chamadoId).single<{ status: string; assigned_staff_id: string; last_staff_reply_at: string | null }>()
    expect(t!.status).toBe('aguardando_clinica')
    expect(t!.assigned_staff_id).toBe(atendente!.staffId)
    expect(t!.last_staff_reply_at).not.toBeNull()
    const { data: n } = await db().from('user_notifications').select('type, data').eq('user_id', alvo.userId).eq('type', 'suporte.chamado')
    expect(n, 'só a resposta avisa (a nota interna, não)').toHaveLength(1)
    expect((n![0]!.data as { chamadoId: string }).chamadoId).toBe(chamadoId)
  })

  test('entrar pelo chamado e sair volta ao chamado', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: atendente!.estado })
    try {
      const page = await ctx.newPage()
      await page.goto(`/suporte/chamados/${chamadoId}`)
      await page.getByRole('button', { name: 'Entrar como' }).click()
      await page.getByLabel('Motivo do acesso').fill('Ver a agenda que não abre')
      await page.getByRole('button', { name: 'Entrar', exact: true }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 })
      await expect(page.getByRole('status', { name: 'Modo suporte' })).toBeVisible()
      // No modo suporte não há Ajuda: quem está ali é o atendente.
      await expect(page.getByRole('button', { name: 'Ajuda', exact: true })).toHaveCount(0)
      const { data: s } = await db().from('support_sessions').select('ticket_id').eq('tenant_id', outra!.tenantId).eq('status', 'ativa')
      expect(s).toEqual([{ ticket_id: chamadoId }])
      await page.getByRole('link', { name: 'Sair' }).click()
      await expect(page).toHaveURL(new RegExp(`/suporte/chamados/${chamadoId}`), { timeout: 30_000 })
    } finally { await ctx.close() }
  })

  test('as actions da plataforma recusam um membro da rede', async ({ browser }) => {
    const antes = (await db().from('support_tickets').select('status, assigned_staff_id').eq('id', chamadoId).single()).data
    const ctx = await browser.newContext({ storageState: gestor.estado })
    try {
      const p = await ctx.newPage()
      // A rota é do /suporte: o proxy desvia o membro, e a action confere a
      // plataforma por si. Qualquer que seja a resposta, o banco não muda.
      await chamarAcao(p, 'actions/chamados-suporte.ts', 'mudarSituacaoDoChamado', `/suporte/chamados/${chamadoId}`,
        [chamadoId, 'resolvido']).catch(() => null)
      await chamarAcao(p, 'actions/chamados-suporte.ts', 'assumirChamado', `/suporte/chamados/${chamadoId}`,
        [chamadoId]).catch(() => null)
    } finally { await ctx.close() }
    const depois = (await db().from('support_tickets').select('status, assigned_staff_id').eq('id', chamadoId).single()).data
    expect(depois).toEqual(antes)
  })

  test('a resposta chega no sino e abre a conversa — sem a nota interna', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: alvo.estado })
    try {
      const page = await ctx.newPage()
      await page.goto('/admin/dashboard')
      await page.getByRole('button', { name: 'Notificações' }).first().click()
      await page.getByText(/O suporte respondeu o chamado/).first().click()
      await page.getByRole('button', { name: 'Ver a resposta' }).click()
      const janela = page.getByRole('dialog', { name: 'Ajuda' })
      await expect(janela.getByText(RESPOSTA)).toBeVisible({ timeout: 20_000 })
      await expect(janela.getByText(NOTA)).toHaveCount(0)

      // Responder volta o chamado para o suporte.
      await janela.locator('textarea[name="corpo"]').fill('Obrigada, voltou a funcionar.')
      await janela.getByRole('button', { name: 'Enviar' }).click()
      await expect(janela.getByText('Obrigada, voltou a funcionar.')).toBeVisible({ timeout: 20_000 })
    } finally { await ctx.close() }
    const { data: t } = await db().from('support_tickets').select('status').eq('id', chamadoId).single<{ status: string }>()
    expect(t!.status).toBe('aberto')
  })

  test('"Pedir autorização" deixa a decisão com a clínica', async ({ browser }) => {
    // Um chamado do colega, sem autorização.
    const { data: novo, error } = await db().rpc('chamado_abrir', {
      p_tenant: outra!.tenantId, p_branch: null, p_user: colega.userId, p_assunto: `Sem acesso ${marca}`,
      p_corpo: 'Não vejo o financeiro.', p_contexto: {}, p_anexos: [], p_autorizar: false, p_clinico: false, p_horas: 72,
    })
    expect(error).toBeNull()
    const id = (novo as { chamado_id: string }[])[0]!.chamado_id

    const ctx = await browser.newContext({ storageState: atendente!.estado })
    try {
      const page = await ctx.newPage()
      await page.goto(`/suporte/chamados/${id}`)
      await expect(page.getByText('Sem autorização vigente: só a clínica libera o acesso.')).toBeVisible()
      await page.getByRole('button', { name: 'Pedir autorização' }).click()
      await expect(page.getByText(/pediu autorização para entrar na sua conta/)).toBeVisible({ timeout: 20_000 })
    } finally { await ctx.close() }
    const { data: g } = await db().from('support_grants').select('id').eq('target_user_id', colega.userId).is('revoked_at', null)
    expect(g, 'o pedido não autoriza nada').toHaveLength(0)
    const { data: n } = await db().from('user_notifications').select('data').eq('user_id', colega.userId).eq('type', 'suporte.chamado')
    expect(n).toHaveLength(1)

    // A clínica autoriza pela própria conversa.
    const cc = await browser.newContext({ storageState: colega.estado })
    try {
      const page = await cc.newPage()
      await page.goto('/admin/dashboard')
      await page.evaluate(i => window.dispatchEvent(new CustomEvent('bellaris:ajuda', { detail: { chamadoId: i } })), id)
      const janela = page.getByRole('dialog', { name: 'Ajuda' })
      await janela.getByRole('button', { name: 'Autorizar por 72 h' }).click()
      await expect(janela.getByText(/Acesso do suporte autorizado até/)).toBeVisible({ timeout: 20_000 })
    } finally { await cc.close() }
    const { data: g2 } = await db().from('support_grants').select('ticket_id').eq('target_user_id', colega.userId).is('revoked_at', null)
    expect(g2).toEqual([{ ticket_id: id }])
  })
})
