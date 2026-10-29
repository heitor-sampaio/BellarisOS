/**
 * O erro do Supabase Auth, em português, para a TELA (D12 da simulação de
 * 2026-10-29). O Auth fala inglês, e a recepção leu "Erro ao criar login do
 * cliente: Password is known to be weak…". Os conhecidos se traduzem pelo
 * `code` (e, nas versões que não o mandam, pela mensagem); o resto vira uma
 * frase genérica — a mensagem crua vai ao log de quem chama, não à tela.
 */
type ErroDoAuth = { code?: string | null; message?: string | null } | null | undefined

export const SENHA_FRACA = 'A senha foi recusada por ser fácil de adivinhar. Escolha outra.'
const GENERICO = 'Não foi possível concluir no sistema de login. Tente de novo; se insistir, avise quem administra a rede.'

const REGRAS: { codigos: string[]; mensagem: RegExp; texto: string }[] = [
  { codigos: ['weak_password'], mensagem: /password.*(weak|at least|should contain|characters)/i, texto: SENHA_FRACA },
  { codigos: ['email_exists', 'user_already_exists'], mensagem: /already (been )?registered|already exists/i,
    texto: 'Este e-mail já está em uso por outra conta.' },
  { codigos: ['email_address_invalid', 'validation_failed'], mensagem: /validate email|email address.*invalid|invalid email/i,
    texto: 'E-mail inválido.' },
  { codigos: ['over_request_rate_limit', 'over_email_send_rate_limit'], mensagem: /rate limit|security purposes|too many/i,
    texto: 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.' },
  { codigos: ['same_password'], mensagem: /different from the old/i, texto: 'A nova senha precisa ser diferente da atual.' },
]

export function erroDoAuth(erro: ErroDoAuth): string {
  if (!erro) return GENERICO
  const regra = REGRAS.find(r => (erro.code && r.codigos.includes(erro.code)) || r.mensagem.test(erro.message ?? ''))
  return regra?.texto ?? GENERICO
}
