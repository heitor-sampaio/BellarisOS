import crypto from 'node:crypto'

/**
 * O cookie de VOLTA do atendente (`bellaris_suporte_volta`).
 *
 * Ao entrar como alguém, os cookies da sessão do Supabase passam a ser os do
 * membro; o refresh token do atendente fica guardado aqui, CIFRADO (AES-256-GCM)
 * e httpOnly, para o "Sair" devolvê-lo ao painel sem pedir login de novo.
 *
 * A chave é DERIVADA (HKDF) da service role, que só o servidor tem — sem uma
 * variável de ambiente a mais para esquecer de configurar. Trocar a service
 * role invalida as voltas em curso (o atendente só faz login de novo).
 */
export const COOKIE_DA_VOLTA = 'bellaris_suporte_volta'

function chave(): Buffer {
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!segredo) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para cifrar a volta do suporte.')
  return Buffer.from(crypto.hkdfSync('sha256', segredo, 'bellaris', 'suporte-volta', 32))
}

export interface Volta {
  /** A sessão de suporte a que esta volta pertence. */
  sessaoId: string
  /** O refresh token do atendente. */
  refresh:  string
}

export function cifrarVolta(volta: Volta): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv)
  const corpo = Buffer.concat([c.update(JSON.stringify(volta), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64url')
}

/** A volta decifrada, ou `null` se adulterada, de outra chave ou malformada. */
export function decifrarVolta(texto: string | undefined | null): Volta | null {
  if (!texto) return null
  try {
    const bruto = Buffer.from(texto, 'base64url')
    const iv = bruto.subarray(0, 12)
    const tag = bruto.subarray(12, 28)
    const corpo = bruto.subarray(28)
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv)
    d.setAuthTag(tag)
    const json = Buffer.concat([d.update(corpo), d.final()]).toString('utf8')
    const v = JSON.parse(json) as Partial<Volta>
    return typeof v.sessaoId === 'string' && typeof v.refresh === 'string' ? { sessaoId: v.sessaoId, refresh: v.refresh } : null
  } catch {
    return null
  }
}
