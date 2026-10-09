import 'server-only'
import type { OfficialConfig } from './types'
import { nomeDaMeta } from './rotulo'

const GRAPH = 'https://graph.facebook.com/v25.0'

/**
 * O nome da conta do número na Meta ("Clínica Bella · +55 48 99999-0000"),
 * para a conexão colada à mão que não recebeu nome (2026-10-09). A Graph é a
 * da caixa — ou a falsa do E2E. Falhou, `null`: o nome é conveniência, não
 * motivo para recusar a credencial (o "Testar" é que diz se ela vale).
 */
export async function nomeDoNumeroNaMeta(config: Partial<OfficialConfig>): Promise<string | null> {
  if (!config.phoneNumberId || !config.accessToken) return null
  const base = (config.graphBase ?? process.env.META_GRAPH_BASE_TESTE ?? GRAPH).replace(/\/$/, '')
  try {
    const res = await fetch(
      `${base}/${encodeURIComponent(config.phoneNumberId)}?fields=verified_name,display_phone_number`,
      { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    return nomeDaMeta(await res.json() as { verified_name?: string; display_phone_number?: string })
  } catch {
    return null
  }
}
