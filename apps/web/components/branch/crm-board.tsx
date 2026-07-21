'use client'

import { useState, useTransition, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArrowRight, Trash2, Phone, Mail, X, AlertTriangle } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { updateLeadStage, convertLeadToClient, deleteLead } from '@/actions/leads'
import { openLeadConversation } from '@/actions/inbox'
import type { CRMStage } from '@/actions/crm-stages'
import { CRMLeadModal, type Procedure, type CRMLeadModalHandle } from './crm-lead-modal'
import {
  sourceStyle,
  secondsSince, agingLevel, AGING_STYLE,
  AWAITING_THRESHOLDS, STALE_THRESHOLDS, formatDurationShort,
} from '@estetica-os/utils'
import { TagBadge } from '@/components/shared/tag-badge'

// --- Filtros e ordenação -----------------------------------------
interface FiltersState {
  sources:      string[]
  tags:         string[]
  procedureIds: string[]
  situation:    'all' | 'converted' | 'not_converted'
  period:       'all' | '7d' | '30d' | '90d'
}
type SortOrder = 'newest' | 'oldest' | 'name_asc' | 'name_desc'

const DEFAULT_FILTERS: FiltersState = { sources: [], tags: [], procedureIds: [], situation: 'all', period: 'all' }

function FiltersBar({
  leads, filters, sort,
  onFiltersChange, onSortChange, onClear,
}: {
  leads:           Lead[]
  filters:         FiltersState
  sort:            SortOrder
  onFiltersChange: (f: FiltersState) => void
  onSortChange:    (s: SortOrder) => void
  onClear:         () => void
}) {
  const availableSources = useMemo(
    () => [...new Set(leads.map(l => l.source).filter(Boolean))].sort() as string[],
    [leads],
  )

  // Tags que aparecem em pelo menos um lead
  const availableTags = useMemo(
    () => [...new Set(leads.flatMap(l => l.tags ?? []))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [leads],
  )

  // Procedimentos que aparecem em pelo menos um lead
  const availableProcs = useMemo(() => {
    const map = new Map<string, string>()
    leads.forEach(l =>
      l.lead_procedures.forEach(lp => {
        if (lp.procedures?.name) map.set(lp.procedure_id, lp.procedures.name)
      }),
    )
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [leads])

  const activeCount =
    (filters.sources.length > 0 ? 1 : 0) +
    (filters.tags.length > 0 ? 1 : 0) +
    (filters.procedureIds.length > 0 ? 1 : 0) +
    (filters.situation !== 'all' ? 1 : 0) +
    (filters.period !== 'all' ? 1 : 0)

  function toggleSource(src: string) {
    const next = filters.sources.includes(src)
      ? filters.sources.filter(s => s !== src)
      : [...filters.sources, src]
    onFiltersChange({ ...filters, sources: next })
  }

  function toggleTag(tag: string) {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag]
    onFiltersChange({ ...filters, tags: next })
  }

  function toggleProcedure(id: string) {
    const next = filters.procedureIds.includes(id)
      ? filters.procedureIds.filter(x => x !== id)
      : [...filters.procedureIds, id]
    onFiltersChange({ ...filters, procedureIds: next })
  }

  const selectStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '5px 8px', cursor: 'pointer', outline: 'none',
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      flexWrap: 'wrap', padding: '10px 0 4px',
    }}>
      {/* Origem (chips dinâmicos dos dados) */}
      {availableSources.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>Origem</span>
          {availableSources.map(src => {
            const active = filters.sources.includes(src)
            return (
              <button
                key={src} type="button"
                onClick={() => toggleSource(src)}
                style={{
                  fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                  cursor: 'pointer', transition: 'all 120ms',
                  border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                  background: active ? 'var(--brand-soft)' : 'var(--surface)',
                  color: active ? 'var(--brand)' : 'var(--text-muted)',
                }}
              >
                {src}
              </button>
            )
          })}
        </div>
      )}

      {/* Tags */}
      {availableTags.length > 0 && (
        <>
          {availableSources.length > 0 && (
            <div style={{ width: 1, height: 20, background: 'var(--hairline)', flexShrink: 0 }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>Tags</span>
            {availableTags.map(tag => {
              const active = filters.tags.includes(tag)
              return (
                <button
                  key={tag} type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                    cursor: 'pointer', transition: 'all 120ms',
                    border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                    background: active ? 'var(--brand-soft)' : 'var(--surface)',
                    color: active ? 'var(--brand)' : 'var(--text-muted)',
                  }}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Procedimentos */}
      {availableProcs.length > 0 && (
        <>
          {(availableSources.length > 0 || availableTags.length > 0) && (
            <div style={{ width: 1, height: 20, background: 'var(--hairline)', flexShrink: 0 }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>Procedimento</span>
            {availableProcs.map(p => {
              const active = filters.procedureIds.includes(p.id)
              return (
                <button
                  key={p.id} type="button"
                  onClick={() => toggleProcedure(p.id)}
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                    cursor: 'pointer', transition: 'all 120ms',
                    border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                    background: active ? 'var(--brand-soft)' : 'var(--surface)',
                    color: active ? 'var(--brand)' : 'var(--text-muted)',
                  }}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Separador antes dos selects */}
      <div style={{ width: 1, height: 20, background: 'var(--hairline)', flexShrink: 0 }} />

      {/* Situação */}
      <select
        value={filters.situation}
        onChange={e => onFiltersChange({ ...filters, situation: e.target.value as FiltersState['situation'] })}
        style={selectStyle}
      >
        <option value="all">Todos os leads</option>
        <option value="not_converted">Não convertidos</option>
        <option value="converted">Convertidos</option>
      </select>

      {/* Período */}
      <select
        value={filters.period}
        onChange={e => onFiltersChange({ ...filters, period: e.target.value as FiltersState['period'] })}
        style={selectStyle}
      >
        <option value="all">Qualquer período</option>
        <option value="7d">Últimos 7 dias</option>
        <option value="30d">Últimos 30 dias</option>
        <option value="90d">Últimos 90 dias</option>
      </select>

      {/* Ordenação */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <select value={sort} onChange={e => onSortChange(e.target.value as SortOrder)} style={selectStyle}>
          <option value="newest">Mais recente</option>
          <option value="oldest">Mais antigo</option>
          <option value="name_asc">Nome A → Z</option>
          <option value="name_desc">Nome Z → A</option>
        </select>

        {/* Limpar filtros */}
        {(activeCount > 0 || sort !== 'newest') && (
          <button
            type="button" onClick={onClear}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)',
              background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            <X size={11} />
            Limpar
            {activeCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 800, minWidth: 16, height: 16,
                background: 'var(--brand)', color: '#fff',
                borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {activeCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// --- Tipos -------------------------------------------------------
export interface Lead {
  id:           string
  name:         string
  phone:        string | null
  email:        string | null
  social_media: string | null
  source:       string | null
  crm_stage_id: string | null
  notes:        string | null
  client_id:    string | null
  created_at:   string
  tags:         string[]
  last_interaction_at?: string | null
  awaiting_since?:      string | null
  branch_name?: string | null
  branch_slug?: string | null
  lead_procedures: { procedure_id: string; procedures: { name: string; price: number } | null }[]
}

interface CRMBoardProps {
  initialLeads: Lead[]
  stages:       CRMStage[]
  procedures:   Procedure[]
  branchId:     string
  slug:         string
  /** Modo rede: exibe badge de filial nos cards e oculta "+" por coluna */
  networkMode?: boolean
  branches?:    { id: string; name: string; slug: string }[]
}

// --- Cores suaves a partir de hex --------------------------------
function softBg(hex: string)     { return hex + '18' }
function softBorder(hex: string) { return hex + '50' }

// --- Cartão do lead ----------------------------------------------
function LeadCard({
  lead, slug, branchId, stages, procedures, branches, networkMode, nowMs,
  isDragging, onDragStart, onDragEnd, onLeadDeleted,
}: {
  lead:           Lead
  slug:           string
  branchId:       string
  stages:         CRMStage[]
  procedures:     Procedure[]
  branches?:      { id: string; name: string; slug: string }[]
  networkMode?:   boolean
  nowMs:          number
  isDragging:     boolean
  onDragStart:    (e: React.DragEvent, id: string) => void
  onDragEnd:      () => void
  onLeadDeleted:  (id: string) => void
}) {
  const [converting, startConvert] = useTransition()
  const [deleting,   startDelete]  = useTransition()
  const [opening,    startOpening] = useTransition()
  const router     = useRouter()
  const editRef    = useRef<CRMLeadModalHandle>(null)
  const confirmRef = useRef<HTMLDialogElement>(null)
  // Evita abrir o modal de edição ao finalizar um drag
  const wasDragging = useRef(false)

  const ageInDays = differenceInDays(new Date(), new Date(lead.created_at))
  const ageLabel  = ageInDays === 0 ? 'hoje'
    : ageInDays === 1 ? 'ontem'
    : `há ${ageInDays} dias`

  // --- Métricas de atendimento -----------------------------------
  // Cliente aguardando resposta (prioridade máxima de sinal).
  const awaitingSecs = lead.awaiting_since != null
    ? secondsSince(lead.awaiting_since, nowMs)
    : null
  // Tempo desde a última interação (para "esfriando").
  const lastSecs = secondsSince(lead.last_interaction_at, nowMs)
  // Frieza: baseada na última interação, ou na idade do lead se nunca houve interação.
  const staleSecs  = secondsSince(lead.last_interaction_at ?? lead.created_at, nowMs)
  const staleLevel = agingLevel(staleSecs, STALE_THRESHOLDS)
  const staleColor = staleLevel === 'alert'
    ? AGING_STYLE.alert.color
    : staleLevel === 'warn'
      ? AGING_STYLE.warn.color
      : 'var(--text-faint)'

  const procNames = lead.lead_procedures
    .map(lp => lp.procedures?.name)
    .filter(Boolean) as string[]

  const totalValue = lead.lead_procedures.reduce(
    (sum, lp) => sum + (lp.procedures?.price ?? 0), 0,
  )
  const formattedValue = totalValue > 0
    ? totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

  function handleDragStartCard(e: React.DragEvent) {
    wasDragging.current = true
    onDragStart(e, lead.id)
  }

  function handleDragEndCard() {
    onDragEnd()
    setTimeout(() => { wasDragging.current = false }, 80)
  }

  function handleCardClick() {
    if (wasDragging.current) return
    // No CRM da rede (/admin), o card abre a visão de inbox do lead (conversa + card).
    if (networkMode) {
      startOpening(async () => {
        const res = await openLeadConversation(lead.id)
        if (res.conversationId) router.push(`/admin/crm?view=inbox&c=${res.conversationId}`)
      })
      return
    }
    editRef.current?.open()
  }

  async function handleConvert(e: React.MouseEvent) {
    e.stopPropagation()
    const targetSlug = lead.branch_slug ?? slug
    startConvert(async () => {
      const res = await convertLeadToClient(lead.id, targetSlug)
      if (!res?.clientId) return
      // Funil de filial: leva à ficha do cliente (rota /{slug}/clients existe).
      // Funil da rede (/admin): cliente pode ser de rede (sem filial) e a ficha por
      // filial não se aplica — atualiza o funil no lugar (card vira "✓ Cliente").
      if (networkMode) router.refresh()
      else router.push(`/${targetSlug}/clients/${res.clientId}`)
    })
  }

  async function handleDelete() {
    confirmRef.current?.close()
    startDelete(async () => {
      await deleteLead(lead.id, slug)
      onLeadDeleted(lead.id)
    })
  }

  return (
    <>
      {/* Modal de edição via ref (sem trigger visível) */}
      <CRMLeadModal
        ref={editRef}
        branchId={branchId} slug={slug} stages={stages} procedures={procedures}
        branches={branches}
        existing={{
          id: lead.id, name: lead.name,
          phone: lead.phone, email: lead.email,
          social_media: lead.social_media,
          source: lead.source, notes: lead.notes,
          crm_stage_id: lead.crm_stage_id,
          tags: lead.tags,
          lead_procedures: lead.lead_procedures.map(lp => ({ procedure_id: lp.procedure_id })),
        }}
      />

      {/* Modal de confirmação de exclusão */}
      <dialog
        ref={confirmRef}
        className="modal"
        style={{ maxWidth: 380 } as React.CSSProperties}
        onClick={e => { if (e.target === confirmRef.current) confirmRef.current?.close() }}
      >
        <div style={{ padding: '28px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: '#fde8e8', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={18} color="#e53935" />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Remover lead?</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {lead.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => confirmRef.current?.close()}
              style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                border: '1px solid var(--border)', background: 'var(--bg-app)',
                color: 'var(--text-faint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <X size={13} />
            </button>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Este lead será removido permanentemente do funil de CRM. Esta ação não pode ser desfeita.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => confirmRef.current?.close()}
              className="btn-secondary"
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                fontSize: 'var(--text-sm-sz)', fontWeight: 700,
                background: '#fde8e8', color: '#e53935',
                border: '1.5px solid #f5b8b8',
                opacity: deleting ? 0.6 : 1,
              }}
            >
              <Trash2 size={13} />
              {deleting ? 'Removendo…' : 'Remover'}
            </button>
          </div>
        </div>
      </dialog>

      {/* Card */}
      <div
        draggable
        onDragStart={handleDragStartCard}
        onDragEnd={handleDragEndCard}
        onClick={handleCardClick}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 14px',
          cursor: opening ? 'wait' : isDragging ? 'grabbing' : 'pointer',
          opacity: isDragging ? 0.35 : opening ? 0.6 : 1,
          transition: 'opacity 150ms, box-shadow 150ms',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(34,22,25,.1)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
      >
        {/* Linha 1: origem + tags + lixeira */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
            {lead.source && (
              <TagBadge label={lead.source} style={sourceStyle(lead.source)} size="xs" />
            )}
            {lead.tags?.map(t => (
              <TagBadge key={t} label={t} size="xs" />
            ))}
          </div>

          <button
            type="button"
            onClick={e => { e.stopPropagation(); confirmRef.current?.showModal() }}
            disabled={deleting}
            style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              border: '1px solid var(--border)', background: 'var(--bg-app)',
              color: 'var(--text-faint)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>

        {/* Nome */}
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, marginBottom: 5 }}>
          {lead.name}
        </p>

        {/* Contatos */}
        {lead.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Phone size={10} color="var(--text-faint)" />
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Mail size={10} color="var(--text-faint)" />
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {lead.email}
            </span>
          </div>
        )}
        {lead.social_media && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700 }}>@</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {lead.social_media}
            </span>
          </div>
        )}

        {/* Procedimentos + valor */}
        {procNames.length > 0 && (
          <div style={{ marginTop: 7 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {procNames.slice(0, 2).map(name => (
                <span key={name} style={{
                  fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  background: 'var(--brand-soft)', color: 'var(--brand)',
                  border: '1px solid var(--brand-soft-border)',
                }}>
                  {name}
                </span>
              ))}
              {procNames.length > 2 && (
                <span style={{
                  fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                  background: 'var(--bg-app)', color: 'var(--text-faint)',
                  border: '1px solid var(--border)',
                }}>
                  +{procNames.length - 2}
                </span>
              )}
            </div>
            {formattedValue && (
              <p style={{
                marginTop: 5, fontSize: 13, fontWeight: 800,
                color: 'var(--brand)', letterSpacing: '-0.01em',
              }}>
                {formattedValue}
              </p>
            )}
          </div>
        )}

        {/* Notas */}
        {lead.notes && (
          <p style={{
            fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {lead.notes}
          </p>
        )}

        {/* Badge de filial (modo rede) */}
        {lead.branch_name && (
          <div style={{ marginTop: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: 'var(--bg-app)', color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}>
              {lead.branch_name}
            </span>
          </div>
        )}

        {/* Métricas de atendimento: aguardando resposta / lead esfriando */}
        {(awaitingSecs != null || lead.last_interaction_at || staleLevel === 'alert') && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {awaitingSecs != null ? (
              <TagBadge
                size="xs"
                label={`Aguardando ${formatDurationShort(awaitingSecs)}`}
                style={AGING_STYLE[agingLevel(awaitingSecs, AWAITING_THRESHOLDS)]}
              />
            ) : staleLevel === 'alert' ? (
              <TagBadge
                size="xs"
                label={`Frio há ${formatDurationShort(staleSecs)}`}
                style={AGING_STYLE.alert}
              />
            ) : lead.last_interaction_at ? (
              <span style={{ fontSize: 11, fontWeight: staleLevel === 'warn' ? 700 : 400, color: staleColor }}>
                Última interação há {formatDurationShort(lastSecs)}
              </span>
            ) : null}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{ageLabel}</span>
          {!lead.client_id ? (
            <button
              type="button" onClick={handleConvert} disabled={converting}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, color: 'var(--success)',
                background: 'var(--success-soft)', border: '1px solid var(--success-border)',
                borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                opacity: converting ? 0.6 : 1,
              }}
            >
              {converting ? 'Convertendo…' : <><ArrowRight size={10} /> Converter</>}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✓ Cliente</span>
          )}
        </div>
      </div>
    </>
  )
}

// --- Board principal ---------------------------------------------
export function CRMBoard({ initialLeads, stages, procedures, branchId, slug, networkMode, branches }: CRMBoardProps) {
  const [leads, setLeads]     = useState<Lead[]>(initialLeads)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage,  setOverStage]  = useState<string | null>(null)
  const [_pending,   startTransition] = useTransition()
  const enterCounts = useRef<Record<string, number>>({})

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [sort,    setSort]    = useState<SortOrder>('newest')

  // "Agora" compartilhado para as métricas de aging; atualiza a cada minuto.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  // Sincroniza quando o servidor revalida (ex: "Novo lead" do header da página)
  useEffect(() => {
    if (!draggingId) setLeads(initialLeads)
  }, [initialLeads])

  // Leads filtrados e ordenados (apenas para exibição; DnD usa `leads` completo)
  const visibleLeads = useMemo(() => {
    let result = leads

    if (filters.sources.length > 0)
      result = result.filter(l => l.source && filters.sources.includes(l.source))

    if (filters.tags.length > 0)
      result = result.filter(l => (l.tags ?? []).some(t => filters.tags.includes(t)))

    if (filters.procedureIds.length > 0)
      result = result.filter(l =>
        l.lead_procedures.some(lp => filters.procedureIds.includes(lp.procedure_id)),
      )

    if (filters.situation === 'converted')
      result = result.filter(l => !!l.client_id)
    else if (filters.situation === 'not_converted')
      result = result.filter(l => !l.client_id)

    if (filters.period !== 'all') {
      const days   = filters.period === '7d' ? 7 : filters.period === '30d' ? 30 : 90
      const cutoff = new Date(Date.now() - days * 864e5)
      result = result.filter(l => new Date(l.created_at) >= cutoff)
    }

    return [...result].sort((a, b) => {
      if (sort === 'newest')    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'oldest')    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sort === 'name_asc')  return a.name.localeCompare(b.name, 'pt-BR')
      if (sort === 'name_desc') return b.name.localeCompare(a.name, 'pt-BR')
      return 0
    })
  }, [leads, filters, sort])

  function handleLeadCreated(lead: Lead) {
    setLeads(prev => [lead, ...prev])
  }

  function handleLeadDeleted(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const el = e.currentTarget as HTMLElement
    const ghost = el.cloneNode(true) as HTMLElement
    ghost.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${el.offsetWidth}px;opacity:0.9;pointer-events:none;`
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 20, 20)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  function handleDragEnd() {
    setDraggingId(null); setOverStage(null); enterCounts.current = {}
  }

  function handleDragEnter(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    enterCounts.current[stageId] = (enterCounts.current[stageId] ?? 0) + 1
    setOverStage(stageId)
  }

  function handleDragLeave(_e: React.DragEvent, stageId: string) {
    enterCounts.current[stageId] = Math.max((enterCounts.current[stageId] ?? 1) - 1, 0)
    if (enterCounts.current[stageId] === 0) setOverStage(null)
  }

  function handleDrop(e: React.DragEvent, targetStageId: string) {
    e.preventDefault()
    const id   = e.dataTransfer.getData('text/plain')
    const lead = leads.find(l => l.id === id)
    if (!lead || lead.crm_stage_id === targetStageId) {
      setDraggingId(null); setOverStage(null); enterCounts.current = {}
      return
    }

    setLeads(prev => prev.map(l => l.id === id ? { ...l, crm_stage_id: targetStageId } : l))
    setDraggingId(null); setOverStage(null); enterCounts.current = {}
    startTransition(() => updateLeadStage(id, targetStageId, slug))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <FiltersBar
        leads={leads}
        filters={filters}
        sort={sort}
        onFiltersChange={setFilters}
        onSortChange={setSort}
        onClear={() => { setFilters(DEFAULT_FILTERS); setSort('newest') }}
      />

    <div style={{
      display: 'flex', gap: 12,
      overflowX: 'auto', paddingBottom: 20,
      minHeight: 'calc(100vh - 240px)',
      marginTop: 12,
    }}>
      {stages.map(stage => {
        const isFirstStage = stage.id === stages[0]?.id
        const stageLeads   = visibleLeads.filter(l =>
          l.crm_stage_id === stage.id ||
          (isFirstStage && l.crm_stage_id === null),
        )
        const isOver           = overStage === stage.id
        const isDraggingToThis = isOver && draggingId !== null
        const bg     = softBg(stage.color)
        const border = softBorder(stage.color)

        return (
          <div
            key={stage.id}
            onDragEnter={e => handleDragEnter(e, stage.id)}
            onDragLeave={e => handleDragLeave(e, stage.id)}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={e => handleDrop(e, stage.id)}
            style={{
              minWidth: 240, maxWidth: 260, flex: '0 0 248px',
              display: 'flex', flexDirection: 'column',
              borderRadius: 16,
              background: isDraggingToThis ? bg : 'transparent',
              border: `2px solid ${isDraggingToThis ? border : 'transparent'}`,
              transition: 'background 150ms, border-color 150ms',
              padding: isDraggingToThis ? 6 : 0,
            }}
          >
            {/* Cabeçalho */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: isDraggingToThis ? '4px 8px 10px' : '0 2px 10px',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)' }}>{stage.name}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, minWidth: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: stageLeads.length > 0 ? bg : 'var(--bg-app)',
                  color: stageLeads.length > 0 ? stage.color : 'var(--text-faint)',
                  borderRadius: 99, padding: '0 5px',
                  border: `1px solid ${stageLeads.length > 0 ? border : 'var(--border)'}`,
                }}>
                  {stageLeads.length}
                </span>
              </div>
              {!networkMode && (
              <CRMLeadModal
                branchId={branchId} slug={slug}
                stages={stages} procedures={procedures}
                initialStageId={stage.id}
                onLeadCreated={handleLeadCreated}
                trigger={
                  <button type="button" style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: 'var(--bg-app)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    <Plus size={13} />
                  </button>
                }
              />
              )}
            </div>

            {/* Cards */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              flex: 1, overflowY: 'auto', padding: '0 2px', minHeight: 80,
            }}>
              {stageLeads.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead} slug={slug} branchId={branchId}
                  stages={stages} procedures={procedures} branches={branches}
                  networkMode={networkMode}
                  nowMs={nowMs}
                  isDragging={draggingId === lead.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onLeadDeleted={handleLeadDeleted}
                />
              ))}

              {stageLeads.length === 0 && (
                <div style={{
                  border: `2px dashed ${isDraggingToThis ? stage.color : 'var(--border)'}`,
                  borderRadius: 10, padding: '20px 12px', textAlign: 'center',
                  background: isDraggingToThis ? bg : 'transparent',
                  transition: 'all 150ms',
                }}>
                  <p style={{ fontSize: 11.5, color: isDraggingToThis ? stage.color : 'var(--text-faint)', fontWeight: isDraggingToThis ? 700 : 400 }}>
                    {isDraggingToThis ? 'Soltar aqui' : 'Sem leads'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}
