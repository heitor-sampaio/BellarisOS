'use client'

import { useState, useRef } from 'react'
import { Save, Upload, X, ImageIcon, CheckCircle2 } from 'lucide-react'
import type { AnamnesisField } from '@/lib/anamnesis'
import { saveProcedureAnamnesis, uploadAnamnesisPhoto } from '@/actions/anamnesis'

type AnswerValue = string | string[]
export type AnamnesisAnswers = Record<string, AnswerValue>

interface Props {
  appointmentId: string
  slug:          string
  formName:      string
  fields:        AnamnesisField[]
  initial:       AnamnesisAnswers
  canEdit:       boolean
}

export function AnamnesisFormRenderer({ appointmentId, slug, formName, fields, initial, canEdit }: Props) {
  const [answers, setAnswers] = useState<AnamnesisAnswers>(initial ?? {})
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError]     = useState<string | null>(null)

  function setAnswer(id: string, value: AnswerValue) {
    setAnswers(a => ({ ...a, [id]: value }))
    setSavedAt(null)
  }
  function toggleCheckbox(id: string, opt: string) {
    setAnswers(a => {
      const cur = Array.isArray(a[id]) ? (a[id] as string[]) : []
      const next = cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt]
      return { ...a, [id]: next }
    })
    setSavedAt(null)
  }

  async function save() {
    setSaving(true); setError(null)
    // valida obrigatórios
    const missing = fields.find(f => f.required && f.type !== 'section' && isEmpty(answers[f.id]))
    if (missing) { setError(`Preencha "${missing.label}".`); setSaving(false); return }
    const res = await saveProcedureAnamnesis({ appointmentId, slug, answers })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setSavedAt(Date.now())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {fields.map(f => (
        <FieldView
          key={f.id} field={f} value={answers[f.id]} canEdit={canEdit}
          appointmentId={appointmentId}
          onChange={v => setAnswer(f.id, v)}
          onToggle={opt => toggleCheckbox(f.id, opt)}
        />
      ))}

      {error && <p style={{ color: '#dc2626', fontSize: 12.5, fontWeight: 600 }}>{error}</p>}

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
          <button type="button" onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>
            <Save size={14} /> {saving ? 'Salvando…' : 'Salvar ficha'}
          </button>
          {savedAt && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
              <CheckCircle2 size={13} /> Salvo
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function isEmpty(v: AnswerValue | undefined): boolean {
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0
  return String(v).trim() === ''
}

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'block',
}

function FieldView({ field: f, value, canEdit, appointmentId, onChange, onToggle }: {
  field: AnamnesisField
  value: AnswerValue | undefined
  canEdit: boolean
  appointmentId: string
  onChange: (v: string) => void
  onToggle: (opt: string) => void
}) {
  // Seção (título)
  if (f.type === 'section') {
    return (
      <div style={{ marginTop: 6, paddingBottom: 4, borderBottom: '1px solid var(--hairline)' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
      </div>
    )
  }

  const req = f.required ? <span style={{ color: 'var(--brand)' }}> *</span> : null

  // Modo leitura
  if (!canEdit) {
    return (
      <div>
        <span style={labelStyle}>{f.label}</span>
        <ReadOnlyValue field={f} value={value} />
      </div>
    )
  }

  const str = typeof value === 'string' ? value : ''

  return (
    <div>
      <label style={labelStyle}>{f.label}{req}</label>
      {f.help && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -3, marginBottom: 6 }}>{f.help}</p>}

      {f.type === 'text' && (
        <input className="field" value={str} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />
      )}
      {f.type === 'textarea' && (
        <textarea className="field" rows={3} value={str} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} style={{ resize: 'vertical' }} />
      )}
      {f.type === 'number' && (
        <input type="number" className="field" value={str} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />
      )}
      {f.type === 'date' && (
        <input type="date" className="field" value={str} onChange={e => onChange(e.target.value)} />
      )}
      {f.type === 'select' && (
        <select className="field" value={str} onChange={e => onChange(e.target.value)}>
          <option value="">Selecione…</option>
          {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {f.type === 'radio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(f.options ?? []).map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-soft)' }}>
              <input type="radio" name={f.id} checked={str === o} onChange={() => onChange(o)} style={{ accentColor: 'var(--brand)' }} />
              {o}
            </label>
          ))}
        </div>
      )}
      {f.type === 'checkbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(f.options ?? []).map(o => {
            const checked = Array.isArray(value) && value.includes(o)
            return (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-soft)' }}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(o)} style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
                {o}
              </label>
            )
          })}
        </div>
      )}
      {f.type === 'photo' && (
        <PhotoField url={str} appointmentId={appointmentId} onChange={onChange} />
      )}
    </div>
  )
}

function ReadOnlyValue({ field: f, value }: { field: AnamnesisField; value: AnswerValue | undefined }) {
  if (f.type === 'photo' && typeof value === 'string' && value) {
    return <img src={value} alt={f.label} style={{ maxWidth: 220, borderRadius: 10, border: '1px solid var(--border)' }} />
  }
  const text = Array.isArray(value) ? value.join(', ') : (value ?? '')
  return (
    <p style={{ fontSize: 13, color: text ? 'var(--text)' : 'var(--text-faint)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
      {text || 'Não informado'}
    </p>
  )
}

function PhotoField({ url, appointmentId, onChange }: { url: string; appointmentId: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true); setErr(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('appointment_id', appointmentId)
    const res = await uploadAnamnesisPhoto(fd)
    setUploading(false)
    if (res.error) { setErr(res.error); return }
    if (res.url) onChange(res.url)
  }

  return (
    <div>
      <input
        ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      {url ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={url} alt="Foto" style={{ maxWidth: 220, borderRadius: 10, border: '1px solid var(--border)', display: 'block' }} />
          <button
            type="button" onClick={() => onChange('')} title="Remover"
            style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1.5px dashed var(--border)', background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {uploading ? <ImageIcon size={16} /> : <Upload size={16} />}
          {uploading ? 'Enviando…' : 'Enviar foto'}
        </button>
      )}
      {err && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{err}</p>}
    </div>
  )
}
