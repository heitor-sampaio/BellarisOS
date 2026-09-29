import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyClient } from '@/lib/notifications/notify'
import { formatarPontos } from './formato'

/**
 * Bônus de primeiro acesso (opcional da rede). Chamado no login do cliente.
 *
 * Quem decide é o banco (`fidelidade_primeiro_acesso`): marca o primeiro acesso
 * só se ainda não havia e, nesse caso, dá o bônus que a rede configurou — uma
 * vez por conta, pela `bonus_ref`. Aqui só se chama e se avisa.
 *
 * Nunca lança: o bônus é acessório, e a pessoa tem de entrar mesmo com ele
 * falhando.
 */
export async function bonusDePrimeiroAcesso(clientId: string): Promise<number> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('fidelidade_primeiro_acesso', { p_cliente: clientId })
    if (error) {
      console.error('[bonusDePrimeiroAcesso]', error.message)
      return 0
    }
    const pontos = Number(data ?? 0)
    if (pontos > 0) {
      after(() => notifyClient(admin, clientId, {
        type:  'fidelidade_bonus',
        title: 'Boas-vindas!',
        body:  `Você ganhou ${formatarPontos(pontos)} pelo primeiro acesso.`,
      }))
    }
    return pontos
  } catch (e) {
    console.error('[bonusDePrimeiroAcesso]', (e as Error).message)
    return 0
  }
}
