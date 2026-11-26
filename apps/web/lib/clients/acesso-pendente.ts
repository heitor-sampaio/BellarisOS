import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O acesso ao app que ainda não foi usado, dito na ficha (A4 da 31ª; princípios
 * 3 e 7). Com o documento recusado como senha (PO-14), a pessoa cria a senha
 * pelo e-mail: até lá, "Tem acesso ao app" parecia que ela já entrava. Neutro
 * (PO-03): "a pessoa", nunca "ele" ou "ela".
 *
 * `primeiroAcessoEm` é `clients.app_account_created_at` (o layout do portal o
 * grava na primeira entrada): com ele, nada pendente.
 */
export function acessoPendenteNaFicha(p: { temLogin: boolean; primeiroAcessoEm: string | null; senhaPorEmail: boolean }): string | null {
  if (!p.temLogin || p.primeiroAcessoEm) return null
  return p.senhaPorEmail
    ? 'O acesso espera a pessoa criar a senha pelo e-mail que enviamos. Se não chegou, na entrada do app, “Esqueci a senha”, com o e-mail do login, manda o link de novo.'
    : 'A pessoa ainda não entrou no app.'
}

/**
 * O mesmo, lendo a marca `senha_por_email` do login no Auth (posta por
 * `criarLoginDoCliente`) — só enquanto a pessoa não entrou: depois, nada a ler.
 */
export async function lerAcessoPendente(admin: Admin, p: { authId: string | null; primeiroAcessoEm: string | null }): Promise<string | null> {
  if (!p.authId || p.primeiroAcessoEm) return null
  const { data, error } = await admin.auth.admin.getUserById(p.authId)
  // A falha do Auth não derruba a ficha: sem a marca, o texto geral.
  const meta = error ? null : (data.user?.app_metadata as { senha_por_email?: boolean } | undefined)
  return acessoPendenteNaFicha({ temLogin: true, primeiroAcessoEm: null, senhaPorEmail: meta?.senha_por_email === true })
}
