// Helper neutro para montar as fichas (anamnese + atendimento) preenchidas por atendimento,
// a partir das entries do prontuário. Usado nos perfis de cliente (staff/admin).

import { normalizeFormSchema } from '@/lib/anamnesis'
import type { ProfileRecordEntry, ProfileFormSnapshot } from '@/components/branch/client-profile'

interface FormBlob {
  name?:    string
  rows?:    unknown
  answers?: Record<string, unknown>
}

export interface RawMreEntry {
  appointment_id?:  string | null
  notes?:           string | null
  anamnesis_data?:  { customForm?: FormBlob } | null
  attendance_data?: { attendanceForm?: FormBlob } | null
  created_at?:      string
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

/** Constrói a lista de fichas por atendimento (mais recente primeiro), ignorando entries sem ficha. */
export function buildRecordForms(
  entries: RawMreEntry[],
  procedureNameById: Map<string, string>,
): ProfileRecordEntry[] {
  return entries
    .map(e => {
      const anamnesis  = toSnapshot(e.anamnesis_data?.customForm)
      const attendance = toSnapshot(e.attendance_data?.attendanceForm)
      if (!anamnesis && !attendance) return null
      const appointmentId = e.appointment_id ?? ''
      return {
        appointmentId,
        createdAt:     e.created_at ?? '',
        procedureName: procedureNameById.get(appointmentId) ?? null,
        anamnesis,
        attendance,
      } satisfies ProfileRecordEntry
    })
    .filter((x): x is ProfileRecordEntry => x !== null)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}
