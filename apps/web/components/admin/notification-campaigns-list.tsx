'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Archive, Eye, Pause, Play, Clock, Zap, RefreshCw } from 'lucide-react'
import { archiveCampaign, pauseCampaign, activateCampaign } from '@/actions/notification-campaigns'
import type { NotificationCampaign, CampaignStatus, CampaignType } from '@/actions/notification-campaigns'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

// -- Constants ----------------------------------------------------------

const STATUS_CFG: Record<CampaignStatus, { label: string; color: string }> = {
  DRAFT:     { label: 'Rascunho',  color: '#6b7280' },
  ACTIVE:    { label: 'Ativa',     color: '#16a34a' },
  PAUSED:    { label: 'Pausada',   color: '#d97706' },
  COMPLETED: { label: 'Concluída', color: '#2563eb' },
  ARCHIVED:  { label: 'Arquivada', color: '#9ca3af' },
}

const TYPE_CFG: Record<CampaignType, { label: string; Icon: React.ElementType; color: string }> = {
  IMMEDIATE: { label: 'Imediata',   Icon: Zap,        color: '#7c3aed' },
  SCHEDULED: { label: 'Agendada',   Icon: Clock,      color: '#0284c7' },
  AUTOMATED: { label: 'Automática', Icon: RefreshCw,  color: 'var(--brand)' },
}

const TRIGGER_LABELS: Record<string, string> = {
  BIRTHDAY:           'Aniversário',
  ANNUAL_DATE:        'Data comemorativa',
  BEFORE_APPOINTMENT: 'Lembrete de agenda',
  DAYS_AFTER_VISIT:   'Pós-visita',
  DAYS_BEFORE_EXPIRY: 'Venc. de pacote',
}

// -- Component ----------------------------------------------------------

interface Props {
  campaigns:    NotificationCampaign[]
  totalSent:    number
  activeCount:  number
}

type Filter = 'ALL' | CampaignStatus

