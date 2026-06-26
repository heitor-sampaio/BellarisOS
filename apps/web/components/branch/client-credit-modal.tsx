'use client'

import { forwardRef, useImperativeHandle, useRef, useCallback, useActionState, useEffect, useState, useMemo } from 'react'
import { X, Gift, Search, Check } from 'lucide-react'
import { grantInternalCredit } from '@/actions/clients'

export interface ClientCreditModalHandle { open: () => void }

interface Props {
  branchId: string
  slug:     string
  clients:  { id: string; name: string }[]
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 'var(--text-xs-sz)', fontWeight: 700,
      color: 'var(--text-muted)', letterSpacing: '0.04em',
    }}>
      {children}
    </label>
  )
}

export const ClientCreditModal = forwardRef<ClientCreditModalHandle, Props>(
  function ClientCreditModal({ branchId, slug, clients }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const formRef   = useRef<HTMLFormElement>(null)

    const [search,     setSearch]     = useState('')
    const [clientId,   setClientId]   = useState('')
    const [clientName, setClientName] = useState('')
    const [open_dd,    setOpenDd]     = useState(false)

    const [state, formAction, pending] = useActionState(grantInternalCredit, null)

    const filtered = useMemo(
      () => search.length >= 2
        ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
        : [],
      [clients, search],
    )

    const open = useCallback(() => {
      formRef.current?.reset()
      setSearch('')
      setClientId('')
      setClientName('')
      setOpenDd(false)
      dialogRef.current?.showModal()
    }, [])

    const close = useCallback(() => dialogRef.current?.close(), [])

    useImperativeHandle(ref, () => ({ open }), [open])

    useEffect(() => {
      if (state && !state.error) close()
    }, [state])

    function selectClient(id: string, name: string) {
      setClientId(id)
      setClientName(name)
      setSearch(name)
      setOpenDd(false)
    }

    return (
      <dialog
        ref={dialogRef} className="modal"
        onClick={e => { if (e.target === dialogRef.current) close() }}
      >
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
          padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Crédito para cliente
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Conceder saldo de crédito interno
            </p>
          </div>
          <button type="button" onClick={close} style={{
            width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--bg-app)',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '24px 24px 28px' }}>
          <form ref={formRef} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input type="hidden" name="branch_id" value={branchId} />
            <input type="hidden" name="slug"      value={slug} />
            <input type="hidden" name="client_id" value={clientId} />

            {/* Cliente */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Cliente *</Label>
              <div style={{ position: 'relative' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '0 10px', background: 'var(--surface)',
                }}>
                  {clientId
                    ? <Check size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                    : <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  }
                  <input
                    type="text"
                    placeholder="Buscar cliente por nome…"
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value)
                      setClientId('')
                      setClientName('')
                      setOpenDd(true)
                    }}
                    onFocus={() => setOpenDd(true)}
                    style={{
                      flex: 1, border: 'none', outline: 'none', background: 'transparent',
                      fontSize: 13, color: 'var(--text)', padding: '9px 0',
                    }}
                    autoComplete="off"
                  />
                </div>

                {open_dd && filtered.length > 0 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden',
                  }}>
                    {filtered.map(c => (
                      <button
                        key={c.id} type="button"
                        onMouseDown={() => selectClient(c.id, c.name)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                          background: 'transparent', border: 'none',
                          color: 'var(--text)',
                          borderBottom: '1px solid var(--hairline)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {search.length >= 2 && !clientId && filtered.length === 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Nenhum cliente encontrado.</p>
              )}
            </div>

            {/* Valor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Valor do crédito (R$) *</Label>
              <input
                name="amount" type="number" step="0.01" min="0.01" required
                className="field" placeholder="0,00"
              />
            </div>

            {/* Motivo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Motivo / descrição *</Label>
              <input
                name="description" type="text" required className="field"
                placeholder="Ex: Estorno de procedimento cancelado"
              />
            </div>

            {state?.error && (
              <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                {state.error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={close} className="btn-secondary" disabled={pending}>
                Cancelar
              </button>
              <button
                type="submit" disabled={pending || !clientId} className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Gift size={14} />
                {pending ? 'Concedendo…' : 'Conceder crédito'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    )
  },
)
