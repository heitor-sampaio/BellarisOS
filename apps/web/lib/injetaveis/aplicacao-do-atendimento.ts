import type { InjectablePoint as PontoDoMapa } from '@/lib/anamnesis'

/**
 * A aplicação de UM atendimento são só os pontos aplicados nele (D2 da 37ª
 * simulação; PT-13, PT-19 e a Decisão C3 — decisão do Claude, 27/11,
 * princípio 3). O mapa é o planejamento vivo da cliente: a toxina de manhã e
 * o retoque à tarde no MESMO mapa faziam o "Registrar aplicação" do retoque
 * copiar o mapa inteiro (60 UI), e o histórico somava 110 UI no dia contra 60
 * de baixa.
 *
 * O ponto diz em que atendimento foi aplicado (`InjectablePoint.atendimento`);
 * o ponto de antes, sem a marca, é de outro atendimento quando está numa
 * aplicação dele (`pontosDeOutroAtendimento`). Módulo neutro: a tela e o
 * servidor usam.
 */

/**
 * O ponto do mapa com o atendimento em que foi aplicado (o JSON do ponto leva
 * a marca; o ponto de antes não a tem).
 */
export type InjectablePoint = PontoDoMapa & { atendimento?: string }

type Aplicacao = { appointmentId: string | null; points: readonly { id: string }[] }

/** Os pontos deste mapa já registrados numa aplicação de OUTRO atendimento. */
export function pontosDeOutroAtendimento(aplicacoes: readonly Aplicacao[], atendimento: string): Set<string> {
  const ids = new Set<string>()
  for (const a of aplicacoes) {
    if (a.appointmentId === atendimento) continue
    for (const p of a.points ?? []) if (p?.id) ids.add(p.id)
  }
  return ids
}

/** O ponto foi aplicado em outro atendimento (a marca dele, ou, sem ela, a aplicação de outro). */
export function ehDeOutroAtendimento(p: InjectablePoint, atendimento: string, deOutro: ReadonlySet<string>): boolean {
  return p.atendimento ? p.atendimento !== atendimento : deOutro.has(p.id)
}

/**
 * Os pontos que vão à aplicação deste atendimento, marcados com ele. Sem
 * nenhum ponto novo aqui, é o plano inteiro aplicado de novo (a reaplicação
 * do mesmo planejamento, meses depois).
 */
export function pontosDaAplicacao(
  points: readonly InjectablePoint[], atendimento: string, deOutro: ReadonlySet<string>,
): InjectablePoint[] {
  const deste = points.filter(p => !ehDeOutroAtendimento(p, atendimento, deOutro))
  return (deste.length ? deste : points).map(p => ({ ...p, atendimento }))
}

/**
 * A dose aplicada que o "Registrar aplicação" grava (o Heitor, 27/11: "Um botão
 * só, "Registrar aplicação" (a proposta)" — saiu o "Confirmar aplicação", que
 * fazia esta conta antes): nos pontos deste atendimento, a que alguém escreveu
 * ou, sem ela, a prevista; os de outro ficam com 0 hoje (quem os aplicou de
 * novo escreve a dose, e o ponto passa a ser deste). Sem ponto novo, o plano
 * inteiro, com a dose prevista. A coluna "Aplicado" da tela mostra esta mesma
 * conta antes do registro (princípio 3).
 */
export function aplicadoAoRegistrar(
  points: readonly InjectablePoint[], atendimento: string, deOutro: ReadonlySet<string>,
): InjectablePoint[] {
  const temDeste = points.some(p => !ehDeOutroAtendimento(p, atendimento, deOutro))
  if (!temDeste) return points.map(p => ({ ...p, applied: p.dose, atendimento }))
  return points.map(p => ehDeOutroAtendimento(p, atendimento, deOutro)
    ? { ...p, applied: 0 }
    : { ...p, applied: p.applied ?? p.dose, atendimento })
}

/**
 * A dose que alguém ESCREVEU no ponto neste atendimento, ou nada (R44, o
 * Heitor, 28/11: "Vazio, com a dose do plano como sugestão (a proposta)"). O
 * campo "Aplicado" mostra esta; a que o "Registrar aplicação" vai gravar
 * (`aplicadoAoRegistrar`) vira a sugestão apagada dentro dele. O ponto
 * aplicado em outro atendimento não foi aplicado neste: fica vazio.
 */
export function aplicadoEscrito(p: InjectablePoint, atendimento: string, deOutro: ReadonlySet<string>): number | null {
  if (ehDeOutroAtendimento(p, atendimento, deOutro)) return null
  return p.applied ?? null
}
