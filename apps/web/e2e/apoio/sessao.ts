import { request } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { banco, tenantId, PREFIXO } from './banco'
import { apagarClientes } from './limpeza'

/**
 * Logins de teste que NÃO são o admin da rede, e a sessão de cada um.
 *
 * A suíte roda como admin da rede, que vê tudo — e aí nenhuma regra de acesso
 * pode ser provada: a tela abre de qualquer jeito. Até 2026-09-27 só existia
 * o "SDR com CRM só os meus"; a varredura de cobertura mostrou que nenhum
 * teste entrava como usuário de UNIDADE, como cargo sem um módulo, ou como
 * CLIENTE FINAL. Daí os três criadores daqui.
 *
 * A sessão sai pelo mesmo caminho de `global-setup.ts` (magic link +
 * `/api/auth/session`), sem senha em lugar nenhum. O cargo é novo a cada
 * rodada, então o cache de permissões (`permissions:<tenant>`, por cargo) não
 * tem nada velho para servir.
 *
 * Tudo nasce com prefixo `[e2e]` e e-mail `e2e-*@bellaris.invalid`: se o
 * `limpar()` não rodar, a varredura do `global-setup` recolhe.
 */

export interface SessaoDeTeste {
  /** Arquivo de `storageState` — `browser.newContext({ storageState })`. */
  estado: string
  /** Token da sessão, para falar com o PostgREST COMO a pessoa — é o que prova a RLS. */
  accessToken: string
  /** Para onde `/api/auth/session` mandaria esta pessoa depois do login. */
  destino: string
  limpar: () => Promise<void>
}

export interface MembroDeTeste extends SessaoDeTeste {
  userId: string
  roleId: string
}

export interface ClienteDeTeste extends SessaoDeTeste {
  clientId: string
  branchId: string
  slug: string
}

type Modulo =
  | 'agenda' | 'clients' | 'loyalty' | 'medical_records' | 'documents' | 'procedures' | 'stock' | 'financial'
  | 'cashier' | 'crm' | 'marketing' | 'reports' | 'team' | 'forms' | 'roles'
  | 'settings' | 'automations'

export interface Permissao {
  modulo: Modulo
  nivel:  'VIEW' | 'MANAGE'
  escopo?: 'OWN' | 'ALL'
}

/**
 * O Auth do Supabase limita as verificações de token por endereço de origem
 * (janela de 5 min). Um spec por vez, as sessões se espalhavam pela suíte; com
 * os isolados em paralelo (`e2e/grupos.ts`), uns 40 membros abrem sessão nos
 * primeiros minutos e o limite estoura ("Request rate limit reached"). Quem
 * bate no limite espera e tenta de novo — só nesse erro, e com teto.
 */
export async function comPaciencia<T extends { error: { message: string } | null }>(fazer: () => Promise<T>): Promise<T> {
  const esperas = [10, 20, 30, 45, 60, 60, 60] // segundos: até ~5 min, a janela do limite
  for (let i = 0; ; i++) {
    const r = await fazer()
    if (!r.error || !/rate limit/i.test(r.error.message) || i >= esperas.length) return r
    console.warn('[e2e] limite do Auth: esperando ' + esperas[i] + ' s para abrir a sessão')
    await new Promise(ok => setTimeout(ok, esperas[i]! * 1000))
  }
}

