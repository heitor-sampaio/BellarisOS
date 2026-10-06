import { cache } from 'react'
import { createClient } from '../supabase/server'
import { createAdminClient } from '../supabase/admin'

/**
 * Quando a sessão de quem é da plataforma para em `/verificacao`.
 *
 * A verificação em duas etapas (TOTP, `aal2`) é OPÇÃO do admin do sistema
 * (`platform_settings.exigir_verificacao`, Configurações do sistema) — decisão
 * do Heitor, 2026-10-06; nasce desligada. Era obrigatória desde 2026-10-03.
 *  - já verificada (aal2): nunca;
 *  - a plataforma exige: sempre (quem não tem autenticador cadastra);
 *  - não exige, mas a pessoa TEM autenticador (o próximo nível é aal2): sim —
 *    senão cadastrar um não valeria nada.
 * Prova: `tests/plataforma-verificacao-exigida.test.ts` e o "OPÇÃO do admin"
 * de `e2e/suporte-plataforma.spec.ts`.
 */
export function verificacaoPendente(x: {
  exigida: boolean
  nivelAtual: string | null | undefined
  proximoNivel: string | null | undefined
}): boolean {
  if (x.nivelAtual === 'aal2') return false
  return x.exigida || x.proximoNivel === 'aal2'
}

/**
 * A plataforma exige a verificação? Lida a cada requisição (é uma linha, e o
 * sistema e o suporte veem a mudança na hora, sem cache a expirar entre os
 * processos). Erro ao ler conta como EXIGE: na dúvida, a porta fecha.
 */
export const plataformaExigeVerificacao = cache(async function plataformaExigeVerificacao(): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('platform_settings').select('exigir_verificacao').eq('id', 1).maybeSingle<{ exigir_verificacao: boolean }>()
  if (error) {
    console.error('[plataforma] ler a opção da verificação:', error.message)
    return true
  }
  return data?.exigir_verificacao ?? true
})

/** A sessão desta requisição: pendente de verificação? e já verificada (aal2)? */
export const verificacaoDaSessao = cache(async function verificacaoDaSessao(): Promise<{ pendente: boolean; verificada: boolean }> {
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const exigida = await plataformaExigeVerificacao()
  const nivelAtual = data?.currentLevel ?? null
  return {
    pendente: verificacaoPendente({ exigida, nivelAtual, proximoNivel: data?.nextLevel ?? null }),
    verificada: nivelAtual === 'aal2',
  }
})
