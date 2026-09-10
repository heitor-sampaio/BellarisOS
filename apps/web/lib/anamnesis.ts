// Tipos e helpers do construtor de fichas de anamnese.
// Módulo neutro (sem 'use server'/'use client') — importável por actions e componentes.

export type AnamnesisFieldType =
  | 'text' | 'textarea' | 'number' | 'date'
  | 'select' | 'radio' | 'checkbox' | 'section' | 'photo'
  | 'injectable_map'

// ─── Planejador de injetáveis ────────────────────────────────────────────────
// Primeiro campo com valor ESTRUTURADO: todos os outros são string ou string[].
// O que foi aplicado, onde e quanto, não cabia em texto livre — e era assim que
// dose de toxina era registrada até aqui.

/** Unidades de dose. Mesmo vocabulário do estoque (`consumption_unit`). */
export const INJECTABLE_UNITS = ['UI', 'ml', 'mg'] as const
export type InjectableUnit = typeof INJECTABLE_UNITS[number]

export interface InjectablePoint {
  id:      string
  /** 0..1 relativo à imagem — ponto em pixel sairia do lugar ao redimensionar. */
  x:       number
  y:       number
  product: string
  /** Dose planejada. */
  dose:    number
  unit:    InjectableUnit
  /** Dose confirmada na aplicação; `null` enquanto for só plano. */
  applied: number | null
  note?:   string
}

export interface InjectableMapValue {
  /** Só existe o rosto de frente hoje; o campo evita migração ao crescer. */
  view:         'front'
  points:       InjectablePoint[]
  confirmedAt?: string | null
}

export function emptyInjectableMap(): InjectableMapValue {
  return { view: 'front', points: [], confirmedAt: null }
}

export function isInjectableMap(v: unknown): v is InjectableMapValue {
  return !!v && typeof v === 'object' && Array.isArray((v as InjectableMapValue).points)
}

/** Soma as doses por produto + unidade — o número que se confere antes de aplicar. */
export function injectableTotals(
  value: InjectableMapValue,
): { product: string; unit: InjectableUnit; planned: number; applied: number }[] {
  const acc = new Map<string, { product: string; unit: InjectableUnit; planned: number; applied: number }>()
  for (const p of value.points) {
    const product = p.product.trim() || 'Sem produto'
    const key = `${product}|${p.unit}`
    const cur = acc.get(key) ?? { product, unit: p.unit, planned: 0, applied: 0 }
    cur.planned += Number(p.dose) || 0
    cur.applied += Number(p.applied) || 0
    acc.set(key, cur)
  }
  return [...acc.values()]
}

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
  // `hasOptions` de propósito: as opções são a lista de produtos que essa ficha
  // oferece no planejador ("Botox 100UI", "Dysport"). Reaproveita o editor de
  // opções do builder, a validação e a cópia em normField, sem config nova —
  // e config nova seria descartada, porque normField só copia `options`.
  { value: 'injectable_map', label: 'Planejador de injetáveis', isInput: true, hasOptions: true },
  { value: 'section',  label: 'Título / seção',   isInput: false },
]

/** Campos que ocupam a linha inteira: espremidos em coluna ficam inutilizáveis. */
const FULL_WIDTH_TYPES: AnamnesisFieldType[] = ['section', 'injectable_map']

export const FIELD_TYPE_LABEL: Record<AnamnesisFieldType, string> =
  Object.fromEntries(FIELD_TYPES.map(t => [t.value, t.label])) as Record<AnamnesisFieldType, string>

/**
 * Tipos que têm lista de opções. DERIVADO de `FIELD_TYPES.hasOptions` — antes
 * era uma lista paralela escrita à mão, e `hasOptions` não era lido por
 * ninguém. Quem marcasse `hasOptions` num tipo novo e não editasse esta linha
 * veria as opções serem descartadas por `normField` sem nenhum erro.
 */
export const OPTION_TYPES: AnamnesisFieldType[] =
  FIELD_TYPES.filter(t => t.hasOptions).map(t => t.value)
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
      if (FULL_WIDTH_TYPES.includes(f.type)) { flush(); out.push({ id: newId(), fields: [f] }); continue }
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
