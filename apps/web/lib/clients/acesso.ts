import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O ACESSO do cliente ao app/portal (§5): login = e-mail, senha inicial = o
 * CPF. O núcleo que a tela "Cadastrar cliente" e o Copilot dividem
 * (2026-10-08). Não confere o MÓDULO (quem chama confere).
 */

/** Cria o login do Auth. E-mail já usado → a mensagem para a tela, e nada criado. */
export async function criarLoginDoCliente(admin: Admin, email: string, cpf: string): Promise<{ authId: string } | { error: string }> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: cpf, email_confirm: true })
  if (error || !data?.user) {
    const ja = /already|registered|exists/i.test(error?.message ?? '')
    return { error: ja ? 'Este e-mail já está em uso por outra conta.' : `Erro ao criar login do cliente: ${error?.message ?? 'desconhecido'}` }
  }
  return { authId: data.user.id }
}

/** As claims do cliente no login (role CLIENT, client_id). */
export async function ligarLoginAoCliente(admin: Admin, authId: string, clientId: string): Promise<void> {
  await gravar(admin.rpc('set_client_claims', { p_auth_id: authId, p_client_id: clientId }), 'gravar os dados de acesso do cliente')
}

/** Desfaz o login que nasceu órfão (a ficha não gravou). */
export async function desfazerLogin(admin: Admin, authId: string): Promise<void> {
  await admin.auth.admin.deleteUser(authId).catch(() => {})
}

/**
 * Dá acesso a quem JÁ é cliente da rede e ainda não tem: grava o e-mail e o
 * CPF na ficha, cria o login e o liga. Ficha que já tem acesso é recusada.
 */
export async function darAcessoAoCliente(
  admin: Admin, ctx: TenantContext, clientId: string, email: string, cpf: string,
): Promise<{ ok: true } | { error: string }> {
  const ficha = await ler(admin.from('clients').select('id, auth_id')
    .eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente') as { id: string; auth_id: string | null } | null
  if (!ficha) return { error: 'Cliente não encontrado.' }
  if (ficha.auth_id) return { error: 'Este cliente já tem acesso ao app.' }

  const login = await criarLoginDoCliente(admin, email, cpf)
  if ('error' in login) return login
  try {
    // Com a guarda: duas tentativas ao mesmo tempo não ligam dois logins.
    const ligadas = await gravar(admin.from('clients')
      .update({ auth_id: login.authId, email, document: cpf, updated_at: new Date().toISOString() })
      .eq('id', clientId).eq('tenant_id', ctx.tenantId!).is('auth_id', null).select('id'), 'ligar o acesso ao cliente') as { id: string }[] | null
    if (!ligadas?.length) {
      await desfazerLogin(admin, login.authId)
      return { error: 'Este cliente acabou de ganhar acesso por outro caminho.' }
    }
    await ligarLoginAoCliente(admin, login.authId, clientId)
  } catch (e) {
    await desfazerLogin(admin, login.authId)
    throw e
  }
  return { ok: true }
}
