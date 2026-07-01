'use client'

import { useState } from 'react'
import type { Campaign } from '@/lib/ads/types'

type SortKey = keyof Pick<Campaign, 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'conversions'>

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
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...campaigns].sort((a, b) => {
    const av = (a[sortKey] ?? 0) as number
    const bv = (b[sortKey] ?? 0) as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const totals = campaigns.reduce((acc, c) => ({
    spend:       acc.spend       + c.spend,
    impressions: acc.impressions + c.impressions,
    clicks:      acc.clicks      + c.clicks,
    conversions: acc.conversions + (c.conversions ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 })

  const totalCtr = totals.impressions > 0
    ? (totals.clicks / totals.impressions) * 100 : 0
  const totalCpc = totals.clicks > 0
    ? totals.spend / totals.clicks : 0

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

  if (campaigns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
        Nenhuma campanha encontrada no período.
      </div>
    )
  }

  return (
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
            <th style={headerStyle} onClick={() => handleSort('clicks')}>
              Cliques <SortIcon k="clicks" />
            </th>
            <th style={headerStyle} onClick={() => handleSort('ctr')}>
              CTR <SortIcon k="ctr" />
            </th>
            <th style={headerStyle} onClick={() => handleSort('cpc')}>
              CPC <SortIcon k="cpc" />
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
              <td style={cellStyle}>{fmtNum(c.clicks)}</td>
              <td style={cellStyle}>{fmtPct(c.ctr)}</td>
              <td style={cellStyle}>{fmtBRL(c.cpc)}</td>
              <td style={cellStyle}>{c.conversions != null ? fmtNum(c.conversions) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ ...totalCellStyle, textAlign: 'left', fontWeight: 'var(--weight-bold)' }}>
              Total — {campaigns.length} {campaigns.length === 1 ? 'campanha ativa' : 'campanhas ativas'}
            </td>
            <td style={totalCellStyle}>{fmtBRL(totals.spend)}</td>
            <td style={totalCellStyle}>{fmtNum(totals.impressions)}</td>
            <td style={totalCellStyle}>{fmtNum(totals.clicks)}</td>
            <td style={totalCellStyle}>{fmtPct(totalCtr)}</td>
            <td style={totalCellStyle}>{fmtBRL(totalCpc)}</td>
            <td style={totalCellStyle}>{fmtNum(totals.conversions)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
