import 'server-only'
import { createClient } from '../supabase/server'
import { getPlatformContext } from './contexto'

/**
 * A verificação em duas etapas de quem é da plataforma (TOTP do Supabase).
 *
 * Obrigatória: sem ela (`aal2`) nem o sistema nem o suporte abrem — o painel
 * enxerga todas as redes, e uma senha vazada não pode bastar. Roda em Server
 * Function porque é ela que grava os cookies da sessão promovida a aal2: cada
 * app tem as suas actions finas (`actions/verificacao.ts`) que chamam estas.
 */

export interface EstadoDaVerificacao {
  /** Já tem autenticador cadastrado e verificado. */
  temFator: boolean
  factorId: string | null
}

export async function estadoDaVerificacao(): Promise<EstadoDaVerificacao> {
  await getPlatformContext({ semVerificacao: true })
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.listFactors()
  const verificado = (data?.totp ?? []).find(f => f.status === 'verified')
  return { temFator: !!verificado, factorId: verificado?.id ?? null }
}

/**
 * Começa o cadastro do autenticador: o QR e o segredo (para digitar à mão).
 * Fator não confirmado de uma tentativa anterior é descartado antes — o Auth
 * recusa dois com o mesmo nome.
 */
export async function iniciarCadastroDoAutenticador(): Promise<
  { ok: true; factorId: string; qr: string; segredo: string } | { ok: false; error: string }
> {
  await getPlatformContext({ semVerificacao: true })
  const supabase = await createClient()
  const { data: fatores } = await supabase.auth.mfa.listFactors()
  if ((fatores?.totp ?? []).some(f => f.status === 'verified')) {
    return { ok: false, error: 'Você já tem um autenticador. Digite o código dele.' }
  }
  for (const f of fatores?.all ?? []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BellarisOS' })
  if (error || !data) return { ok: false, error: `Não consegui começar o cadastro: ${error?.message ?? 'sem resposta'}` }
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret }
}

/** Confirma o código de 6 dígitos — no cadastro ou em cada login. */
export async function confirmarCodigo(factorId: string, codigo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await getPlatformContext({ semVerificacao: true })
  const code = typeof codigo === 'string' ? codigo.replace(/\D/g, '') : ''
  if (typeof factorId !== 'string' || !factorId || code.length !== 6) return { ok: false, error: 'Digite os 6 dígitos do autenticador.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (error) return { ok: false, error: 'Código inválido ou vencido. Tente o próximo.' }
  return { ok: true }
}
