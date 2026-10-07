import 'server-only'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * A clínica mudou um adicional e o total da mensalidade mudou (2026-10-07).
 * Quem fala com o Asaas é o SISTEMA (a clínica não tem a chave nem o código da
 * cobrança): pede a ele, por `/api/interno/levar-valor`, com o segredo entre
 * os apps. Só manda o id da rede — o valor o sistema lê do banco.
 *
 * Acessório, nunca lança: devolve se o sistema confirmou. Falhou, registra e
 * segue — o valor já está gravado, e o cron `assinaturas` do sistema leva o que ficou pendente
 * (`valor_no_asaas_centavos` diferente do total).
 */
export async function pedirAoSistemaLevarValor(tenantId: string): Promise<boolean> {
  try {
    const segredo = process.env.INTERNO_SECRET
    if (!segredo) { console.error('[levar-valor] INTERNO_SECRET não definida'); return false }
    const r = await fetch(`${urlDoHost('sistema')}/api/interno/levar-valor`, {
      method: 'POST',
      headers: { authorization: `Bearer ${segredo}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) console.error('[levar-valor] o sistema respondeu', r.status)
    return r.ok
  } catch (e) {
    console.error('[levar-valor]', (e as Error).message)
    return false
  }
}
