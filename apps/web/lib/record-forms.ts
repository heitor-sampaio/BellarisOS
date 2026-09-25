// Helper neutro para montar a ficha preenchida em cada atendimento, a partir
// das entries do prontuário. Usado nos perfis de cliente (staff/admin).
//
// Eram DUAS fichas por entrada — "de anamnese" e "de atendimento" —, que eram a
// mesma coisa com dois nomes. Viraram uma em 2026-09-25.

import { normalizeFormSchema } from '@/lib/anamnesis'
import type { ProfileRecordEntry, ProfileFormSnapshot } from '@/components/branch/client-profile'

interface FormBlob {
  name?:    string
  rows?:    unknown
  answers?: Record<string, unknown>
}

export interface RawMreEntry {
  appointment_id?: string | null
  notes?:          string | null
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

/** Constrói a lista de fichas por atendimento (mais recente primeiro), ignorando entries sem ficha. */
export function buildRecordForms(
  entries: RawMreEntry[],
  procedureNameById: Map<string, string>,
): ProfileRecordEntry[] {
  return entries
    // flatMap em vez de map+filter: com uma ficha só, a entrada sem ficha
    // simplesmente não produz item, e o tipo sai certo sem predicado.
    .flatMap<ProfileRecordEntry>(e => {
      const ficha = toSnapshot(e.form_data?.ficha)
      if (!ficha) return []
      const appointmentId = e.appointment_id ?? ''
      return [{
        appointmentId,
        createdAt:     e.created_at ?? '',
        procedureName: procedureNameById.get(appointmentId) ?? null,
        ficha,
      }]
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}
