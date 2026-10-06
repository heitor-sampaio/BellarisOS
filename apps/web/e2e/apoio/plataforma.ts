import { createServerClient } from '@supabase/ssr'
import type { Session } from '@supabase/supabase-js'
import { totp } from './totp'
export { totp } from './totp'
import fs from 'node:fs'
import path from 'node:path'
import { banco, PREFIXO } from './banco'
import { sessaoDeTeste } from './sessao'

/**
 * Gente da PLATAFORMA (a equipe do BellarisOS) para os testes.
 *
 * Desde 2026-10-06 a plataforma mora em DOIS apps, cada um no seu host: o
 * sistema (só ADMIN, `E2E_SISTEMA_URL`) e o suporte (SUPORTE e ADMIN,
 * `E2E_SUPORTE_URL`). A sessão do atendente é gravada no host da CASA dele
 * (ADMIN → sistema, SUPORTE → suporte, ou o `host` pedido); `estadoNo` abre
 * uma SEGUNDA sessão para o outro host — a mesma sessão nos dois girar o
 * refresh token num derrubaria o outro, como num navegador de verdade.
 *
 * A verificação em duas etapas é obrigatória: o atendente nasce com um
 * autenticador TOTP cadastrado pela API do Auth, e o código é CALCULADO aqui
 * (RFC 6238, `node:crypto`) — sem aplicativo nenhum. `semVerificacao` deixa a
 * sessão em aal1, para provar que o painel não abre sem ela.
 *
 * Tudo nasce com `[e2e]` e e-mail `e2e-plataforma-*@bellaris.invalid`.
 */

export type HostDaPlataforma = 'sistema' | 'suporte'

export interface AtendenteDeTeste {
  staffId:     string
  authId:      string
  email:       string
  papel:       'SUPORTE' | 'ADMIN'
  /** O host da sessão de `estado`. */
  host:        HostDaPlataforma
  /** Arquivo de `storageState` (cookies no host da casa). */
  estado:      string
  accessToken: string
  /** O segredo TOTP (base32), para calcular códigos novos. */
  segredo:     string | null
  /** Outra sessão, verificada, gravada para o outro host. */
  estadoNo:    (host: HostDaPlataforma) => Promise<string>
  limpar:      () => Promise<void>
}

export function urlDaPlataforma(host: HostDaPlataforma): string {
  const url = host === 'sistema' ? process.env.E2E_SISTEMA_URL : process.env.E2E_SUPORTE_URL
  if (!url) throw new Error(`E2E_${host.toUpperCase()}_URL não definida: os specs da plataforma rodam contra o build (playwright.build.config.ts)`)
  return url
}

/** Os specs da plataforma só rodam com os três apps no ar (contra o build). */
export const plataformaNoAr = () => !!process.env.E2E_SISTEMA_URL && !!process.env.E2E_SUPORTE_URL

// --- Sessão -------------------------------------------------------------------

/**
 * A sessão em cookies do HOST pedido, como o servidor os gravaria — sem
 * endpoint nenhum: o próprio `@supabase/ssr` monta os cookies (com os
 * pedaços), e eles vão para o arquivo com o domínio do host. httpOnly, como
 * o app grava (`opcoesDoCookieDeSessao`).
 */
export async function gravarSessaoNoHost(sessao: Session, base: string, estado: string): Promise<void> {
  const pote: { name: string; value: string }[] = []
  const cliente = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: (lista: { name: string; value: string }[]) => { for (const c of lista) if (c.value) pote.push({ name: c.name, value: c.value }) } },
  })
  const { error } = await cliente.auth.setSession({ access_token: sessao.access_token, refresh_token: sessao.refresh_token })
  if (error) throw new Error(`montar os cookies da sessão: ${error.message}`)
  if (!pote.length) throw new Error('o @supabase/ssr não gravou cookie nenhum')
  const dominio = new URL(base).hostname
  const expira = Math.floor(Date.now() / 1000) + 7 * 86_400
  fs.mkdirSync(path.dirname(estado), { recursive: true })
  fs.writeFileSync(estado, JSON.stringify({
    cookies: pote.map(c => ({
      name: c.name, value: c.value, domain: dominio, path: '/', expires: expira,
      httpOnly: true, secure: false, sameSite: 'Lax' as const,
    })),
    origins: [],
  }, null, 2))
}