export function NotificationCampaignsList({ campaigns, totalSent, activeCount }: Props) {
  const router = useRouter()
  const [filter, setFilter]   = useState<Filter>('ALL')
  const [isPending, startTransition] = useTransition()
  const [loadingId, setLoadingId]    = useState<string | null>(null)

  const lastCampaign = campaigns.find(c => c.last_run_at)

  const filtered = useMemo(() => {
    if (filter === 'ALL') return campaigns
    return campaigns.filter(c => c.status === filter)
  }, [campaigns, filter])

  function handleAction(id: string, fn: () => Promise<{ error?: string }>) {
    setLoadingId(id)
    startTransition(async () => {
      const res = await fn()
      if (res?.error) alert(res.error)
      setLoadingId(null)
    })
  }

  const counts = useMemo(() => ({
    DRAFT:     campaigns.filter(c => c.status === 'DRAFT').length,
    ACTIVE:    activeCount,
    PAUSED:    campaigns.filter(c => c.status === 'PAUSED').length,
    COMPLETED: campaigns.filter(c => c.status === 'COMPLETED').length,
    ARCHIVED:  campaigns.filter(c => c.status === 'ARCHIVED').length,
  }), [campaigns, activeCount])

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'ALL',       label: `Todas (${campaigns.length})` },
    { key: 'DRAFT',     label: `Rascunho (${counts.DRAFT})` },
    { key: 'ACTIVE',    label: `Ativas (${counts.ACTIVE})` },
    { key: 'PAUSED',    label: `Pausadas (${counts.PAUSED})` },
    { key: 'COMPLETED', label: `Concluídas (${counts.COMPLETED})` },
    { key: 'ARCHIVED',  label: `Arquivadas (${counts.ARCHIVED})` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <RealtimeRefresher tables={['notification_campaigns']} />

      {/* -- KPI strip -------------------------------------------- */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <KpiCard label="Total enviadas" value={totalSent.toLocaleString('pt-BR')} />
        <KpiCard label="Campanhas ativas" value={String(activeCount)} />
        <KpiCard
          label="Último disparo"
          value={lastCampaign?.last_run_at
            ? new Date(lastCampaign.last_run_at).toLocaleDateString('pt-BR')
            : '—'}
        />
      </div>

      {/* -- Header ----------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {/* Filters */}
        <div className="seg-bar" style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={filter === f.key ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => router.push('/admin/notificacoes/nova')}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} />
          Nova campanha
        </button>
      </div>

      {/* -- Table ------------------------------------------------ */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
            Nenhuma campanha encontrada
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            Crie sua primeira campanha para começar a se comunicar com clientes.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Campanha', 'Tipo', 'Status', 'Enviadas', 'Lidas', 'Última execução', 'Ações'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px',
                      fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
                      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      textAlign: h === 'Campanha' ? 'left' : 'center',
                      whiteSpace: 'nowrap', background: 'var(--surface-raised, #fafaf9)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const statusCfg = STATUS_CFG[c.status] ?? STATUS_CFG.DRAFT
                  const typeCfg   = TYPE_CFG[c.type]
                  const readRate  = c.total_sent > 0 ? Math.round(c.total_read / c.total_sent * 100) : 0
                  const isLoading = loadingId === c.id && isPending

                  return (
                    <tr
                      key={c.id}
                      style={{ borderTop: '1px solid var(--hairline)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-raised, #fafaf9)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      {/* Name */}
                      <td style={{ padding: '13px 16px' }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>
                          {c.name}
                        </p>
                        {c.description && (
                          <p style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                            {c.description}
                          </p>
                        )}
                        {c.trigger_type && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {TRIGGER_LABELS[c.trigger_type] ?? c.trigger_type}
                          </span>
                        )}
                      </td>

                      {/* Type */}
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 99,
                          fontSize: 12, fontWeight: 700,
                          color: typeCfg.color,
                          background: `${typeCfg.color}18`,
                        }}>
                          <typeCfg.Icon size={11} />
                          {typeCfg.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 99,
                          fontSize: 12, fontWeight: 700,
                          color: statusCfg.color,
                          background: `${statusCfg.color}18`,
                        }}>
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Sent */}
                      <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                        {c.total_sent.toLocaleString('pt-BR')}
                      </td>

                      {/* Read rate */}
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        {c.total_sent > 0 ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: readRate >= 40 ? '#16a34a' : 'var(--text-muted)' }}>
                            {readRate}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Last run */}
                      <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                        {c.last_run_at
                          ? new Date(c.last_run_at).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <IconBtn
                            icon={<Eye size={14} />}
                            title="Ver detalhes"
                            onClick={() => router.push(`/admin/notificacoes/${c.id}`)}
                          />
                          {c.status === 'DRAFT' && (
                            <IconBtn
                              icon={<Play size={14} />}
                              title="Ativar"
                              color="var(--brand)"
                              loading={isLoading}
                              onClick={() => handleAction(c.id, () => activateCampaign(c.id))}
                            />
                          )}
                          {c.status === 'ACTIVE' && c.type === 'AUTOMATED' && (
                            <IconBtn
                              icon={<Pause size={14} />}
                              title="Pausar"
                              color="#d97706"
                              loading={isLoading}
                              onClick={() => handleAction(c.id, () => pauseCampaign(c.id))}
                            />
                          )}
                          {!['ARCHIVED', 'COMPLETED'].includes(c.status) && (
                            <IconBtn
                              icon={<Archive size={14} />}
                              title="Arquivar"
                              color="#6b7280"
                              loading={isLoading}
                              onClick={() => {
                                if (confirm(`Arquivar "${c.name}"?`))
                                  handleAction(c.id, () => archiveCampaign(c.id))
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// -- Sub-components ----------------------------------------------------

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', padding: '16px 20px', minWidth: 140 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
        {value}
      </p>
    </div>
  )
}

function IconBtn({
  icon, title, onClick, color = 'var(--text-muted)', loading = false,
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  color?: string
  loading?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={loading}
      style={{
        width: 30, height: 30, borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {icon}
    </button>
  )
}
