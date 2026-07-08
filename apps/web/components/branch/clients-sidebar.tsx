'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, UserPlus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ClientItem {
  id:         string
  name:       string
  phone:      string
  tags:       string[]
  isActive:   boolean
  isNew:      boolean
  lastVisit:  string | null
  branchId?:  string
  branchName?: string
}

interface Props {
  clients:           ClientItem[]
  basePath:          string          // e.g. "/lumiere-sp/clients" or "/admin/clients"
  totalActive:       number
  newClientHref?:    string | null   // null = hide button; undefined = basePath + "/new"
  availableBranches?: { id: string; name: string }[]  // admin-only: shows branch filter
}

type Filter = 'todos' | 'vip' | 'novos' | 'inativos'

function getInitials(name: string) {
  const parts = name.trim().split(' ')
  return (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? parts[0]?.[1] ?? '')
}

function lastVisitLabel(iso: string | null): string {
  if (!iso) return 'Sem visitas'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Última visita: Hoje'
  if (days === 1) return 'Última visita: Ontem'
  if (days < 7)  return `Última visita: ${days} dias`
  return `Última visita: ${formatDistanceToNow(new Date(iso), { locale: ptBR, addSuffix: true })}`
}

export function ClientsSidebar({
  clients,
  basePath,
  totalActive,
  newClientHref,
  availableBranches,
}: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const [search,           setSearch]           = useState('')
  const [filter,           setFilter]           = useState<Filter>('todos')
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')

  const filtered = clients.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    const matchFilter =
      filter === 'todos'    ? c.isActive :
      filter === 'vip'      ? c.isActive && c.tags.includes('VIP') :
      filter === 'novos'    ? c.isActive && c.isNew :
      filter === 'inativos' ? !c.isActive : true
    const matchBranch = !selectedBranchId || c.branchId === selectedBranchId
    return matchSearch && matchFilter && matchBranch
  })

  // Extract selected client id from pathname like /[slug]/clients/[id] or /admin/clients/[id]
  const pathParts  = pathname.split('/')
  const selectedId = pathParts[pathParts.indexOf('clients') + 1] ?? null

  const filterOptions: { key: Filter; label: string }[] = [
    { key: 'todos',    label: 'Todos' },
    { key: 'vip',      label: 'VIP' },
    { key: 'novos',    label: 'Novos' },
    { key: 'inativos', label: 'Inativos' },
  ]

  const addHref = newClientHref === undefined ? `${basePath}/new` : newClientHref

  return (
    <div className="clients-master-list" style={{
      width: 'var(--client-list-w)', flexShrink: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100vh - var(--topbar-h) - 2 * var(--content-pad-y))',
      position: 'sticky', top: 'calc(var(--topbar-h) + var(--content-pad-y))',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
              Clientes
            </h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
              {totalActive.toLocaleString('pt-BR')} ativos
            </span>
          </div>
          {addHref !== null && (
            <button
              type="button"
              onClick={() => router.push(addHref!)}
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: 'var(--brand)', color: '#fff',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Novo cliente"
            >
              <UserPlus size={14} />
            </button>
          )}
        </div>

        {/* Branch filter — admin-only */}
        {availableBranches && availableBranches.length > 1 && (
          <select
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
            className="field"
            style={{ fontSize: 12, marginBottom: 8 }}
          >
            <option value="">Todas as unidades</option>
            {availableBranches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Buscar por nome…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="field"
            style={{ paddingLeft: 28, fontSize: 12 }}
          />
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4 }}>
          {filterOptions.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 20, border: 'none', cursor: 'pointer',
                background: filter === f.key ? 'var(--brand)' : 'var(--bg-app)',
                color:      filter === f.key ? '#fff' : 'var(--text-muted)',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Client list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
            Nenhum cliente encontrado
          </div>
        ) : (
          filtered.map(c => {
            const isSelected = c.id === selectedId
            const initials   = getInitials(c.name).toUpperCase()
            const isVip      = c.tags.includes('VIP')
            const badgeLabel = isVip ? 'VIP' : c.isNew ? 'Novo' : 'Regular'
            const badgeColor = isVip ? '#c34d6b' : c.isNew ? '#3f9b6f' : 'var(--text-faint)'
            const badgeBg    = isVip ? '#fce7ec' : c.isNew ? '#e7fce7' : 'var(--bg-app)'

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`${basePath}/${c.id}`)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '11px 16px',
                  background: isSelected ? 'var(--brand-soft)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--hairline)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-app)' }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: isSelected ? 'var(--brand)' : 'var(--brand-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                  color: isSelected ? '#fff' : 'var(--brand)',
                }}>
                  {initials}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--brand)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                      padding: '2px 6px', borderRadius: 10,
                      background: badgeBg, color: badgeColor,
                    }}>
                      {badgeLabel}
                    </span>
                  </div>
                  {c.branchName ? (
                    <p style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.branchName}
                    </p>
                  ) : (
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastVisitLabel(c.lastVisit)}
                    </p>
                  )}
                  {c.branchName && (
                    <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastVisitLabel(c.lastVisit)}
                    </p>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
