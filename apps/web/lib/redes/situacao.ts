/**
 * A situação de uma rede (clínica cliente do BellarisOS) — regra pura, a mesma
 * de `private.rede_bloqueada` no banco.
 *
 * São dois eixos, de propósito:
 *  - `is_active` é o desligamento MANUAL pela plataforma (abuso, pedido da
 *    clínica). Só o admin religa; a cobrança nunca mexe aqui.
 *  - `plan_status` é a ASSINATURA: teste, em dia, em atraso, suspensa (por
 *    atraso além da carência) ou cancelada. Quem escreve é a cobrança (o
 *    webhook do Asaas e o cron), que também desfaz — pagou, volta sozinha.
 *
 * Bloqueada = desligada OU suspensa OU cancelada. Bloqueada, a equipe só vê
 * `/conta-suspensa`, e o portal do paciente fica indisponível.
 */
export const SITUACOES_DO_PLANO = ['trial', 'active', 'past_due', 'suspended', 'canceled'] as const
export type SituacaoDoPlano = typeof SITUACOES_DO_PLANO[number]

export const ROTULO_DA_SITUACAO: Record<SituacaoDoPlano, string> = {
  trial:     'Em teste',
  active:    'Em dia',
  past_due:  'Em atraso',
  suspended: 'Suspensa',
  canceled:  'Cancelada',
}

export function ehSituacaoDoPlano(s: unknown): s is SituacaoDoPlano {
  return (SITUACOES_DO_PLANO as readonly unknown[]).includes(s)
}

export function rotuloDaSituacao(s: string | null | undefined): string {
  return ehSituacaoDoPlano(s) ? ROTULO_DA_SITUACAO[s] : 'Sem situação'
}

export interface SituacaoDaRede {
  ativa: boolean            // tenants.is_active
  planStatus: string | null // tenants.plan_status
}

export type MotivoDoBloqueio = 'desligada' | 'suspensa' | 'cancelada'

/** Por que a rede está bloqueada — ou nulo, se não está. */
export function motivoDoBloqueio(r: SituacaoDaRede): MotivoDoBloqueio | null {
  if (!r.ativa) return 'desligada'
  if (r.planStatus === 'suspended') return 'suspensa'
  if (r.planStatus === 'canceled') return 'cancelada'
  return null
}

export function redeBloqueada(r: SituacaoDaRede): boolean {
  return motivoDoBloqueio(r) !== null
}

/** A situação que a TELA mostra (desligada vence a assinatura). */
export function rotuloDaRede(r: SituacaoDaRede): string {
  return r.ativa ? rotuloDaSituacao(r.planStatus) : 'Desligada'
}
