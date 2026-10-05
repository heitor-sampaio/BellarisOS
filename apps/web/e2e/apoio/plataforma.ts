import { request } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { totp } from './totp'
export { totp } from './totp'
import fs from 'node:fs'
import path from 'node:path'
import { banco, PREFIXO } from './banco'
import { comPaciencia } from './sessao'

/**
 * Gente da PLATAFORMA (a equipe do BellarisOS no /suporte) para os testes.
 *
 * A verificação em duas etapas é obrigatória lá: o atendente nasce com um
 * autenticador TOTP cadastrado pela API do Auth, e o código é CALCULADO aqui
 * (RFC 6238, `node:crypto`) — sem aplicativo nenhum. `semVerificacao` deixa a
 * sessão em aal1, para provar que o /suporte não abre sem ela.
 *
 * Tudo nasce com `[e2e]` e e-mail `e2e-plataforma-*@bellaris.invalid`.
 */

export interface AtendenteDeTeste {
  staffId:     string
  authId:      string
  email:       string
  /** Arquivo de `storageState`. */
  estado:      string
  accessToken: string
  /** O segredo TOTP (base32), para calcular códigos novos. */
  segredo:     string | null
  limpar:      () => Promise<void>
}

// --- Sessão -------------------------------------------------------------------

function anon(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Grava a sessão (access + refresh) em cookies, pelo caminho do app nativo. */
async function gravarSessao(access: string, refresh: string, estado: string): Promise<void> {
  const ctx = await request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' })
  const res = await ctx.post('/api/auth/session', { data: { access_token: access, refresh_token: refresh } })
  if (!res.ok()) throw new Error(`/api/auth/session respondeu ${res.status()}`)
  fs.mkdirSync(path.dirname(estado), { recursive: true })
  await ctx.storageState({ path: estado })
  await ctx.dispose()
}

/**
 * Um atendente da plataforma, com sessão. Por padrão já verificado (aal2,
 * autenticador cadastrado); `semVerificacao` para a sessão aal1 e sem fator.
 */
export async function criarAtendente(
  marca: string,
  opcoes: { papel?: 'SUPORTE' | 'ADMIN'; semVerificacao?: boolean } = {},
): Promise<AtendenteDeTeste> {
  const db = banco()
  const papel = opcoes.papel ?? 'SUPORTE'
  const email = `e2e-plataforma-${marca}@bellaris.invalid`
  const estado = path.join(__dirname, '..', '.auth', `plataforma-${marca}.json`)
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
    fs.rmSync(estado, { force: true })
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

    const { data: link, error: eL } = await comPaciencia(() => db.auth.admin.generateLink({ type: 'magiclink', email }))
    if (eL || !link?.properties?.hashed_token) throw new Error(`emitir o link: ${eL?.message}`)
    const cliente = anon()
    const { data: s1, error: eO } = await comPaciencia(() => cliente.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }))
    if (eO || !s1.session) throw new Error(`abrir a sessão: ${eO?.message}`)

    let segredo: string | null = null
    let sessao = s1.session
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

    await gravarSessao(sessao.access_token, sessao.refresh_token, estado)
    return { staffId: staffId!, authId: authId!, email, estado, accessToken: sessao.access_token, segredo, limpar }
  } catch (e) {
    await limpar()
    throw e
  }
}
