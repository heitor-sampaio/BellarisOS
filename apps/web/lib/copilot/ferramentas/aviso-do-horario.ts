import 'server-only'
import { ler } from '@/lib/db'
import { avisosDoHorarioCore } from '@/lib/appointments/encaixe'
import { gradeDoCheckout } from '@/lib/checkout/grade-de-horarios'
import { normalizarHorario, type Horario } from '@/lib/agenda/horario'
import type { ContextoDaFerramenta } from '@/lib/copilot/ferramentas/tipos'

/**
 * Os avisos do horário que a janela da agenda dá, no cartão do Copilot (D1 da
 * 34ª simulação; o Copilot faz o que a tela faz — `docs/regras/copilot.md`):
 * o encaixe fora do horário de quem atende e da unidade, da MESMA função das
 * actions do modal (`avisosDoHorarioCore`, a de `avisosDoHorario` e
 * `avisosDoRemarcar`), e — só no agendar, como a janela "+ Agendar" — o
 * horário fora da grade de 30 em 30 minutos da unidade (A17 da 10ª), quando
 * não há o do horário. Só AVISA: o encaixe é permitido (§9.1). O choque e o
 * bloqueio o preparo já recusou.
 */

/** A frase da janela "+ Agendar" (`appointment-modal.tsx`, `data-fora-da-grade`) para a hora fora da grade. */
export function avisoForaDaGrade(horarioDaUnidade: Horario | null, data: string, hora: string): string | null {
  const horas = gradeDoCheckout(horarioDaUnidade, null, data).map(h => h.hora)
  if (!horas.length || horas.includes(hora)) return null
  return `${hora} fica fora da grade de 30 em 30 minutos: é um encaixe (permitido).`
}

export async function avisoDoHorarioNoCartao(c: ContextoDaFerramenta, a: {
  branchId: string; professionalId: string; inicio: Date; procedureId: string | null; duracaoMin: number
  /** O dia e a hora pedidos, no relógio da unidade (para a grade). Sem eles (o remarcar), sem a grade. */
  data?: string; hora?: string
  /** Ao remarcar, o próprio agendamento não conta como choque. */
  excluir?: string | null
  roomId?: string | null
}): Promise<string | null> {
  const avisos = await avisosDoHorarioCore(c.ctx, {
    branchId: a.branchId, professionalId: a.professionalId, scheduledAt: a.inicio.toISOString(),
    procedureId: a.procedureId, durationMin: a.duracaoMin, excluir: a.excluir ?? null, roomId: a.roomId ?? null,
  })
  if (avisos.foraDoHorario) return avisos.foraDoHorario
  if (!a.data || !a.hora) return null
  const unidade = await ler(c.admin.from('branches').select('horario').eq('id', a.branchId).eq('tenant_id', c.ctx.tenantId!).maybeSingle(),
    'ler o horário da unidade') as { horario?: unknown } | null
  return avisoForaDaGrade(normalizarHorario(unidade?.horario), a.data, a.hora)
}