/** Abre a sessão (senha de teste) e, se pedido, passa a verificação TOTP. */
async function sessaoVerificada(authId: string, email: string, segredo: string | null): Promise<Session> {
  const { cliente, sessao } = await sessaoDeTeste(authId, email)
  if (!segredo) return sessao
  const { data: fatores } = await cliente.auth.mfa.listFactors()
  const fator = fatores?.totp?.[0]
  if (!fator) throw new Error('o autenticador não está cadastrado')
  let { error } = await cliente.auth.mfa.challengeAndVerify({ factorId: fator.id, code: totp(segredo) })
  if (error) {
    // O mesmo código, dentro da mesma janela de 30 s, pode já ter sido usado
    // (a sessão da casa): espera a próxima janela e tenta uma vez.
    await new Promise(ok => setTimeout(ok, 31_000 - (Date.now() % 30_000)))
    ;({ error } = await cliente.auth.mfa.challengeAndVerify({ factorId: fator.id, code: totp(segredo) }))
  }
  if (error) throw new Error(`verificar o código: ${error.message}`)
  const { data: s2 } = await cliente.auth.getSession()
  if (!s2.session) throw new Error('a sessão aal2 não veio')
  return s2.session
}

/**
 * Um atendente da plataforma, com sessão no host da casa. Por padrão já
 * verificado (aal2, autenticador cadastrado); `semVerificacao` para a sessão
 * aal1 e sem fator.
 */
export async function criarAtendente(
  marca: string,
  opcoes: { papel?: 'SUPORTE' | 'ADMIN'; semVerificacao?: boolean; host?: HostDaPlataforma } = {},
): Promise<AtendenteDeTeste> {
  const db = banco()
  const papel = opcoes.papel ?? 'SUPORTE'
  const host: HostDaPlataforma = opcoes.host ?? (papel === 'ADMIN' ? 'sistema' : 'suporte')
  const email = `e2e-plataforma-${marca}@bellaris.invalid`
  const estado = path.join(__dirname, '..', '.auth', `plataforma-${marca}-${host}.json`)
  const extras: string[] = []
  let authId: string | null = null
  let staffId: string | null = null

  const limpar = async () => {
    if (staffId) {
      // As sessões de suporte do atendente apontam para ele (e levam o registro de acesso).
      await db.from('support_sessions').delete().eq('staff_id', staffId)
      await db.from('platform_audit_log').delete().eq('staff_id', staffId)
      await db.from('platform_staff').delete().eq('id', staffId)
    }
    if (authId) await db.auth.admin.deleteUser(authId)
    for (const f of [estado, ...extras]) fs.rmSync(f, { force: true })
  }

  try {
    const { data: criado, error } = await db.auth.admin.createUser({
      email, email_confirm: true, app_metadata: { plataforma: papel },
    })
    if (error || !criado.user) throw new Error(`criar o login da plataforma: ${error?.message}`)
    authId = criado.user.id

    const { data: staff, error: eS } = await db.from('platform_staff')
      .insert({ auth_id: authId, name: `${PREFIXO} Atendente ${papel} ${marca}`, email, papel })
      .select('id').single<{ id: string }>()
    if (eS) throw new Error(`gravar na equipe da plataforma: ${eS.message}`)
    staffId = staff!.id

    const { cliente, sessao: s1 } = await sessaoDeTeste(authId, email)

    let segredo: string | null = null
    let sessao = s1
    if (!opcoes.semVerificacao) {
      const { data: fator, error: eF } = await cliente.auth.mfa.enroll({ factorType: 'totp', friendlyName: `e2e ${marca}` })
      if (eF || !fator) throw new Error(`cadastrar o autenticador: ${eF?.message}`)
      segredo = fator.totp.secret
      const { error: eV } = await cliente.auth.mfa.challengeAndVerify({ factorId: fator.id, code: totp(segredo) })
      if (eV) throw new Error(`verificar o código: ${eV.message}`)
      const { data: s2 } = await cliente.auth.getSession()
      if (!s2.session) throw new Error('a sessão aal2 não veio')
      sessao = s2.session
    }

    await gravarSessaoNoHost(sessao, urlDaPlataforma(host), estado)

    const estadoNo = async (outro: HostDaPlataforma) => {
      const arq = path.join(__dirname, '..', '.auth', `plataforma-${marca}-${outro}-${extras.length}.json`)
      extras.push(arq)
      await gravarSessaoNoHost(await sessaoVerificada(authId!, email, segredo), urlDaPlataforma(outro), arq)
      return arq
    }

    return { staffId: staffId!, authId: authId!, email, papel, host, estado, accessToken: sessao.access_token, segredo, estadoNo, limpar }
  } catch (e) {
    await limpar()
    throw e
  }
}
