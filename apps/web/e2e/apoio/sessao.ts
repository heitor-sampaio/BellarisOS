import { request } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { banco, tenantId, PREFIXO } from './banco'

/**
 * Um membro de verdade com CRM em escopo "só os meus", e a sessão dele.
 *
 * A suíte inteira roda como admin da rede, que vê tudo — e aí nenhuma regra de
 * alcance pode ser provada: a tela abre de qualquer jeito. Este é o único jeito
 * de a regra do OWN aparecer num teste.
 *
 * A sessão sai pelo mesmo caminho de `global-setup.ts` (magic link +
 * `/api/auth/session`), sem senha em lugar nenhum. O cargo é novo a cada
 * rodada, então o cache de permissões (`permissions:<tenant>`, por cargo) não
 * tem nada velho para servir.
 */
export interface MembroDeTeste {
  userId: string
  estado: string
  limpar: () => Promise<void>
}

export async function membroComEscopoProprio(marca: string): Promise<MembroDeTeste> {
  const db     = banco()
  const tenant = await tenantId()
  const email  = `e2e-sdr-${marca}@bellaris.invalid`

  let roleId: string | null = null
  let authId: string | null = null
  let userId: string | null = null
  const estado = path.join(__dirname, '..', '.auth', `sdr-${marca}.json`)

  const limpar = async () => {
    if (userId) await db.from('users').delete().eq('id', userId)
    if (authId) await db.auth.admin.deleteUser(authId)
    if (roleId) {
      await db.from('role_permissions').delete().eq('role_id', roleId)
      await db.from('tenant_roles').delete().eq('id', roleId)
    }
    fs.rmSync(estado, { force: true })
  }

  try {
    const { data: cargo, error: erroCargo } = await db.from('tenant_roles')
      .insert({ tenant_id: tenant, key: `E2E_SDR_${marca}`, label: `${PREFIXO} SDR ${marca}` })
      .select('id').single<{ id: string }>()
    if (erroCargo) throw new Error(`criar o cargo: ${erroCargo.message}`)
    roleId = cargo!.id

    const { error: erroPerm } = await db.from('role_permissions').insert({
      tenant_id: tenant, role_id: roleId, module: 'crm', level: 'MANAGE', scope: 'OWN',
    })
    if (erroPerm) throw new Error(`dar o CRM ao cargo: ${erroPerm.message}`)

    const { data: auth, error: erroAuth } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (erroAuth || !auth.user) throw new Error(`criar o login: ${erroAuth?.message}`)
    authId = auth.user.id

    const { error: erroClaims } = await db.rpc('set_user_claims', {
      p_auth_id: authId, p_tenant_id: tenant, p_branch_id: null, p_role_id: roleId,
    })
    if (erroClaims) throw new Error(`gravar as claims: ${erroClaims.message}`)

    const { data: membro, error: erroMembro } = await db.from('users')
      .insert({ auth_id: authId, tenant_id: tenant, branch_id: null, name: `${PREFIXO} SDR ${marca}`, email, role_id: roleId })
      .select('id').single<{ id: string }>()
    if (erroMembro) throw new Error(`criar o membro: ${erroMembro.message}`)
    userId = membro!.id

    // Sessão, com as claims já gravadas — o token nasce com elas.
    const { data: link, error: erroLink } = await db.auth.admin.generateLink({ type: 'magiclink', email })
    if (erroLink || !link?.properties?.hashed_token) throw new Error(`emitir o link: ${erroLink?.message}`)
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: sessao, error: erroOtp } = await anon.auth.verifyOtp({
      token_hash: link.properties.hashed_token, type: 'magiclink',
    })
    if (erroOtp || !sessao.session) throw new Error(`abrir a sessão: ${erroOtp?.message}`)

    const ctx = await request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' })
    const res = await ctx.post('/api/auth/session', {
      data: { access_token: sessao.session.access_token, refresh_token: sessao.session.refresh_token },
    })
    if (!res.ok()) throw new Error(`/api/auth/session respondeu ${res.status()}`)
    fs.mkdirSync(path.dirname(estado), { recursive: true })
    await ctx.storageState({ path: estado })
    await ctx.dispose()

    return { userId, estado, limpar }
  } catch (e) {
    await limpar()
    throw e
  }
}
