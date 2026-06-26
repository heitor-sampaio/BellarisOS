'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addClient, updateClient } from '@/actions/clients'
import { UserPlus, X, CheckCircle2 } from 'lucide-react'

const TAGS = ['VIP', 'Indicação', 'Retorno', 'Alergias', 'Gestante', 'Idoso', 'Plano', 'Desconto']

const GENDERS = [
  { value: 'F', label: 'Feminino' },
  { value: 'M', label: 'Masculino' },
  { value: 'O', label: 'Outro' },
  { value: 'N', label: 'Prefiro não informar' },
]

interface ClientFormProps {
  branchId: string
  slug:     string
  existingClient?: {
    id:         string
    name:       string
    phone:      string
    email?:     string | null
    document?:  string | null
    birth_date?: string | null
    gender?:    string | null
    notes?:     string | null
    tags?:      string[]
  }
  onSuccess?:         (clientId?: string) => void
  showCancelButton?:  boolean
  onCancel?:          () => void
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{
        fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
        color: 'var(--text-muted)', letterSpacing: '0.04em',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function ClientForm({ branchId, slug, existingClient, onSuccess, showCancelButton, onCancel }: ClientFormProps) {
  const isEdit = !!existingClient
  const action = isEdit ? updateClient : addClient

  const [state, formAction, pending] = useActionState(action, undefined)
  const [selectedTags, setSelectedTags] = useState<string[]>(existingClient?.tags ?? [])
  const [phone, setPhone] = useState(existingClient?.phone ?? '')
  const [document, setDocument] = useState(existingClient?.document ?? '')

  const router = useRouter()

  useEffect(() => {
    if (!state?.success) return
    const clientId = isEdit ? existingClient?.id : (state as unknown as { clientId?: string }).clientId
    if (onSuccess) {
      onSuccess(clientId)
    } else if (!isEdit && clientId) {
      router.push(`/${slug}/clients/${clientId}`)
    }
  }, [state?.success])

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="_branchId" value={branchId} />
      <input type="hidden" name="_slug" value={slug} />
      {isEdit && <input type="hidden" name="_clientId" value={existingClient!.id} />}
      <input type="hidden" name="tags" value={JSON.stringify(selectedTags)} />

      {/* Seção 1: Dados essenciais */}
      <div className="form-2col">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Nome completo *">
            <input
              name="name" type="text" required className="field"
              defaultValue={existingClient?.name}
              placeholder="Ana Paula Silva"
            />
          </Field>
        </div>

        <Field label="Telefone *">
          <input
            name="phone" type="tel" required className="field"
            value={phone}
            onChange={e => setPhone(maskPhone(e.target.value))}
            placeholder="(11) 99999-9999"
          />
        </Field>

        <Field label="E-mail">
          <input
            name="email" type="email" className="field"
            defaultValue={existingClient?.email ?? ''}
            placeholder="ana@email.com"
          />
        </Field>

        <Field label="CPF">
          <input
            name="document" type="text" className="field"
            value={document}
            onChange={e => setDocument(maskCPF(e.target.value))}
            placeholder="000.000.000-00"
          />
        </Field>

        <Field label="Data de nascimento">
          <input
            name="birth_date" type="date" className="field"
            defaultValue={existingClient?.birth_date?.substring(0, 10) ?? ''}
          />
        </Field>

        <Field label="Gênero">
          <select name="gender" className="field" defaultValue={existingClient?.gender ?? ''}>
            <option value="">Não informado</option>
            {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
      </div>

      {/* Tags */}
      <Field label="Tags">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TAGS.map(tag => {
            const active = selectedTags.includes(tag)
            return (
              <button
                key={tag} type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '4px 10px',
                  background: active ? 'var(--brand-soft)' : 'var(--bg-app)',
                  border: `1.5px solid ${active ? 'var(--brand-soft-border)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-chip-token)',
                  fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
                  color: active ? 'var(--brand)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </Field>

      {/* Observações */}
      <Field label="Observações internas">
        <textarea
          name="notes" rows={3} className="field"
          defaultValue={existingClient?.notes ?? ''}
          placeholder="Alergias, preferências, histórico relevante…"
          style={{ resize: 'vertical' }}
        />
      </Field>

      {/* Feedback */}
      {state?.error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
          <CheckCircle2 size={14} /> {isEdit ? 'Dados atualizados.' : 'Cliente cadastrado com sucesso.'}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        {showCancelButton && (
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={pending}>
            Cancelar
          </button>
        )}
        <button type="submit" disabled={pending} className="btn-primary">
          <UserPlus size={15} />
          {pending ? (isEdit ? 'Salvando…' : 'Cadastrando…') : (isEdit ? 'Salvar alterações' : 'Cadastrar cliente')}
        </button>
      </div>
    </form>
  )
}
