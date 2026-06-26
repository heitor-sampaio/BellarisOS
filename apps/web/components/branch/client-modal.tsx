'use client'

import { useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X } from 'lucide-react'
import { ClientForm } from './client-form'

interface ClientModalProps {
  branchId: string
  slug: string
  trigger?: React.ReactNode
}

export function ClientModal({ branchId, slug, trigger }: ClientModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router    = useRouter()

  const open  = useCallback(() => dialogRef.current?.showModal(), [])
  const close = useCallback(() => dialogRef.current?.close(), [])

  function handleSuccess(clientId?: string) {
    close()
    if (clientId) {
      router.push(`/${slug}/clients/${clientId}`)
    } else {
      router.refresh()
    }
  }

  return (
    <>
      {/* Trigger */}
      <span onClick={open} style={{ cursor: 'pointer' }}>
        {trigger ?? (
          <button type="button" className="btn-primary">
            <UserPlus size={15} />
            Novo cliente
          </button>
        )}
      </span>

      {/* Dialog */}
      <dialog
        ref={dialogRef}
        className="modal"
        onClick={e => { if (e.target === dialogRef.current) close() }}
      >
        {/* Cabeçalho */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--hairline)',
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Novo cliente
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Preencha os dados para cadastrar na filial
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            style={{
              width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--bg-app)', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        {/* Corpo — o form */}
        <div style={{ padding: '24px 24px 28px' }}>
          <ClientForm
            branchId={branchId}
            slug={slug}
            onSuccess={handleSuccess}
            showCancelButton
            onCancel={close}
          />
        </div>
      </dialog>
    </>
  )
}
