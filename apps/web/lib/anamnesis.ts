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

export interface AnamnesisFormSchema {
  fields: AnamnesisField[]
}

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

function newId(): string {
  try { return crypto.randomUUID() } catch { return `f_${Math.random().toString(36).slice(2)}` }
}

/** Normaliza um schema vindo do builder/DB para uma forma segura. */
export function normalizeFormSchema(raw: unknown): AnamnesisFormSchema {
  const fields: AnamnesisField[] = []
  const arr = (raw as { fields?: unknown })?.fields
  if (!Array.isArray(arr)) return { fields }
  for (const f of arr) {
    if (!f || typeof f !== 'object') continue
    const type = (f as AnamnesisField).type
    if (!VALID_TYPES.has(type)) continue
    const label = typeof (f as AnamnesisField).label === 'string' ? (f as AnamnesisField).label.trim() : ''
    if (!label) continue
    const field: AnamnesisField = {
      id:    typeof (f as AnamnesisField).id === 'string' && (f as AnamnesisField).id ? (f as AnamnesisField).id : newId(),
      type,
      label,
    }
    if ((f as AnamnesisField).required) field.required = true
    const ph = (f as AnamnesisField).placeholder
    if (typeof ph === 'string' && ph.trim()) field.placeholder = ph.trim()
    const help = (f as AnamnesisField).help
    if (typeof help === 'string' && help.trim()) field.help = help.trim()
    if (OPTION_TYPES.includes(type)) {
      const opts = Array.isArray((f as AnamnesisField).options)
        ? (f as AnamnesisField).options!.map(o => String(o).trim()).filter(Boolean)
        : []
      field.options = opts
    }
    fields.push(field)
  }
  return { fields }
}

/** Retorna mensagem de erro se o schema for inválido; null se ok. */
export function validateFormSchema(schema: AnamnesisFormSchema): string | null {
  if (!schema.fields.length) return 'Adicione ao menos um campo à ficha.'
  for (const f of schema.fields) {
    if (!f.label.trim()) return 'Todos os campos precisam de um rótulo.'
    if (OPTION_TYPES.includes(f.type) && (!f.options || f.options.length < 1)) {
      return `O campo "${f.label}" precisa de ao menos uma opção.`
    }
  }
  return null
}
