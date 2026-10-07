import { linkDeDefinirSenha } from '@estetica-os/nucleo/lib/plataforma/destino'
import type { PapelDaPlataforma } from '@estetica-os/nucleo/lib/plataforma/contexto'

/** O pedaço do Auth que o convite usa (o `auth` do cliente com service role). */
interface AuthDoConvite {
  resetPasswordForEmail(email: string, opcoes: { redirectTo: string }): Promise<{ error: { message: string } | null }>
}

/**
 * O convite de quem entra na equipe da plataforma: o e-mail de "definir senha",
 * com o link para o host do papel (`linkDeDefinirSenha` — o ADMIN e o
 * GERENTE no sistema, o SUPORTE no suporte). O login nasce sem senha; é por aqui que a pessoa
 * escolhe a dela.
 *
 * Devolve o MOTIVO quando o e-mail não saiu (SMTP recusou, limite de envio,
 * rede) e null quando saiu. Até 2026-10-06 o resultado era descartado, e a tela
 * dizia "enviado" com o convite parado no SMTP. Prova: `tests/convite.test.ts`.
 */
export async function enviarConvite(
  auth: AuthDoConvite,
  email: string,
  papel: PapelDaPlataforma,
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  try {
    const { error } = await auth.resetPasswordForEmail(email, { redirectTo: linkDeDefinirSenha({ para: 'atendente', papel }, env) })
    return error ? error.message : null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
