import { cache } from 'react'

/**
 * A sessão de suporte da REQUISIÇÃO em curso — marcada por `getTenantContext`
 * e lida pelo emissor de eventos, para todo fato gravado nela levar
 * `domain_events.suporte_sessao_id` sem cada action precisar repassar.
 *
 * `cache` do React dá um objeto por requisição. Fora de uma (cron, script),
 * cada chamada recebe um novo e a leitura dá nulo — que é o certo: ali não há
 * sessão de suporte.
 */
const marcador = cache((): { sessaoId: string | null } => ({ sessaoId: null }))

export function marcarSessaoDeSuporte(sessaoId: string): void {
  try { marcador().sessaoId = sessaoId } catch { /* fora de requisição */ }
}

export function sessaoDeSuporteDaRequisicao(): string | null {
  try { return marcador().sessaoId } catch { return null }
}
