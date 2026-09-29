import 'server-only'
import { randomBytes, createHash } from 'node:crypto'

/**
 * O link público de assinatura.
 *
 * O token tem 32 bytes aleatórios (base64url) e só o SHA-256 dele vai para o
 * banco — como senha: quem lê a tabela não consegue montar um link. Por isso
 * o link não se "mostra de novo": perdeu, gera outro (que revoga o anterior).
 */

export const VALIDADE_DO_LINK_DIAS = 7

export function novoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashDoToken(token) }
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Tem cara de token nosso? Barra lixo antes de ir ao banco. */
export function tokenValido(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
}

/** CPF só com dígitos, ou nulo. */
export function soDigitos(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const d = v.replace(/\D/g, '')
  return d.length ? d.slice(0, 14) : null
}

/** `AAAA-MM-DD` válido, ou nulo. */
export function dataIso(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(v + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

/** Telefone do cliente no formato do wa.me (55 + DDD + número), ou nulo. */
export function telefoneParaWhatsApp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return '55' + d
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return null
}

export type EstadoDoLink = 'valido' | 'invalido' | 'usado' | 'revogado' | 'vencido' | 'indisponivel'

export const MENSAGEM_DO_ESTADO: Record<Exclude<EstadoDoLink, 'valido'>, string> = {
  invalido:     'Este link não existe. Confira se ele foi copiado inteiro, ou peça um novo à clínica.',
  usado:        'Este documento já foi assinado por este link. Se precisar de uma cópia, peça à clínica.',
  revogado:     'Este link não vale mais. Peça um novo à clínica.',
  vencido:      'Este link venceu. Peça um novo à clínica.',
  indisponivel: 'Este documento não está mais esperando assinatura. Fale com a clínica.',
}
