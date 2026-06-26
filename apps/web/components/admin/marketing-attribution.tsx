'use client'

import { useState } from 'react'

interface AttributedLead {
  id: string
  name: string
  phone: string | null
  created_at: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  fbclid: string | null
  gclid: string | null
  crm_stage: string | null
  client_id: string | null
}

const SOURCE_COLORS: Record<string, string> = {
  facebook:  '#1877F2',
  instagram: '#E1306C',
  google:    '#34A853',
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)' }}>—</span>
  const color = SOURCE_COLORS[source.toLowerCase()] ?? 'var(--text-muted)'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
      color, background: color + '1a',
    }}>
      {source}
    </span>
  )
}

function truncate(s: string | null, n = 16) {
  if (!s) return null
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function MarketingAttribution({ leads }: { leads: AttributedLead[] }) {
  const [filter, setFilter] = useState<'all' | 'meta' | 'google'>('all')

  const filtered = leads.filter(l => {
    if (filter === 'meta')   return l.fbclid || l.utm_source?.toLowerCase().includes('facebook') || l.utm_source?.toLowerCase().includes('instagram')
    if (filter === 'google') return l.gclid  || l.utm_source?.toLowerCase() === 'google'
    return true
  })

  const convertedCount = filtered.filter(l => l.client_id).length
  const convRate = filtered.length > 0
    ? ((convertedCount / filtered.length) * 100).toFixed(1).replace('.', ',') + '%'
    : '—'

  const headerStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
    color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.05em', padding: '10px 12px',
    whiteSpace: 'nowrap',
  }
  const cellStyle: React.CSSProperties = {
    padding: '11px 12px', fontSize: 'var(--text-sm-sz)',
    color: 'var(--text)', borderTop: '1px solid var(--hairline)',
  }

  return (
    <div>
      {/* Header + stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'meta', 'google'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '5px 14px', fontSize: 'var(--text-xs-sz)' }}
            >
              {f === 'all' ? 'Todas as origens' : f === 'meta' ? 'Meta' : 'Google'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <span>
            <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong> leads
          </span>
          <span>
            <strong style={{ color: 'var(--success)' }}>{convertedCount}</strong> convertidos
          </span>
          <span>
            Taxa: <strong style={{ color: 'var(--text)' }}>{convRate}</strong>
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 0',
          color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)',
        }}>
          Nenhum lead com dados de atribuição encontrado.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={headerStyle}>Nome</th>
                <th style={headerStyle}>Origem</th>
                <th style={headerStyle}>Campanha (UTM)</th>
                <th style={headerStyle}>Click ID</th>
                <th style={headerStyle}>Data</th>
                <th style={headerStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id}>
                  <td style={{ ...cellStyle, fontWeight: 'var(--weight-semibold)' }}>
                    {lead.name}
                  </td>
                  <td style={cellStyle}>
                    <SourceBadge source={lead.utm_source} />
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>
                    {lead.utm_campaign ?? '—'}
                  </td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                    {truncate(lead.fbclid) ?? truncate(lead.gclid) ?? '—'}
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td style={cellStyle}>
                    {lead.client_id ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                        fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
                        color: 'var(--success)', background: 'var(--success)1a',
                      }}>
                        Convertido
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                        fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
                        color: 'var(--text-muted)', background: 'var(--hairline)',
                      }}>
                        {lead.crm_stage ?? 'Lead'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
