import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import type { BootstrapData, Branch, ExtMode } from '../lib/types'
import { AgendaDia } from './AgendaDia'
import { NovoAgendamento } from './NovoAgendamento'

type Tab = 'agenda' | 'novo'

const STORAGE_KEY = 'selectedBranchId'

/** Lê a filial persistida (chrome.storage.local). */
function getStoredBranch(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(STORAGE_KEY, (r) => resolve((r?.[STORAGE_KEY] as string) ?? null))
    } catch {
      resolve(null)
    }
  })
}

export function Panel() {
  const [tab, setTab]         = useState<Tab>('agenda')
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [mode, setMode]       = useState<ExtMode>('branch')
  const [branchId, setBranchId] = useState<string | null>(null)
  const [data, setData]       = useState<BootstrapData | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 1. Carrega as unidades disponíveis; auto-seleciona quando só há uma.
  useEffect(() => {
    api.branches().then(async (r) => {
      setBranches(r.branches)
      setMode(r.mode)
      if (r.mode === 'branch' || r.branches.length === 1) {
        selectBranch(r.branches[0]?.id ?? null)
      } else {
        const stored = await getStoredBranch()
        if (stored && r.branches.some((b) => b.id === stored)) selectBranch(stored)
      }
    }).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. Ao escolher a unidade, carrega o bootstrap dela.
  function selectBranch(id: string | null) {
    setBranchId(id)
    if (!id) return
    try { chrome.storage.local.set({ [STORAGE_KEY]: id }) } catch { /* ignore */ }
    setData(null)
    setError(null)
    api.bootstrap(id).then(setData).catch((e) => setError(e.message))
  }

  const showBranchPicker = mode === 'network' && !branchId
  const canSwitchBranch  = mode === 'network' && (branches?.length ?? 0) > 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--hairline)', background: '#fff',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--brand)' }}>
            Bellaris <span style={{ color: 'var(--text)' }}>✦</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {data?.branch?.name ?? (showBranchPicker ? 'Escolha a unidade' : '—')}
            {canSwitchBranch && branchId && (
              <button
                onClick={() => setBranchId(null)}
                style={{ border: 'none', background: 'transparent', color: 'var(--brand)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                trocar
              </button>
            )}
          </div>
        </div>
        <button
          className="btn-secondary"
          style={{ padding: '6px 10px', fontSize: 12 }}
          onClick={() => supabase.auth.signOut()}
        >
          Sair
        </button>
      </div>

      {/* Seletor de unidade (comercial, rede com >1 filial) */}
      {showBranchPicker && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div className="error-box">{error}</div>}
          <label className="overline">Unidade</label>
          {!branches && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando unidades…</div>}
          {branches?.map((b) => (
            <button
              key={b.id}
              className="card"
              onClick={() => selectBranch(b.id)}
              style={{ textAlign: 'left', padding: '11px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Abas + conteúdo (após unidade resolvida) */}
      {!showBranchPicker && (
        <>
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
            {(['agenda', 'novo'] as Tab[]).map((t) => (
              <button
                key={t}
                className="chip"
                data-selected={tab === t}
                onClick={() => setTab(t)}
                style={{ flex: 1 }}
              >
                {t === 'agenda' ? 'Agenda' : 'Novo agendamento'}
              </button>
            ))}
          </div>

          <div style={{ padding: 16, flex: 1 }}>
            {error && <div className="error-box">{error}</div>}
            {!error && !data && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                Carregando dados da unidade…
              </div>
            )}
            {data && tab === 'agenda' && <AgendaDia reloadKey={reloadKey} branchId={branchId ?? undefined} />}
            {data && tab === 'novo' && (
              <NovoAgendamento
                data={data}
                branchId={branchId ?? undefined}
                onCreated={() => { setReloadKey((k) => k + 1); setTab('agenda') }}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
