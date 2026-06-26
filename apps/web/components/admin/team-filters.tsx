'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

interface TeamFiltersProps {
  branches:   { id: string; name: string }[]
  roles:      { key: string; label: string }[]
  initialQ:       string
  initialBranch:  string
  initialRole:    string
  initialStatus:  string
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--bg-app)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-field-token)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sm-sz)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text)',
  cursor: 'pointer',
  outline: 'none',
  height: 38,
}

export function TeamFilters({
  branches, roles,
  initialQ, initialBranch, initialRole, initialStatus,
}: TeamFiltersProps) {
  const router     = useRouter()
  const pathname   = usePathname()
  const params     = useSearchParams()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const [search, setSearch] = useState(initialQ)

  const hasFilters = !!(initialQ || initialBranch || initialRole || initialStatus)

  function buildParams(overrides: Record<string, string>) {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v)
      else p.delete(k)
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

  function handleSelect(key: string, value: string) {
    router.push(`${pathname}?${buildParams({ [key]: value })}`)
  }

  function clearAll() {
    setSearch('')
    router.push(pathname)
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {/* Busca */}
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <Search
          size={14}
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-faint)', pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="field"
          style={{ paddingLeft: 32, height: 38 }}
        />
      </div>

      {/* Filial */}
      <select
        value={initialBranch}
        onChange={e => handleSelect('branch', e.target.value)}
        style={selectStyle}
      >
        <option value="">Todas as filiais</option>
        {branches.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      {/* Cargo */}
      <select
        value={initialRole}
        onChange={e => handleSelect('role', e.target.value)}
        style={selectStyle}
      >
        <option value="">Todos os cargos</option>
        {roles.map(r => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>

      {/* Situação */}
      <select
        value={initialStatus}
        onChange={e => handleSelect('status', e.target.value)}
        style={selectStyle}
      >
        <option value="">Todas as situações</option>
        <option value="active">Ativo</option>
        <option value="inactive">Inativo</option>
      </select>

      {/* Limpar filtros */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="btn-ghost"
          style={{ gap: 5, color: 'var(--text-muted)', flexShrink: 0 }}
        >
          <X size={13} />
          Limpar
        </button>
      )}
    </div>
  )
}
