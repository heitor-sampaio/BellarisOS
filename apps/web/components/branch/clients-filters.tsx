'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

interface ClientsFiltersProps {
  tags:          string[]
  initialQ:      string
  initialStatus: string
  initialTag:    string
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', height: 38,
  background: 'var(--bg-app)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-field-token)',
  fontFamily: 'inherit', fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)',
  color: 'var(--text)', cursor: 'pointer', outline: 'none',
}

export function ClientsFilters({ tags, initialQ, initialStatus, initialTag }: ClientsFiltersProps) {
  const router      = useRouter()
  const pathname    = usePathname()
  const params      = useSearchParams()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [search, setSearch] = useState(initialQ)

  const hasFilters = !!(initialQ || initialStatus || initialTag)

  function buildParams(overrides: Record<string, string>) {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    return p.toString()
  }

  function handleSearch(value: string) {
    setSearch(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      router.push(`${pathname}?${buildParams({ q: value })}`)
    }, 350)
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
        <input
          type="text" value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou e-mail…"
          className="field" style={{ paddingLeft: 32, height: 38 }}
        />
      </div>

      <select value={initialStatus} onChange={e => router.push(`${pathname}?${buildParams({ status: e.target.value })}`)} style={selectStyle}>
        <option value="">Todos</option>
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
      </select>

      <select value={initialTag} onChange={e => router.push(`${pathname}?${buildParams({ tag: e.target.value })}`)} style={selectStyle}>
        <option value="">Todas as tags</option>
        {tags.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      {hasFilters && (
        <button
          onClick={() => { setSearch(''); router.push(pathname) }}
          className="btn-ghost" style={{ gap: 5, color: 'var(--text-muted)', flexShrink: 0 }}
        >
          <X size={13} /> Limpar
        </button>
      )}
    </div>
  )
}
