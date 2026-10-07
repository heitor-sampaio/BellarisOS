import { createAdminClient } from '../supabase/admin'
import { getCachedRede } from '../redes/cache'
import { limiteDe, type ChaveDeLimite } from './recursos'
import { DIGEST_LIMITE_DO_PLANO } from './limite-digest'

/**
 * Os LIMITES do plano (2026-10-06): unidades, membros da equipe e números de
 * WhatsApp ATIVOS. Criar ou reativar o que passaria do limite é recusado — para
 * o dono também; o que já existe acima dele não é apagado (só não cresce).
 * Sem plano, ou "ilimitado" (null), passa. O catálogo mora em `recursos.ts`.
 */

/** Mais um passaria do limite? (null = ilimitado.) */
export function passaDoLimite(limite: number | null, atual: number): boolean {
  return limite !== null && atual + 1 > limite
}

const ROTULO: Record<ChaveDeLimite, [string, string]> = {
  unidades: ['unidade', 'unidades'],
  membros:  ['membro na equipe', 'membros na equipe'],
  whatsapp: ['número de WhatsApp', 'números de WhatsApp'],
}

export function mensagemDoLimite(chave: ChaveDeLimite, limite: number): string {
  const [um, varios] = ROTULO[chave]
  return `O plano da sua rede permite até ${limite} ${limite === 1 ? um : varios}. Para ampliar, fale com o BellarisOS.`
}

/**
 * O erro de limite que ATRAVESSA até a tela (o digest mora em
 * `limite-digest.ts`). Para as actions chamadas por formulário que não lê o
 * retorno (reativar unidade, reativar membro); as outras devolvem `{ error }`.
 */
export { DIGEST_LIMITE_DO_PLANO, ehLimiteDoPlano } from './limite-digest'

export function limiteDoPlano(mensagem: string): Error & { digest: string } {
  const erro = new Error(mensagem) as Error & { digest: string }
  erro.digest = DIGEST_LIMITE_DO_PLANO
  return erro
}

const TABELA: Record<ChaveDeLimite, 'branches' | 'users' | 'whatsapp_numbers'> = {
  unidades: 'branches', membros: 'users', whatsapp: 'whatsapp_numbers',
}

/**
 * Cabe mais um? Devolve a MENSAGEM de recusa, ou null quando cabe. Conta os
 * ATIVOS da rede (unidades, membros, números); o retrato vem do cache da rede.
 * Erro ao contar: recusa — na dúvida, não passa do que foi contratado.
 */
export async function conferirLimite(tenantId: string, chave: ChaveDeLimite): Promise<string | null> {
  const rede = await getCachedRede(tenantId)
  const limite = limiteDe(rede?.recursos ?? null, chave)
  if (limite === null) return null
  const { count, error } = await createAdminClient()
    .from(TABELA[chave]).select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('is_active', true)
  if (error) {
    console.error(`[planos] contar ${chave}:`, error.message)
    return mensagemDoLimite(chave, limite)
  }
  return passaDoLimite(limite, count ?? 0) ? mensagemDoLimite(chave, limite) : null
}
