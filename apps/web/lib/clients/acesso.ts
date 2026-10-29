import 'server-only'
import { revalidateTag } from 'next/cache'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { tagDasFichasDoLogin } from '@/lib/cached-queries'
import { erroDoAuth, SENHA_FRACA } from '@/lib/erro-do-auth'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O ACESSO do cliente ao app/portal (§5): login = e-mail, senha inicial = o
 * CPF. O núcleo que a tela "Cadastrar cliente" e o Copilot dividem
 * (2026-10-08). Não confere o MÓDULO (quem chama confere).
 *
 * A mesma pessoa pode ser cliente de várias clínicas com um login só
 * (2026-10-19): se o e-mail já tem conta de CLIENTE e uma ficha dela (de outra
 * clínica) tem o mesmo CPF, a ficha desta clínica é LIGADA a essa conta — a
 * senha continua a que ela já usa (`login_de_cliente_para_ligar`).
 */

export type LoginDoCliente =
  /** `novo`: o login nasceu agora (rollback apaga). Senão é a conta que ela já tinha — nunca se apaga. */
  | { authId: string; novo: boolean }
  | { error: string }

const RECUSA: Record<string, string> = {
  equipe:        'Este e-mail já está em uso por outra conta.',
  cpf:           'Este e-mail já tem uma conta no BellarisOS com outro CPF. Confira o e-mail e o CPF da cliente.',
  ja_nesta_rede: 'Esta pessoa já tem acesso ao app por outra ficha desta clínica.',
}

/**
 * O login da cliente: o que ela já tem (de outra clínica, com o mesmo CPF) ou
 * um novo. E-mail de equipe, CPF que não bate ou login já desta clínica → a
 * mensagem para a tela, e nada criado.
 */
export async function criarLoginDoCliente(
  admin: Admin, tenantId: string, email: string, cpf: string,
): Promise<LoginDoCliente> {
  const existente = await ler(admin.rpc('login_de_cliente_para_ligar', { p_email: email, p_cpf: cpf, p_tenant: tenantId }),
    'conferir se o e-mail já tem conta') as { auth_id: string; motivo: string }[] | null
  const conta = existente?.[0]
  if (conta) {
    if (conta.motivo === 'ligar') return { authId: conta.auth_id, novo: false }
    return { error: RECUSA[conta.motivo] ?? RECUSA.equipe! }
  }

  // A senha inicial é o CPF: provisória, troca-se no primeiro acesso (o proxy).
  const { data, error } = await admin.auth.admin.createUser({ email, password: cpf, email_confirm: true, app_metadata: { senha_provisoria: true } })
  if (error || !data?.user) {
    // Entre a conferência e a criação, outro caminho criou o login.
    const ja = /already|registered|exists/i.test(error?.message ?? '')
    if (ja) return { error: RECUSA.equipe! }
    // O Auth fala inglês, e a tela mostrava "Password is known to be weak…"
    // cru (D12, 2026-10-29). A senha inicial é o CPF: a fraca é o CPF.
    console.error('[acesso] criar o login da cliente:', error?.code, error?.message)
    const texto = erroDoAuth(error)
    return { error: texto === SENHA_FRACA
      ? 'O sistema de login recusou o CPF como senha inicial (fácil de adivinhar). Confira o CPF; se estiver certo, cadastre sem o acesso ao app e avise quem administra a rede.'
      : texto }
  }
  return { authId: data.user.id, novo: true }
}

/**
 * Depois de a ficha gravar com o `auth_id`: no login NOVO, as claims do
 * cliente (role CLIENT, client_id); no que ela já tinha, nada muda no token (a
 * claim é só a marca "é cliente") — só a lista de fichas do login, que o
 * portal lê, expira na hora.
 */
export async function ligarLoginAoCliente(admin: Admin, login: { authId: string; novo: boolean }, clientId: string): Promise<void> {
  if (login.novo) {
    await gravar(admin.rpc('set_client_claims', { p_auth_id: login.authId, p_client_id: clientId }), 'gravar os dados de acesso do cliente')
  }
  revalidateTag(tagDasFichasDoLogin(login.authId), { expire: 0 })
}

/** Desfaz o login que nasceu órfão (a ficha não gravou). A conta que ela já tinha fica. */
export async function desfazerLogin(admin: Admin, login: { authId: string; novo: boolean }): Promise<void> {
  if (!login.novo) return
  await admin.auth.admin.deleteUser(login.authId).catch(() => {})
}

/**
 * Dá acesso a quem JÁ é cliente da rede e ainda não tem: grava o e-mail e o
 * CPF na ficha, cria (ou acha) o login e o liga. Ficha que já tem acesso é recusada.
 */
export async function darAcessoAoCliente(
  admin: Admin, ctx: TenantContext, clientId: string, email: string, cpf: string,
): Promise<{ ok: true } | { error: string }> {
  const ficha = await ler(admin.from('clients').select('id, auth_id')
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente') as { id: string; auth_id: string | null } | null
  if (!ficha) return { error: 'Cliente não encontrado.' }
  if (ficha.auth_id) return { error: 'Este cliente já tem acesso ao app.' }

  const login = await criarLoginDoCliente(admin, ctx.tenantId!, email, cpf)
  if ('error' in login) return login
  try {
    // Com a guarda: duas tentativas ao mesmo tempo não ligam dois logins.
    const ligadas = await gravar(admin.from('clients')
      .update({ auth_id: login.authId, email, document: cpf, updated_at: new Date().toISOString() })
      .eq('id', clientId).eq('tenant_id', ctx.tenantId!).is('auth_id', null).select('id'), 'ligar o acesso ao cliente') as { id: string }[] | null
    if (!ligadas?.length) {
      await desfazerLogin(admin, login)
      return { error: 'Este cliente acabou de ganhar acesso por outro caminho.' }
    }
    await ligarLoginAoCliente(admin, login, clientId)
  } catch (e) {
    await desfazerLogin(admin, login)
    throw e
  }
  return { ok: true }
}
