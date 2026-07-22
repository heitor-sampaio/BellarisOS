'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addClient, updateClient } from '@/actions/clients'
import { UserPlus, CheckCircle2 } from 'lucide-react'
import { TagBadge } from '@/components/shared/tag-badge'
import { CLIENT_TAGS, isUnitTag, unitTagName } from '@estetica-os/utils'

const GENDERS = [
  { value: 'F', label: 'Feminino' },
  { value: 'M', label: 'Masculino' },
  { value: 'O', label: 'Outro' },
  { value: 'N', label: 'Prefiro não informar' },
]

interface ClientFormProps {
  branchId:   string
  slug:       string
  branchName?: string
  /** quando fornecido, mostra seletor de unidade (uso na conversão de lead pelo CRM) */
  branches?:  { id: string; name: string }[]
  /** pré-preenchimento na criação (ex.: conversão de lead) */
  prefill?:   { name?: string; phone?: string; email?: string }
  /** liga o cliente criado a este lead (conversão) */
  leadId?:    string
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

export function ClientForm({ branchId, slug, branchName, branches, prefill, leadId, existingClient, onSuccess, showCancelButton, onCancel }: ClientFormProps) {
  const isEdit = !!existingClient
  const action = isEdit ? updateClient : addClient

  const [state, formAction, pending] = useActionState(action, undefined)
  const [selectedTags, setSelectedTags] = useState<string[]>(existingClient?.tags ?? [])
  const [phone, setPhone] = useState(existingClient?.phone ?? prefill?.phone ?? '')
  const [document, setDocument] = useState(existingClient?.document ?? '')
  const [unitId, setUnitId] = useState(branchId || branches?.[0]?.id || '')

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
      <input type="hidden" name="_branchId" value={branches && branches.length > 0 ? unitId : branchId} />
      <input type="hidden" name="_slug" value={slug} />
      {isEdit && <input type="hidden" name="_clientId" value={existingClient!.id} />}
      {leadId && <input type="hidden" name="_leadId" value={leadId} />}
      <input type="hidden" name="tags" value={JSON.stringify(selectedTags)} />

      {!isEdit && branches && branches.length > 0 ? (
        <Field label="Unidade de cadastro *">
          <select className="field" value={unitId} onChange={e => setUnitId(e.target.value)} required>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4, display: 'block' }}>
            O cliente pode ser atendido em qualquer unidade.
          </span>
        </Field>
      ) : !isEdit && branchName ? (
        <div style={{
          fontSize: 12.5, color: 'var(--text-muted)',
          background: 'var(--bg-app)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>Unidade de cadastro:</span> {branchName}
          <span style={{ color: 'var(--text-faint)' }}>— o cliente pode ser atendido em qualquer unidade</span>
        </div>
      ) : null}

      {/* Seção 1: Dados essenciais */}
      <div className="form-2col">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Nome completo *">
            <input
              name="name" type="text" required className="field"
              defaultValue={existingClient?.name ?? prefill?.name ?? ''}
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

        <Field label="E-mail *">
          <input
            name="email" type="email" required className="field"
            defaultValue={existingClient?.email ?? prefill?.email ?? ''}
            placeholder="ana@email.com"
          />
        </Field>

        <Field label="CPF *">
          <input
            name="document" type="text" required className="field"
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
          {CLIENT_TAGS.map(tag => {
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
        {/* Unidades que o cliente frequenta (tags "Unidade: <nome>") — removíveis */}
        {selectedTags.some(isUnitTag) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {selectedTags.filter(isUnitTag).map(tag => (
              <TagBadge
                key={tag}
                label={unitTagName(tag)}
                style={{ bg: '#e7f0fc', color: '#3b6cbf' }}
                onRemove={() => toggleTag(tag)}
              />
            ))}
          </div>
        )}
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

      {!isEdit && (
        <div style={{
          fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.5,
          background: 'var(--bg-app)', border: '1px solid var(--hairline)',
          borderRadius: 10, padding: '10px 12px',
        }}>
          Ao cadastrar, será criado um acesso do cliente ao app com{' '}
          <b style={{ color: 'var(--text)' }}>login = e-mail</b> e{' '}
          <b style={{ color: 'var(--text)' }}>senha = CPF</b>.
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