/** Magic link → sessão → cookies gravados no arquivo. O mesmo caminho do app nativo. */
async function abrirSessao(email: string, estado: string): Promise<{ accessToken: string; destino: string }> {
  const db = banco()
  const { data: link, error: erroLink } = await comPaciencia(() => db.auth.admin.generateLink({ type: 'magiclink', email }))
  if (erroLink || !link?.properties?.hashed_token) throw new Error(`emitir o link: ${erroLink?.message}`)
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: sessao, error: erroOtp } = await comPaciencia(() => anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'magiclink',
  }))
  if (erroOtp || !sessao.session) throw new Error(`abrir a sessão: ${erroOtp?.message}`)

  const ctx = await request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' })
  const res = await ctx.post('/api/auth/session', {
    data: { access_token: sessao.session.access_token, refresh_token: sessao.session.refresh_token },
  })
  if (!res.ok()) throw new Error(`/api/auth/session respondeu ${res.status()}`)
  const corpo = await res.json().catch(() => ({})) as { redirectTo?: string }
  fs.mkdirSync(path.dirname(estado), { recursive: true })
  await ctx.storageState({ path: estado })
  await ctx.dispose()
  return { accessToken: sessao.session.access_token, destino: corpo.redirectTo ?? '' }
}

/**
 * Um membro da equipe com o cargo que o teste descrever.
 *
 * `permissoes` é a matriz INTEIRA do cargo: módulo fora da lista fica sem
 * acesso — é assim que se testa a negativa ("financeiro fechado para quem não
 * tem"). `branchId` nulo é abrangência de rede; preenchido, é gente de unidade.
 */
export async function criarMembro(
  marca: string,
  opcoes: {
    permissoes: Permissao[]
    branchId?: string | null
    inboxCaixas?: 'todas' | 'minhas'
    rotulo?: string
    /** Outra rede `[e2e]` (`criarOutraRede`). Sem isto, a rede de teste. */
    tenant?: string
  },
): Promise<MembroDeTeste> {
  const db     = banco()
  const tenant = opcoes.tenant ?? await tenantId()
  const email  = `e2e-membro-${marca}@bellaris.invalid`
  const rotulo = opcoes.rotulo ?? 'Membro'
  const estado = path.join(__dirname, '..', '.auth', `membro-${marca}.json`)
  const branchId = opcoes.branchId ?? null

  let roleId: string | null = null
  let authId: string | null = null
  let userId: string | null = null

  const limpar = async () => {
    // Agendar pelo núcleo grava quem agendou (`created_by_id`, sem cascade): o
    // agendamento prendia o membro, e a rede [e2e] dele ficava no banco.
    if (userId) await db.from('appointments').update({ created_by_id: null }).eq('created_by_id', userId)
    if (userId) await db.from('users').delete().eq('id', userId)
    if (authId) await db.auth.admin.deleteUser(authId)
    if (roleId) {
      await db.from('role_report_tabs').delete().eq('role_id', roleId)
      await db.from('role_permissions').delete().eq('role_id', roleId)
      await db.from('tenant_roles').delete().eq('id', roleId)
    }
    fs.rmSync(estado, { force: true })
  }

  try {
    const { data: cargo, error: erroCargo } = await db.from('tenant_roles')
      .insert({
        tenant_id: tenant, key: `E2E_${marca}`.toUpperCase(), label: `${PREFIXO} ${rotulo} ${marca}`,
        inbox_caixas: opcoes.inboxCaixas ?? 'todas',
      })
      .select('id').single<{ id: string }>()
    if (erroCargo) throw new Error(`criar o cargo: ${erroCargo.message}`)
    roleId = cargo!.id

    if (opcoes.permissoes.length) {
      const { error: erroPerm } = await db.from('role_permissions').insert(opcoes.permissoes.map(p => ({
        tenant_id: tenant, role_id: roleId, module: p.modulo, level: p.nivel, scope: p.escopo ?? 'ALL',
      })))
      if (erroPerm) throw new Error(`gravar a matriz do cargo: ${erroPerm.message}`)
    }

    const { data: auth, error: erroAuth } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (erroAuth || !auth.user) throw new Error(`criar o login: ${erroAuth?.message}`)
    authId = auth.user.id

    const { error: erroClaims } = await db.rpc('set_user_claims', {
      p_auth_id: authId, p_tenant_id: tenant, p_branch_id: branchId, p_role_id: roleId,
    })
    if (erroClaims) throw new Error(`gravar as claims: ${erroClaims.message}`)

    const { data: membro, error: erroMembro } = await db.from('users')
      .insert({
        auth_id: authId, tenant_id: tenant, branch_id: branchId,
        name: `${PREFIXO} ${rotulo} ${marca}`, email, role_id: roleId,
      })
      .select('id').single<{ id: string }>()
    if (erroMembro) throw new Error(`criar o membro: ${erroMembro.message}`)
    userId = membro!.id

    // Sessão por último, com as claims já gravadas — o token nasce com elas.
    const { accessToken, destino } = await abrirSessao(email, estado)
    return { userId, roleId: roleId!, accessToken, destino, estado, limpar }
  } catch (e) {
    await limpar()
    throw e
  }
}

