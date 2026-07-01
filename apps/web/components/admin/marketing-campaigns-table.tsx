'use client'

import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import type { Campaign } from '@/lib/ads/types'

type SortKey = 'spend' | 'impressions' | 'cpm' | 'linkClicks' | 'linkCtr' | 'linkCpc' | 'conversions'
type StatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'

const STATUS_LABEL: Record<string, string> = {
  ACTIVE:   'Ativo',
  PAUSED:   'Pausado',
  ARCHIVED: 'Arquivado',
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:   'var(--success)',
  PAUSED:   'var(--warning, #d97706)',
  ARCHIVED: 'var(--text-muted)',
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtPct(v: number) {
  return v.toFixed(2).replace('.', ',') + '%'
}
function fmtNum(v: number) {
  return v.toLocaleString('pt-BR')
}

export function MarketingCampaignsTable({ campaigns }: { campaigns: Campaign[] }) {
  const [sortKey, setSortKey]       = useState<SortKey>('spend')
  const [sortDir, setSortDir]       = useState<'desc' | 'asc'>('desc')
  const [statusFilter, setStatus]   = useState<StatusFilter>('ALL')
  const [search, setSearch]         = useState('')

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    return campaigns.filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [campaigns, statusFilter, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number
      const bv = (b[sortKey] ?? 0) as number
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [filtered, sortKey, sortDir])

  const totals = useMemo(() => filtered.reduce((acc, c) => ({
    spend:       acc.spend       + c.spend,
    impressions: acc.impressions + c.impressions,
    linkClicks:  acc.linkClicks  + (c.linkClicks ?? 0),
    conversions: acc.conversions + (c.conversions ?? 0),
  }), { spend: 0, impressions: 0, linkClicks: 0, conversions: 0 }), [filtered])

  const totalCpm     = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0
  const totalLinkCtr = totals.impressions > 0 ? (totals.linkClicks / totals.impressions) * 100 : 0
  const totalLinkCpc = totals.linkClicks  > 0 ? totals.spend / totals.linkClicks : 0

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: campaigns.length }
    for (const c of campaigns) counts[c.status] = (counts[c.status] ?? 0) + 1
    return counts
  }, [campaigns])

  const headerStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs-sz)',
    fontWeight: 'var(--weight-bold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '10px 12px',
    textAlign: 'right',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  }
  const cellStyle: React.CSSProperties = {
    padding: '11px 12px',
    fontSize: 'var(--text-sm-sz)',
    color: 'var(--text)',
    textAlign: 'right',
    borderTop: '1px solid var(--hairline)',
  }
  const totalCellStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 'var(--weight-bold)',
    borderTop: '2px solid var(--border)',
    background: 'var(--surface-raised, #fafaf9)',
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return <span style={{ opacity: 0.3 }}> ↕</span>
    return <span style={{ color: 'var(--brand)' }}>{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>
  }

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'ALL',      label: `Todas (${statusCounts.ALL ?? 0})` },
    { key: 'ACTIVE',   label: `Ativas (${statusCounts.ACTIVE ?? 0})` },
    { key: 'PAUSED',   label: `Pausadas (${statusCounts.PAUSED ?? 0})` },
    { key: 'ARCHIVED', label: `Arquivadas (${statusCounts.ARCHIVED ?? 0})` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Busca por nome */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '6px 10px', background: '#fff', flex: '1 1 200px', minWidth: 180,
        }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar campanha..."
            style={{
              border: 'none', outline: 'none', fontSize: 'var(--text-sm-sz)',
              color: 'var(--text)', background: 'transparent', width: '100%',
            }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={13} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Filtro de status */}
        <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 8, padding: 3, border: '1px solid var(--border)', flexShrink: 0 }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={statusFilter === f.key ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
          Nenhuma campanha encontrada{search ? ` para "${search}"` : ''}.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...headerStyle, textAlign: 'left' }}>Campanha</th>
                <th style={headerStyle}>Status</th>
                <th style={headerStyle} onClick={() => handleSort('spend')}>
                  Gasto <SortIcon k="spend" />
                </th>
                <th style={headerStyle} onClick={() => handleSort('impressions')}>
                  Impressões <SortIcon k="impressions" />
                </th>
                <th style={headerStyle} onClick={() => handleSort('cpm')}>
                  CPM <SortIcon k="cpm" />
                </th>
                <th style={headerStyle} onClick={() => handleSort('linkClicks')}>
                  Cliques no link <SortIcon k="linkClicks" />
                </th>
                <th style={headerStyle} onClick={() => handleSort('linkCtr')}>
                  CTR (link) <SortIcon k="linkCtr" />
                </th>
                <th style={headerStyle} onClick={() => handleSort('linkCpc')}>
                  CPC (link) <SortIcon k="linkCpc" />
                </th>
                <th style={headerStyle} onClick={() => handleSort('conversions')}>
                  Conversões <SortIcon k="conversions" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr key={c.id}>
                  <td style={{ ...cellStyle, textAlign: 'left', maxWidth: 260 }}>
                    <span style={{
                      display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: 'var(--weight-semibold)',
                    }}>
                      {c.name}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                      fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
                      color: STATUS_COLOR[c.status] ?? 'var(--text-muted)',
                      background: (STATUS_COLOR[c.status] ?? 'var(--text-muted)') + '18',
                    }}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td style={cellStyle}>{fmtBRL(c.spend)}</td>
                  <td style={cellStyle}>{fmtNum(c.impressions)}</td>
                  <td style={cellStyle}>{fmtBRL(c.cpm)}</td>
                  <td style={cellStyle}>{c.linkClicks != null ? fmtNum(c.linkClicks) : '—'}</td>
                  <td style={cellStyle}>{c.linkCtr   != null ? fmtPct(c.linkCtr)   : '—'}</td>
                  <td style={cellStyle}>{c.linkCpc   != null ? fmtBRL(c.linkCpc)   : '—'}</td>
                  <td style={cellStyle}>{c.conversions != null ? fmtNum(c.conversions) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ ...totalCellStyle, textAlign: 'left' }}>
                  {filtered.length} {filtered.length === 1 ? 'campanha' : 'campanhas'}
                  {statusFilter !== 'ALL' && ` · ${STATUS_LABEL[statusFilter]?.toLowerCase()}`}
                  {search && ` · "${search}"`}
                </td>
                <td style={totalCellStyle}>{fmtBRL(totals.spend)}</td>
                <td style={totalCellStyle}>{fmtNum(totals.impressions)}</td>
                <td style={totalCellStyle}>{fmtBRL(totalCpm)}</td>
                <td style={totalCellStyle}>{fmtNum(totals.linkClicks)}</td>
                <td style={totalCellStyle}>{fmtPct(totalLinkCtr)}</td>
                <td style={totalCellStyle}>{fmtBRL(totalLinkCpc)}</td>
                <td style={totalCellStyle}>{fmtNum(totals.conversions)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
