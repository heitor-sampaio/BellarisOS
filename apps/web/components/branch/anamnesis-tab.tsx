'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Edit2, Save, X, Loader2, ClipboardList } from 'lucide-react'
import { saveGeneralAnamnesis } from '@/actions/anamnesis'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneralAnamnesis {
  skinType:                  string
  allergies:                 string
  medications:               string
  healthConditions:          string
  previousProcedures:        string
  isPregnantOrBreastfeeding: boolean
  useSunscreen:              boolean
  observations:              string
  updatedAt?:                string
  updatedBy?:                string
}

interface Props {
  anamnesis:        GeneralAnamnesis | null
  clientId:         string
  branchId:         string
  slug:             string
  canEdit:          boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SKIN_TYPES = [
  { value: '',         label: 'Não informado' },
  { value: 'normal',   label: 'Normal' },
  { value: 'seca',     label: 'Seca' },
  { value: 'oleosa',   label: 'Oleosa' },
  { value: 'mista',    label: 'Mista' },
  { value: 'sensivel', label: 'Sensível' },
]

const SKIN_TYPE_LABEL: Record<string, string> = Object.fromEntries(SKIN_TYPES.map(s => [s.value, s.label]))

// ── Helpers ───────────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color: value ? 'var(--text)' : 'var(--text-faint)', lineHeight: 1.6 }}>
        {value || 'Não informado'}
      </p>
    </div>
  )
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </p>
      <span style={{
        display: 'inline-block', fontSize: 12, fontWeight: 700,
        padding: '2px 10px', borderRadius: 10,
        background: value ? '#e7fcf0' : 'var(--bg-app)',
        color:      value ? '#3a9b6f' : 'var(--text-faint)',
      }}>
        {value ? 'Sim' : 'Não'}
      </span>
    </div>
  )
}

// ── Read-only view ─────────────────────────────────────────────────────────────

function AnamnesisView({ data, onEdit, canEdit }: { data: GeneralAnamnesis; onEdit: () => void; canEdit: boolean }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <ClipboardList size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Ficha de anamnese</h3>
        {data.updatedAt && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            Atualizado em {new Date(data.updatedAt).toLocaleDateString('pt-BR')}
          </span>
        )}
        {canEdit && (
          <button type="button" onClick={onEdit} className="btn-secondary" style={{ fontSize: 12, gap: 5 }}>
            <Edit2 size={12} /> Editar
          </button>
        )}
      </div>

      <div className="form-2col" style={{ padding: '20px 24px', gap: '18px 28px' }}>
        <FieldRow label="Tipo de pele"          value={SKIN_TYPE_LABEL[data.skinType] || 'Não informado'} />
        <BoolRow  label="Usa protetor solar"     value={data.useSunscreen} />
        <BoolRow  label="Grávida ou amamentando" value={data.isPregnantOrBreastfeeding} />
        <FieldRow label="Alergias"               value={data.allergies} />
        <FieldRow label="Medicamentos em uso"    value={data.medications} />
        <FieldRow label="Condições de saúde"     value={data.healthConditions} />
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldRow label="Procedimentos anteriores" value={data.previousProcedures} />
        </div>
        {data.observations && (
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldRow label="Observações gerais" value={data.observations} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Anamnesis form ─────────────────────────────────────────────────────────────

function AnamnesisForm({
  initial, clientId, branchId, slug, onClose,
}: {
  initial:  GeneralAnamnesis | null
  clientId: string
  branchId: string
  slug:     string
  onClose:  () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(saveGeneralAnamnesis, null)

  if (state !== null && !state?.error && !pending) {
    onClose()
    router.refresh()
    return null
  }

  const def = initial ?? {} as Partial<GeneralAnamnesis>

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <ClipboardList size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)', flex: 1 }}>
          {initial ? 'Editar anamnese' : 'Preencher ficha de anamnese'}
        </h3>
        <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}>
          <X size={14} />
        </button>
      </div>

      <form action={action} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="branch_id" value={branchId} />
        <input type="hidden" name="slug"      value={slug} />

        {/* Row 1: tipo de pele + protetor + grávida */}
        <div className="form-3col" style={{ gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Tipo de pele</label>
            <select name="skinType" className="field" defaultValue={def.skinType ?? ''}>
              {SKIN_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Usa protetor solar?</label>
            <select name="useSunscreen" className="field" defaultValue={def.useSunscreen ? 'true' : 'false'}>
              <option value="false">Não</option>
              <option value="true">Sim</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Grávida ou amamentando?</label>
            <select name="isPregnantOrBreastfeeding" className="field" defaultValue={def.isPregnantOrBreastfeeding ? 'true' : 'false'}>
              <option value="false">Não</option>
              <option value="true">Sim</option>
            </select>
          </div>
        </div>

        {/* Row 2: alergias + medicamentos */}
        <div className="form-2col" style={{ gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Alergias</label>
            <textarea
              name="allergies"
              defaultValue={def.allergies ?? ''}
              rows={3}
              placeholder="Ex: Látex, penicilina, frutos do mar…"
              className="field"
              style={{ resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Medicamentos em uso</label>
            <textarea
              name="medications"
              defaultValue={def.medications ?? ''}
              rows={3}
              placeholder="Ex: Anticoagulantes, isotretinoína…"
              className="field"
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Row 3: condições + procedimentos anteriores */}
        <div className="form-2col" style={{ gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Condições de saúde</label>
            <textarea
              name="healthConditions"
              defaultValue={def.healthConditions ?? ''}
              rows={3}
              placeholder="Ex: Diabetes, hipertensão, doenças autoimunes…"
              className="field"
              style={{ resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">Procedimentos estéticos anteriores</label>
            <textarea
              name="previousProcedures"
              defaultValue={def.previousProcedures ?? ''}
              rows={3}
              placeholder="Ex: Botox há 6 meses, preenchimento labial…"
              className="field"
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Row 4: observações */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label">Observações gerais</label>
          <textarea
            name="observations"
            defaultValue={def.observations ?? ''}
            rows={3}
            placeholder="Anotações adicionais relevantes para os procedimentos…"
            className="field"
            style={{ resize: 'vertical' }}
          />
        </div>

        {state?.error && (
          <p style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button type="button" onClick={onClose} className="btn-secondary" style={{ gap: 5 }}>
            <X size={13} /> Cancelar
          </button>
          <button type="submit" disabled={pending} className="btn-primary" style={{ gap: 6, minWidth: 140, justifyContent: 'center' }}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {pending ? 'Salvando…' : 'Salvar anamnese'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AnamnesisTab({ anamnesis, clientId, branchId, slug, canEdit }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing || (!anamnesis && canEdit)) {
    return (
      <AnamnesisForm
        initial={anamnesis}
        clientId={clientId}
        branchId={branchId}
        slug={slug}
        onClose={() => setEditing(false)}
      />
    )
  }

  if (anamnesis) {
    return <AnamnesisView data={anamnesis} onEdit={() => setEditing(true)} canEdit={canEdit} />
  }

  // No data, no permission
  return (
    <div className="card" style={{ padding: '48px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: 'var(--brand-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ClipboardList size={22} style={{ color: 'var(--brand)' }} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
        Anamnese não preenchida
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', maxWidth: 280 }}>
        A ficha de anamnese ainda não foi preenchida para esta cliente.
      </p>
    </div>
  )
}