/**
 * O SDR de sempre: CRM MANAGE com escopo "só os meus" (ou ALL), de rede.
 * Mantido pelo nome porque é o que os specs de inbox e CRM usam.
 */
export async function membroComEscopoProprio(
  marca: string,
  opcoes: { escopo?: 'OWN' | 'ALL'; inboxCaixas?: 'todas' | 'minhas' } = {},
): Promise<MembroDeTeste> {
  return criarMembro(`sdr${marca}`, {
    rotulo: 'SDR',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: opcoes.escopo ?? 'OWN' }],
    inboxCaixas: opcoes.inboxCaixas,
  })
}

/**
 * Um cliente final com conta no portal, e a sessão dele.
 *
 * Mesmo caminho do cadastro com login (`addClient`): cliente com `auth_id`,
 * conta de fidelidade e `set_client_claims`. O JWT dele traz `client_id` e
 * `role: CLIENT`, sem `tenant_id` (§5).
 */
export async function clienteComSessao(
  marca: string,
  unidade: { id: string; slug: string },
  /** Rede do cliente (uma rede [e2e]); sem ela, a rede de teste padrão. */
  opcoes: { tenant?: string } = {},
): Promise<ClienteDeTeste> {
  const db     = banco()
  const tenant = opcoes.tenant ?? await tenantId()
  const email  = `e2e-cliente-${marca}@bellaris.invalid`
  const estado = path.join(__dirname, '..', '.auth', `cliente-${marca}.json`)

  let authId: string | null = null
  let clientId: string | null = null

  const limpar = async () => {
    if (clientId) {
      const falhas = await apagarClientes([clientId])
      for (const f of falhas) console.warn(`[e2e] cliente de teste: não apagou ${f.o_que}: ${f.erro}`)
    }
    if (authId) await db.auth.admin.deleteUser(authId)
    fs.rmSync(estado, { force: true })
  }

  try {
    const { data: auth, error: erroAuth } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (erroAuth || !auth.user) throw new Error(`criar o login do cliente: ${erroAuth?.message}`)
    authId = auth.user.id

    const { data: cliente, error: erroCliente } = await db.from('clients')
      .insert({
        tenant_id: tenant, branch_id: unidade.id, name: `${PREFIXO} Cliente portal ${marca}`,
        phone: '5548' + String(Date.now()).slice(-9), email, auth_id: authId, is_active: true,
      })
      .select('id').single<{ id: string }>()
    if (erroCliente) throw new Error(`criar o cliente: ${erroCliente.message}`)
    clientId = cliente!.id

    await db.from('loyalty_accounts').upsert({ client_id: clientId }, { onConflict: 'client_id' })
    const { error: erroClaims } = await db.rpc('set_client_claims', { p_auth_id: authId, p_client_id: clientId })
    if (erroClaims) throw new Error(`gravar as claims do cliente: ${erroClaims.message}`)

    const { accessToken, destino } = await abrirSessao(email, estado)
    return { clientId, branchId: unidade.id, slug: unidade.slug, accessToken, destino, estado, limpar }
  } catch (e) {
    await limpar()
    throw e
  }
}
export const sessaoPorEmail = abrirSessao
