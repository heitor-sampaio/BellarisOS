// Tipos e helpers do construtor de fichas de anamnese.
// Módulo neutro (sem 'use server'/'use client') — importável por actions e componentes.

export type AnamnesisFieldType =
  | 'text' | 'textarea' | 'number' | 'date'
  | 'select' | 'radio' | 'checkbox' | 'section' | 'photo'

export interface AnamnesisField {
  id:           string
  type:         AnamnesisFieldType
  label:        string
  required?:    boolean
  options?:     string[]        // select / radio / checkbox
  placeholder?: string
  help?:        string
}

/** Uma linha do formulário — os campos dentro dela viram colunas automáticas. */
export interface AnamnesisRow {
  id:     string
  fields: AnamnesisField[]      // 1..MAX_COLS
}

export interface AnamnesisFormSchema {
  rows: AnamnesisRow[]
}

/** Máximo de colunas (campos) por linha. */
export const MAX_COLS = 4

export const FIELD_TYPES: { value: AnamnesisFieldType; label: string; hasOptions?: boolean; isInput: boolean }[] = [
  { value: 'text',     label: 'Texto curto',      isInput: true },
  { value: 'textarea', label: 'Texto longo',      isInput: true },
  { value: 'number',   label: 'Número',           isInput: true },
  { value: 'date',     label: 'Data',             isInput: true },
  { value: 'select',   label: 'Seleção (lista)',  isInput: true, hasOptions: true },
  { value: 'radio',    label: 'Escolha única',    isInput: true, hasOptions: true },
  { value: 'checkbox', label: 'Múltipla escolha', isInput: true, hasOptions: true },
  { value: 'photo',    label: 'Foto',             isInput: true },
  { value: 'section',  label: 'Título / seção',   isInput: false },
]

export const FIELD_TYPE_LABEL: Record<AnamnesisFieldType, string> =
  Object.fromEntries(FIELD_TYPES.map(t => [t.value, t.label])) as Record<AnamnesisFieldType, string>

export const OPTION_TYPES: AnamnesisFieldType[] = ['select', 'radio', 'checkbox']
const VALID_TYPES = new Set<AnamnesisFieldType>(FIELD_TYPES.map(t => t.value))

export function newId(): string {
  try { return crypto.randomUUID() } catch { return `f_${Math.random().toString(36).slice(2)}` }
}

function normField(f: unknown): AnamnesisField | null {
  if (!f || typeof f !== 'object') return null
  const raw = f as Partial<AnamnesisField>
  const type = raw.type as AnamnesisFieldType
  if (!VALID_TYPES.has(type)) return null
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (!label) return null
  const field: AnamnesisField = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    type, label,
  }
  if (raw.required && type !== 'section') field.required = true
  if (typeof raw.placeholder === 'string' && raw.placeholder.trim()) field.placeholder = raw.placeholder.trim()
  if (typeof raw.help === 'string' && raw.help.trim()) field.help = raw.help.trim()
  if (OPTION_TYPES.includes(type)) {
    field.options = Array.isArray(raw.options) ? raw.options.map(o => String(o).trim()).filter(Boolean) : []
  }
  return field
}

/** Garante invariantes: seções isoladas em sua linha; no máximo MAX_COLS por linha. */
function sanitizeRows(rows: AnamnesisRow[]): AnamnesisRow[] {
  const out: AnamnesisRow[] = []
  for (const row of rows) {
    let bucket: AnamnesisField[] = []
    const flush = () => { if (bucket.length) { out.push({ id: newId(), fields: bucket }); bucket = [] } }
    for (const f of row.fields) {
      if (f.type === 'section') { flush(); out.push({ id: newId(), fields: [f] }); continue }
      bucket.push(f)
      if (bucket.length === MAX_COLS) flush()
    }
    flush()
  }
  return out
}

/** Normaliza um schema do DB/builder — aceita o formato novo (rows) e o legado (fields). */
export function normalizeFormSchema(raw: unknown): AnamnesisFormSchema {
  const rawRows   = (raw as { rows?: unknown })?.rows
  const rawFields = (raw as { fields?: unknown })?.fields
  const rows: AnamnesisRow[] = []

  if (Array.isArray(rawRows)) {
    for (const r of rawRows) {
      const fs = (Array.isArray((r as { fields?: unknown })?.fields) ? (r as { fields: unknown[] }).fields : [])
        .map(normField).filter((x): x is AnamnesisField => x !== null)
      if (fs.length) rows.push({ id: newId(), fields: fs })
    }
  } else if (Array.isArray(rawFields)) {
    // Legado: lista plana de campos → uma linha por campo.
    for (const f of rawFields) {
      const nf = normField(f)
      if (nf) rows.push({ id: newId(), fields: [nf] })
    }
  }

  return { rows: sanitizeRows(rows) }
}

export function flattenFields(schema: AnamnesisFormSchema): AnamnesisField[] {
  return schema.rows.flatMap(r => r.fields)
}

/** Retorna mensagem de erro se o schema for inválido; null se ok. */
export function validateFormSchema(schema: AnamnesisFormSchema): string | null {
  const fields = flattenFields(schema)
  if (!fields.length) return 'Adicione ao menos um campo à ficha.'
  for (const f of fields) {
    if (!f.label.trim()) return 'Todos os campos precisam de um rótulo.'
    if (OPTION_TYPES.includes(f.type) && (!f.options || f.options.length < 1)) {
      return `O campo "${f.label}" precisa de ao menos uma opção.`
    }
  }
  return null
}
