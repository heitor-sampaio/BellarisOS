import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { banco } from './banco'
import { chamarAcao } from './acao-direta'

/**
 * Apoio dos specs do modo suporte: entrar como um membro pela tela, autorizar
 * pela action, e falar com o Supabase com o token "capturado" do navegador —
 * que é o que o atendente teria nas mãos.
 */
const URL_SUPA = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** A sessão do Supabase guardada nos cookies do navegador. */
export async function sessaoDoNavegador(ctx: BrowserContext): Promise<{ access_token: string; refresh_token: string }> {
  const pedacos = (await ctx.cookies())
    .filter(c => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  let valor = pedacos.map(c => c.value).join('')
  if (valor.startsWith('base64-')) valor = Buffer.from(valor.slice(7), 'base64url').toString('utf8')
  return JSON.parse(valor)
}

/** GET no PostgREST com o token: as linhas, ou [] (inclusive em erro — ver `restBruto`). */
export async function rest(token: string, caminho: string): Promise<unknown[]> {
  const r = await restBruto(token, 'GET', caminho)
  return Array.isArray(r.corpo) ? r.corpo : []
}

/** Chamada crua ao PostgREST: o status e o corpo, para provar RECUSA (não só "vazio"). */
export async function restBruto(token: string, metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', caminho: string, corpo?: unknown) {
  const r = await fetch(`${URL_SUPA()}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: ANON(), Authorization: `Bearer ${token}`, 'content-type': 'application/json', Prefer: 'return=representation',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => null) as unknown }
}

/** Chamada à API do Auth com o token (trocar senha/e-mail, cadastrar fator). */
export async function authApi(token: string, metodo: 'PUT' | 'POST', caminho: string, corpo: unknown): Promise<number> {
  const r = await fetch(`${URL_SUPA()}/auth/v1/${caminho}`, {
    method: metodo,
    headers: { apikey: ANON(), Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  return r.status
}

export async function renovar(refresh: string): Promise<boolean> {
  const r = await fetch(`${URL_SUPA()}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: ANON(), 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }),
  })
  return r.ok
}

/** Autoriza o suporte na conta de `userId`, como a pessoa de `estado` (pela action). */
export async function autorizarPor(browser: Browser, estado: string, userId: string, opcoes: { clinico?: boolean; horas?: number } = {}) {
  const ctx = await browser.newContext({ storageState: estado })
  try {
    const p = await ctx.newPage()
    const r = await chamarAcao(p, 'actions/suporte-autorizacao.ts', 'autorizarSuporte', '/admin/settings',
      [{ userId, horas: opcoes.horas ?? 24, incluiClinico: !!opcoes.clinico }])
    expect(r.texto, 'a autorização foi aceita').toContain('"ok":true')
  } finally { await ctx.close() }
}

/** Entra pela tela: detalhe da rede → "Entrar como" na linha do membro → motivo → Entrar. */
export async function entrarComo(browser: Browser, estadoDoAtendente: string, tenantId: string, linhaDoMembro: string):
  Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: estadoDoAtendente })
  const page = await ctx.newPage()
  await page.goto(`/suporte/redes/${tenantId}`)
  const linha = page.locator('tr', { hasText: linhaDoMembro })
  await linha.getByRole('button', { name: 'Entrar como' }).click()
  await linha.getByLabel('Motivo do acesso').fill('Conferir o que a clínica relatou')
  await linha.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 })
  await expect(page.getByRole('status', { name: 'Modo suporte' })).toBeVisible()
  return { ctx, page }
}

/** As sessões de suporte ativas numa rede. */
export async function sessoesAtivasDaRede(tenantId: string): Promise<{ id: string }[]> {
  const { data, error } = await banco().from('support_sessions').select('id').eq('tenant_id', tenantId).eq('status', 'ativa')
  expect(error).toBeNull()
  return (data ?? []) as { id: string }[]
}

/** Limpa o que o modo suporte deixou numa rede de teste, olhando o erro de cada passo. */
export async function limparSuporteDaRede(tenantId: string): Promise<string[]> {
  const b = banco()
  const falhas: string[] = []
  const anote = (o: string, e: { message: string } | null) => { if (e) falhas.push(`${o}: ${e.message}`) }
  anote('sessões', (await b.from('support_sessions').delete().eq('tenant_id', tenantId)).error)
  anote('autorizações', (await b.from('support_grants').delete().eq('tenant_id', tenantId)).error)
  anote('chamados', (await b.from('support_tickets').delete().eq('tenant_id', tenantId)).error)
  anote('registros', (await b.from('platform_audit_log').delete().eq('tenant_id', tenantId)).error)
  return falhas
}
