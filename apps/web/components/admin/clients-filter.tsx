'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface Props {
  branches: { id: string; name: string }[]
}

export function ClientsFilter({ branches }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }, [pathname, router, searchParams])

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
        <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
        {pending && <Loader2 size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />}
        <input
          type="search"
          placeholder="Buscar por nome, CPF ou telefone…"
          defaultValue={searchParams.get('q') ?? ''}
          onChange={e => update('q', e.target.value)}
          style={{
            width: '100%', padding: '8px 10px 8px 32px',
            borderRadius: 9, border: '1px solid var(--border)',
            fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Branch filter */}
      <select
        defaultValue={searchParams.get('branch') ?? ''}
        onChange={e => update('branch', e.target.value)}
        style={{
          padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)',
          fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
          outline: 'none', minWidth: 160,
        }}
      >
        <option value="">Todas as filiais</option>
        {branches.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  )
}
