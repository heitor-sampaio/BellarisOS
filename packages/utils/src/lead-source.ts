// Vocabulário canônico de ORIGEM de lead + derivação de atribuição.
// Fonte única consumida por: actions/leads.ts, lib/inbox (auto-criação do card) e a UI do CRM.
// Substitui as listas hardcoded de SOURCES/SOURCE_COLORS espalhadas nos componentes.

export interface LeadSourceStyle {
  bg:    string
  color: string
}

export interface LeadSourceDef {
  /** valor canônico gravado em leads.source */
  key:   string
  label: string
  /** origem de tráfego pago (auto-detectada por atribuição) */
  paid:  boolean
  style: LeadSourceStyle
}

const NEUTRAL: LeadSourceStyle = { bg: 'var(--bg-app)', color: 'var(--text-muted)' }

// Ordem: pagas primeiro, orgânico, depois classificações manuais.
export const LEAD_SOURCES: LeadSourceDef[] = [
  { key: 'Meta Ads',   label: 'Meta Ads',   paid: true,  style: { bg: '#eae8fc', color: '#4b3bd6' } },
  { key: 'Google Ads', label: 'Google Ads', paid: true,  style: { bg: '#e8f0fe', color: '#1a56db' } },
  { key: 'Orgânico',   label: 'Orgânico',   paid: false, style: { bg: '#e8f5ec', color: '#1a7a3a' } },
  { key: 'Instagram',  label: 'Instagram',  paid: false, style: { bg: '#fce8f4', color: '#b52d7c' } },
  { key: 'Indicação',  label: 'Indicação',  paid: false, style: { bg: '#fef3e8', color: '#8a5a1a' } },
  { key: 'WhatsApp',   label: 'WhatsApp',   paid: false, style: { bg: '#e8f5ec', color: '#1a7a3a' } },
  { key: 'Site',       label: 'Site',       paid: false, style: { bg: '#e8edf4', color: '#2d4e7a' } },
  { key: 'Evento',     label: 'Evento',     paid: false, style: { bg: '#f4e8f4', color: '#7a2d7a' } },
  { key: 'Outro',      label: 'Outro',      paid: false, style: NEUTRAL },
]

export type LeadSource = (typeof LEAD_SOURCES)[number]['key']

export const LEAD_SOURCE_KEYS = LEAD_SOURCES.map(s => s.key)

const BY_KEY = new Map(LEAD_SOURCES.map(s => [s.key, s]))

/** Cor do badge de uma origem; neutro para valores desconhecidos (dados legados). */
export function sourceStyle(source: string | null | undefined): LeadSourceStyle {
  if (!source) return NEUTRAL
  return BY_KEY.get(source)?.style ?? NEUTRAL
}

/** A tag de origem espelha o próprio source. */
export function sourceTagFor(source: string): string {
  return source
}

// -- Derivação de origem a partir de atribuição -------------------------------

export interface InboundReferralAttribution {
  sourceType?: string | null   // ex.: 'ad' | 'post' (Meta CTWA)
  sourceId?:   string | null
  sourceUrl?:  string | null
  ctwaClid?:   string | null
  headline?:   string | null
}

export interface AttributionInput {
  fbclid?:     string | null
  gclid?:      string | null
  utm_source?: string | null
  utm_medium?: string | null
  referral?:   InboundReferralAttribution | null
}

export interface DerivedSource {
  source:      string
  /** plataforma (facebook|instagram) para Meta Ads; senão undefined */
  utm_source?: string
  ctwa_clid?:  string
  /** tags a aplicar (a de origem espelha o source) */
  tags:        string[]
}

function hasAttribution(a: AttributionInput): boolean {
  return !!(a.fbclid || a.gclid || a.utm_source || a.referral?.ctwaClid || a.referral?.sourceType)
}

/** Infere a plataforma Meta (facebook|instagram) a partir de utm_source/sourceUrl. */
function metaPlatform(a: AttributionInput): string | undefined {
  const utm = a.utm_source?.toLowerCase()
  if (utm === 'instagram' || utm === 'ig') return 'instagram'
  if (utm === 'facebook'  || utm === 'fb') return 'facebook'
  const url = a.referral?.sourceUrl?.toLowerCase() ?? ''
  if (url.includes('instagram') || url.includes('ig.me')) return 'instagram'
  if (url.includes('facebook')  || url.includes('fb.'))   return 'facebook'
  return undefined
}

/**
 * Regras (decisão do produto):
 *  - gclid OU utm_source=google        -> Google Ads
 *  - ctwa_clid OU fbclid OU utm_source in {facebook,instagram} OU referral.sourceType -> Meta Ads
 *  - senão                              -> Orgânico
 * Retorno pronto para spread no insert do lead.
 */
export function deriveLeadSource(input: AttributionInput): DerivedSource {
  const utm = input.utm_source?.toLowerCase()

  if (input.gclid || utm === 'google') {
    return { source: 'Google Ads', tags: ['Google Ads'] }
  }

  const isMeta =
    !!input.referral?.ctwaClid ||
    !!input.fbclid ||
    utm === 'facebook' || utm === 'instagram' || utm === 'fb' || utm === 'ig' ||
    !!input.referral?.sourceType

  if (isMeta) {
    const platform = metaPlatform(input)
    const out: DerivedSource = { source: 'Meta Ads', tags: ['Meta Ads'] }
    if (platform) out.utm_source = platform
    if (input.referral?.ctwaClid) out.ctwa_clid = input.referral.ctwaClid
    return out
  }

  return { source: 'Orgânico', tags: ['Orgânico'] }
}

/**
 * Resolve a origem de um lead na CRIAÇÃO manual: se há atribuição, deriva;
 * senão respeita a escolha do dropdown; sem nada -> Orgânico.
 */
export function resolveLeadSource(
  input: AttributionInput,
  manualSource?: string | null,
): DerivedSource {
  if (hasAttribution(input)) return deriveLeadSource(input)
  const source = (manualSource && manualSource.trim()) || 'Orgânico'
  return { source, tags: [source] }
}

/** Deduplica tags preservando ordem (tag de origem primeiro). */
export function mergeTags(...groups: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const g of groups) {
    for (const t of g ?? []) {
      const v = t.trim()
      if (v && !seen.has(v)) { seen.add(v); out.push(v) }
    }
  }
  return out
}
