import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { banco } from './banco'
import { chamarAcao } from './acao-direta'
import { urlDaPlataforma } from './plataforma'

/**
 * Apoio dos specs do modo suporte: entrar como um membro pela tela, autorizar
 * pela action, e falar com o Supabase com o token "capturado" do navegador —
 * que é o que o atendente teria nas mãos.
 */
const URL_SUPA = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * A sessão do Supabase guardada nos cookies do navegador — os da CLÍNICA por
 * padrão (`base`): o painel do suporte, no mesmo contexto, tem os seus no
 * host dele, e misturar os dois daria uma sessão que não existe.
 */
export async function sessaoDoNavegador(ctx: BrowserContext, base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'): Promise<{ access_token: string; refresh_token: string }> {
  const pedacos = (await ctx.cookies(base))
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

/**
 * Clica "Entrar" no PAINEL (host do suporte) e espera a aba NOVA chegar ao
 * portal do membro, na CLÍNICA (2026-10-06: o painel e a conta do membro são
 * origens diferentes; a sessão do atendente nunca vai para lá). Com as duas
 * metades da completa juntas, o Auth às vezes limita (`?erro=O Auth está
 * limitando…`): espera a janela andar e tenta de novo, pela própria tela.
 */
export async function entrarComPaciencia(painel: Page, clicar: () => Promise<void>): Promise<Page> {
  const esperas = [20, 40, 60, 90]
  for (let i = 0; ; i++) {
    const [aba] = await Promise.all([painel.context().waitForEvent('page'), clicar()])
    // O destino (o portal do membro, na clínica) ou a volta com erro (no painel).
    await aba.waitForURL(u => /\/admin\/|[?&]erro=|\/auth\/suporte-entrada/.test(u.toString()), { timeout: 30_000 }).catch(() => null)
    if (/limitando/.test(decodeURIComponent(aba.url())) && i < esperas.length) {
      await aba.close()
      await painel.waitForTimeout(esperas[i]! * 1000)
      continue
    }
    await expect(aba).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 })
    await expect(aba.getByRole('status', { name: 'Modo suporte' })).toBeVisible()
    return aba
  }
}

/**
 * Entra pela tela: detalhe da rede no PAINEL → "Entrar como" na linha do
 * membro → motivo → Entrar → a conta do membro abre numa aba nova, na clínica.
 * `page` é essa aba (a clínica); `painel`, a do suporte, que segue aberta.
 */
export async function entrarComo(browser: Browser, estadoDoAtendente: string, tenantId: string, linhaDoMembro: string):
  Promise<{ ctx: BrowserContext; page: Page; painel: Page }> {
  const ctx = await browser.newContext({ storageState: estadoDoAtendente })
  const painel = await ctx.newPage()
  const page = await entrarComPaciencia(painel, async () => {
    await painel.goto(`${urlDaPlataforma('suporte')}/redes/${tenantId}`)
    const linha = painel.locator('tr', { hasText: linhaDoMembro })
    await linha.getByRole('button', { name: 'Entrar como' }).click()
    await linha.getByLabel('Motivo do acesso').fill('Conferir o que a clínica relatou')
    await linha.getByRole('button', { name: 'Entrar', exact: true }).click()
  })
  return { ctx, page, painel }
}

/**
 * O pedido de entrada SEM a tela: o POST do painel ao `/api/entrar` do
 * suporte. Devolve o status, a volta com erro (`location`) e — no caminho
 * feliz — o CÓDIGO de uso único e o endereço da clínica para onde a página
 * o leva (o formulário que se envia sozinho).
 */
export async function pedirEntrada(ctx: BrowserContext, form: Record<string, string>):
  Promise<{ status: number; location: string | null; codigo: string | null; destino: string | null }> {
  const r = await ctx.request.post(`${urlDaPlataforma('suporte')}/api/entrar`, { form, maxRedirects: 0 })
  const html = r.status() === 200 ? await r.text() : ''
  return {
    status: r.status(),
    location: r.headers().location ?? null,
    codigo: /name="codigo" value="([^"]+)"/.exec(html)?.[1] ?? null,
    destino: /<form[^>]*action="([^"]+)"/.exec(html)?.[1] ?? null,
  }
}

/** A sessão de suporte de um token capturado (pelo `session_id` do JWT). */
export async function sessaoDoToken(token: string): Promise<{ id: string; status: string }> {
  const sid = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')).session_id as string
  const { data, error } = await banco().from('support_sessions').select('id, status').eq('auth_session_id', sid).maybeSingle<{ id: string; status: string }>()
  expect(error).toBeNull()
  expect(data, 'o token capturado é de uma sessão de suporte').not.toBeNull()
  return data!
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
