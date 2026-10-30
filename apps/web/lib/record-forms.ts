// Helper neutro para montar a ficha preenchida em cada atendimento, a partir
// das entries do prontuário. Usado nos perfis de cliente (staff/admin).
//
// Eram DUAS fichas por entrada — "de anamnese" e "de atendimento" —, que eram a
// mesma coisa com dois nomes. Viraram uma em 2026-09-25.

import { normalizeFormSchema } from '@/lib/anamnesis'
import { dayKeyTZ } from '@/lib/datetime'
import type { ProfileRecordEntry, ProfileFormSnapshot } from '@/components/branch/client-profile'

interface FormBlob {
  name?:    string
  rows?:    unknown
  answers?: Record<string, unknown>
}

export interface RawMreEntry {
  appointment_id?: string | null
  notes?:          string | null
  intercurrences?: string | null
  /** As dores do cliente (D3, 2026-10-28). */
  queixas?:        string | null
  form_data?:      { ficha?: FormBlob } | null
  created_at?:     string
}

function toSnapshot(blob: FormBlob | undefined | null): ProfileFormSnapshot | null {
  if (!blob) return null
  const rows = normalizeFormSchema({ rows: blob.rows }).rows
  if (rows.length === 0) return null
  return {
    name:    blob.name ?? 'Ficha',
    rows,
    answers: (blob.answers && typeof blob.answers === 'object') ? blob.answers : {},
  }
}

/** dd/mm/aaaa no fuso do negócio, ou vazio. */
function diaNoFuso(iso: string | null): string {
  if (!iso) return ''
  const [ano, mes, dia] = dayKeyTZ(iso).split('-')
  return `${dia}/${mes}/${ano}`
}

/** O texto clínico, ou nulo quando está vazio (só espaço conta como vazio). */
function texto(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t ? t : null
}

/**
 * Os atendimentos com REGISTRO clínico, mais recente primeiro: a evolução, a
 * intercorrência, as dores (D3, 2026-10-28) e a ficha do procedimento. Basta um — a avaliação
 * não tem ficha ligada, e a evolução dela sumia da aba Prontuário (D4 da
 * simulação de 2026-10-27). Só a entrada sem nada fica de fora.
 */
export function buildRecordForms(
  entries: RawMreEntry[],
  procedureNameById: Map<string, string>,
  /** A hora marcada de cada atendimento (J-56): o dia que a entrada mostra. */
  horaMarcadaPorId: Map<string, string> = new Map(),
): ProfileRecordEntry[] {
  return entries
    .flatMap<ProfileRecordEntry>(e => {
      const ficha           = toSnapshot(e.form_data?.ficha)
      const evolucao        = texto(e.notes)
      const intercorrencias = texto(e.intercurrences)
      const queixas         = texto(e.queixas)
      if (!ficha && !evolucao && !intercorrencias && !queixas) return []
      const appointmentId = e.appointment_id ?? ''
      return [{
        appointmentId,
        createdAt:     e.created_at ?? '',
        // O dia do ATENDIMENTO, no fuso do negócio (J-56) — o mesmo da aba
        // Documentos (atendimentoDoAnexo). Era o da gravação: o das 23:30
        // concluído à meia-noite e pouco aparecia no dia seguinte.
        diaDoAtendimento: diaNoFuso(horaMarcadaPorId.get(appointmentId) ?? e.created_at ?? null),
        procedureName: procedureNameById.get(appointmentId) ?? null,
        ficha,
        evolucao,
        intercorrencias,
        queixas,
      }]
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}
