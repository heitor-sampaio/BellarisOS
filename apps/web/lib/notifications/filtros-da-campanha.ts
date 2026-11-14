import type { AudienceRules } from '@/actions/notification-campaigns'
import type { FiltrosDoPublico } from '@/lib/clientes/publico'

const DIA_MS = 24 * 3600 * 1000

/**
 * As regras gravadas da campanha (`audience_rules`) viram os filtros do
 * público — UMA conta, que a prévia (`previewAudienceCount`), o disparo
 * (`dispatchCampaignInline`) e o cron das automáticas usam.
 *
 * D1 da 9ª simulação (2026-11-07): cada lugar montava o filtro à mão e o
 * `max_days_since_visit` não chegava a nenhum — a "Reativação 60 dias" iria a
 * TODA cliente, inclusive a quem veio ontem. Toda chave de `AudienceRules`
 * passa por aqui (`tests/campanha-filtros-chegam-ao-disparo.test.ts` trava).
 *
 * "Sem visita há mais de N dias": nenhum atendimento concluído desde N dias
 * atrás (nem a última visita do sistema de antes) E cliente da clínica de
 * antes disso — a cadastrada ontem não "sumiu" (a régua do "Reativar
 * clientes", `indicadores.md`).
 */
export function filtrosDaCampanha(regras: AudienceRules, agora: Date = new Date()): FiltrosDoPublico {
  const corte = regras.max_days_since_visit && regras.max_days_since_visit > 0
    ? new Date(agora.getTime() - regras.max_days_since_visit * DIA_MS).toISOString()
    : undefined
  return {
    ...(regras.genders?.length       && { genders: regras.genders }),
    ...(regras.tags?.length          && { tags: regras.tags }),
    ...(regras.procedure_ids?.length && { procedure_ids: regras.procedure_ids }),
    has_app_account: regras.has_app_account === true,
    ...(corte && { sem_retorno_desde: corte, cliente_desde_antes: corte }),
    ...(regras.min_visits && regras.min_visits > 0 && { min_visitas: regras.min_visits }),
  }
}
