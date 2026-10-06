import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { ler } from '@estetica-os/nucleo/lib/db'

/**
 * O PRIMEIRO admin da plataforma, sem script: o e-mail mora na variável
 * `PLATAFORMA_ADMIN_EMAIL` (Railway; vários separados por vírgula), e quem
 * entra com ele vira ADMIN — a marca `app_metadata.plataforma` + a linha em
 * `platform_staff`. Os seguintes, o próprio admin cadastra no /sistema.
 *
 * Duas portas, as duas no servidor:
 *  - o LOGIN (`loginAction`, `/api/auth/session`): conta que já existe é
 *    promovida e a sessão renovada, para o token vir com a marca;
 *  - o "Esqueci minha senha", para a conta que AINDA não existe: nasce já
 *    marcada, e o e-mail de definir senha vai como para qualquer um.
 *
 * Membro de REDE com esse e-mail não é promovido: a marca o tiraria do
 * portal da rede dele (o mesmo motivo de `criarAtendente` recusar). Precisa
 * de outro e-mail para a plataforma.
 */
export function emailsDoPrimeiroAdmin(env: string | undefined = process.env.PLATAFORMA_ADMIN_EMAIL): string[] {
  return (env ?? '').split(',').map(e => e.trim().toLowerCase()).filter(e => e.includes('@'))
}

export function ehEmailDoPrimeiroAdmin(email: string | null | undefined, lista = emailsDoPrimeiroAdmin()): boolean {
  return !!email && lista.includes(email.trim().toLowerCase())
}

export type ResultadoDaPromocao = 'promovido' | 'ja_era' | 'nao_e_o_email' | 'membro_de_rede'

export async function promoverSeForOAdmin(user: {
  id: string; email?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> | null
}): Promise<ResultadoDaPromocao> {
  if (!ehEmailDoPrimeiroAdmin(user.email)) return 'nao_e_o_email'
  if (user.app_metadata?.plataforma) return 'ja_era'
  // Só e-mail CONFIRMADO: se a confirmação estiver desligada no Auth, alguém
  // faria signUp direto (a chave pública está no navegador) com o e-mail da
  // variável e viraria ADMIN. A conta criada pelo "esqueci a senha" já nasce
  // confirmada; a de um signUp, só depois do link do e-mail.
  if (!user.email_confirmed_at) return 'nao_e_o_email'
  const admin = createAdminClient()

  // Membro de rede ou cliente final: fica como está.
  const meta = user.app_metadata ?? {}
  const membro = await ler(admin.from('users').select('id').eq('auth_id', user.id).maybeSingle(), 'conferir se é membro de rede')
  if (membro || meta.tenant_id || meta.client_id) {
    console.error('[primeiro-admin] e-mail da variável é de membro de rede; use outro para a plataforma:', user.email)
    return 'membro_de_rede'
  }

  const existe = await ler(admin.from('platform_staff').select('id').eq('auth_id', user.id).maybeSingle(), 'conferir a equipe da plataforma')
  if (!existe) {
    const { error } = await admin.from('platform_staff').insert({
      auth_id: user.id, name: (user.email ?? 'Admin').split('@')[0], email: (user.email ?? '').toLowerCase(), papel: 'ADMIN',
    })
    if (error) throw new Error(`Não consegui cadastrar o admin da plataforma: ${error.message}`)
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { plataforma: 'ADMIN' } })
  if (error) throw new Error(`Não consegui marcar o admin da plataforma: ${error.message}`)
  return 'promovido'
}

/**
 * "Esqueci minha senha" com o e-mail da variável e SEM conta ainda: cria o
 * login já marcado (e a linha da equipe). Devolve `true` se criou; com a conta
 * já existente não faz nada (a promoção acontece no login).
 */
export async function criarContaDoPrimeiroAdmin(email: string): Promise<boolean> {
  if (!ehEmailDoPrimeiroAdmin(email)) return false
  const admin = createAdminClient()
  const limpo = email.trim().toLowerCase()
  const { data, error } = await admin.auth.admin.createUser({
    email: limpo, email_confirm: true, app_metadata: { plataforma: 'ADMIN' },
  })
  if (error || !data.user) return false // já existe (ou falhou): segue o caminho normal
  const { error: eStaff } = await admin.from('platform_staff').insert({
    auth_id: data.user.id, name: limpo.split('@')[0], email: limpo, papel: 'ADMIN',
  })
  if (eStaff) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`Não consegui cadastrar o admin da plataforma: ${eStaff.message}`)
  }
  return true
}
