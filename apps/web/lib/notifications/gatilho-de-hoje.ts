import { lerPublico, contarPublicoComAparelho } from '@/lib/clientes/publico'
import { filtrosDaCampanha } from '@/lib/notifications/filtros-da-campanha'
import { partsInTZ } from '@/lib/datetime'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import type { AudienceRules, TriggerType } from '@/actions/notification-campaigns'

/**
 * A data de TODO ANO da campanha agendada — se hoje é o dia (a conta do cron,
 * `app/api/cron/notification-campaigns`) e o "Quem receberia hoje" do detalhe
 * da campanha, num lugar só (D10 da 12ª simulação, 2026-11-11; princípio 3: o
 * detalhe diz quantas recebem HOJE, não o público inteiro). Só as clientes do
 * público da campanha (`filtrosDaCampanha`, no banco). Fora de `actions/`:
 * recebe a rede pela campanha, e quem chama já conferiu.
 *
 * Os gatilhos de cada cliente (aniversário, lembrete, pós-visita, vencimento
 * de pacote) saíram da campanha em 2026-11-14 (MK1): são modelos nas
 * Automações (AU1), e a busca de cada um mora lá.
 */

export type Destinatario = { id: string; name: string }

export interface CampanhaDoGatilho {
  tenant_id:      string
  trigger_type:   TriggerType | null
  trigger_config: Record<string, unknown> | null
  audience_rules: AudienceRules | null
}

/** Hoje (mês e dia no relógio da rede) é a data de todo ano da campanha? */
export function ehADataDeTodoAno(cfg: Record<string, unknown> | null | undefined, hoje: { month: number; day: number }): boolean {
  const c = (cfg ?? {}) as { month?: number; day?: number }
  return !!c.month && !!c.day && c.month === hoje.month && c.day === hoje.day
}

/**
 * O "Quem receberia hoje" da campanha de todo ano: quantas recebem HOJE e
 * quantas delas têm o app, com a frase da tela. Nulo para a campanha sem data
 * de todo ano.
 */
export async function quemReceberiaHoje(camp: CampanhaDoGatilho, agora = new Date()): Promise<{ hoje: number; comAparelho: number; texto: string } | null> {
  if (camp.trigger_type !== 'ANNUAL_DATE') return null
  const cfg = (camp.trigger_config ?? {}) as { month?: number; day?: number }
  // O relógio da rede (F62), o mesmo do cron.
  const fuso = await fusoDaRede(camp.tenant_id)
  const p = partsInTZ(agora, fuso)
  const dd = (x: number | undefined) => String(x ?? 0).padStart(2, '0')
  const quem: Destinatario[] = ehADataDeTodoAno(cfg, p)
    ? await lerPublico(camp.tenant_id, filtrosDaCampanha(camp.audience_rules ?? {}))
    : []
  if (!quem.length) {
    return {
      hoje: 0, comAparelho: 0,
      texto: ehADataDeTodoAno(cfg, p)
        ? 'Hoje é a data, e ninguém do público: a campanha não sai para ninguém hoje.'
        : `Hoje não é ${dd(cfg.day)}/${dd(cfg.month)}: a campanha não sai hoje.`,
    }
  }
  const comAparelho = await contarPublicoComAparelho(camp.tenant_id, {
    ...filtrosDaCampanha(camp.audience_rules ?? {}), client_ids: quem.map(c => c.id),
  })
  const recebem = comAparelho === 0
    ? 'nenhuma tem o aviso no celular ligado'
    : `${comAparelho} ${comAparelho === 1 ? 'vai' : 'vão'} receber o aviso no celular`
  const n = quem.length
  return { hoje: n, comAparelho, texto: `Hoje é a data: ${n} ${n === 1 ? 'cliente no público' : 'clientes no público'} · ${recebem}.` }
}
