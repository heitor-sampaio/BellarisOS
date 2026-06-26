'use client'

import { useActionState, useState } from 'react'
import { addProcedure, updateProcedure } from '@/actions/procedures'
import { Sparkles, CheckCircle2 } from 'lucide-react'

const CATEGORIES = [
  'Tratamento Facial', 'Limpeza de Pele', 'Hidratação', 'Peeling',
  'Laser', 'Radiofrequência', 'Ultrassom', 'Drenagem Linfática',
  'Massagem Corporal', 'Depilação', 'Design de Sobrancelha', 'Cílios',
  'Manicure & Pedicure', 'Pacote', 'Outros',
]

interface ProcedureFormProps {
  branchId:    string
  slug:        string
  userId:      string
  isNetworkAdmin: boolean
  existingProcedure?: {
    id:           string
    name:         string
    category:     string
    description?: string | null
    duration_min: number
    price:        string | number
    visible_on_client_app: boolean
  }
  onSuccess?: () => void
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{hint}</span>}
    </div>
  )
}

export function ProcedureForm({ branchId, slug, userId, isNetworkAdmin, existingProcedure, onSuccess }: ProcedureFormProps) {
  const isEdit = !!existingProcedure
  const action = isEdit ? updateProcedure : addProcedure

  const [state, formAction, pending] = useActionState(action, undefined)
  const [price, setPrice] = useState(existingProcedure?.price ? String(existingProcedure.price) : '')

  if (state?.success) onSuccess?.()

  function formatPrice(v: string) {
    const n = v.replace(/\D/g, '')
    return (parseInt(n || '0') / 100).toFixed(2).replace('.', ',')
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="_branchId" value={branchId} />
      <input type="hidden" name="_slug" value={slug} />
      <input type="hidden" name="_userId" value={userId} />
      {isEdit && <input type="hidden" name="_procedureId" value={existingProcedure!.id} />}

      <div className="form-2col">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Nome do procedimento *">
            <input name="name" type="text" required className="field" defaultValue={existingProcedure?.name} placeholder="Peeling de Diamante" />
          </Field>
        </div>

        <Field label="Categoria *">
          <select name="category" required className="field" defaultValue={existingProcedure?.category}>
            <option value="">Selecione…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Duração (minutos) *">
          <input name="duration_min" type="number" min={5} step={5} required className="field" defaultValue={existingProcedure?.duration_min ?? 60} />
        </Field>

        <Field
          label="Preço (R$) *"
          hint={isEdit ? 'Alterar o preço grava histórico automaticamente.' : undefined}
        >
          <input
            name="price" type="text" required className="field"
            value={price}
            onChange={e => setPrice(formatPrice(e.target.value))}
            placeholder="0,00"
          />
        </Field>

        <Field label="Visível no app do cliente">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 6 }}>
            <input
              name="visible_on_client_app" type="checkbox"
              defaultChecked={existingProcedure?.visible_on_client_app ?? true}
              style={{ accentColor: 'var(--brand)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
              Permitir agendamento self-service
            </span>
          </label>
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Descrição">
            <textarea name="description" rows={3} className="field" defaultValue={existingProcedure?.description ?? ''} placeholder="Descreva o procedimento…" style={{ resize: 'vertical' }} />
          </Field>
        </div>
      </div>

      {isNetworkAdmin && !isEdit && (
        <p style={{
          fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
          background: 'var(--brand-soft)', borderRadius: 'var(--radius-field-token)',
          padding: '8px 12px', border: '1px solid var(--brand-soft-border)',
        }}>
          Como Admin da Rede, este procedimento será adicionado ao <strong>catálogo base</strong> e ficará disponível em todas as filiais.
        </p>
      )}

      {state?.error && (
        <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          <CheckCircle2 size={14} /> {isEdit ? 'Procedimento atualizado.' : 'Procedimento criado com sucesso.'}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={pending} className="btn-primary">
          <Sparkles size={15} />
          {pending ? 'Salvando…' : (isEdit ? 'Salvar alterações' : 'Criar procedimento')}
        </button>
      </div>
    </form>
  )
}
