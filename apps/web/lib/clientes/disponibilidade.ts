import 'server-only'
import { getCachedRede } from '@/lib/cached-queries'
import { redeBloqueada } from '@/lib/redes/situacao'

/**
 * O portal desta clínica ABRE para a cliente? Não, se a rede está bloqueada
 * (assinatura suspensa/cancelada, ou desligada pela plataforma) ou se o plano
 * dela não tem o portal — as duas regras que o `buildContext` já aplicava.
 *
 * Com a mesma pessoa em várias clínicas (2026-10-19), uma clínica fechada não
 * tranca a conta dela inteira: o contexto, o destino do login e o seletor
 * pulam a fechada; "conta suspensa" só quando nenhuma abre.
 */
export async function clinicaAbreParaCliente(tenantId: string): Promise<boolean> {
  const rede = await getCachedRede(tenantId)
  if (!rede) return true
  if (redeBloqueada(rede)) return false
  return !rede.recursos || rede.recursos.funcionalidades.includes('portal')
}

/** As fichas (com endereço de portal) cujas clínicas abrem. */
export async function fichasQueAbrem<F extends { tenantId: string; slug: string | null }>(fichas: F[]): Promise<F[]> {
  const comPortal = fichas.filter(f => f.slug)
  const abre = await Promise.all(comPortal.map(f => clinicaAbreParaCliente(f.tenantId)))
  return comPortal.filter((_, i) => abre[i])
}
