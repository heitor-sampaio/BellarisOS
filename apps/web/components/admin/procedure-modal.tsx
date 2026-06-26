'use client'

import { useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, X } from 'lucide-react'
import { ProcedureForm } from './procedure-form'

interface Branch  { id: string; name: string }
interface Product { id: string; name: string; unit: string; branch_name: string; cost_price?: number | null }

interface ExistingProcedure {
  id: string
  name: string
  category: string
  description?: string | null
  duration_min: number
  price: string | number
  labor_cost?: string | number
  visible_on_client_app: boolean
  is_active: boolean
  branch_ids: string[]
  procedure_products: { product_id: string; quantity: number }[]
  branch_pricing?: { branch_id: string; price: number | null; labor_cost: number | null }[]
}

interface ProcedureModalProps {
  branches: Branch[]
  products: Product[]
  existing?: ExistingProcedure
  trigger?: React.ReactNode
}

export function ProcedureModal({ branches, products, existing, trigger }: ProcedureModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router    = useRouter()

  const open  = useCallback(() => dialogRef.current?.showModal(), [])
  const close = useCallback(() => dialogRef.current?.close(), [])

  function handleSuccess() {
    close()
    router.refresh()
  }

  const isEdit = !!existing

  return (
    <>
      <span onClick={open} style={{ cursor: 'pointer' }}>
        {trigger ?? (
          <button type="button" className="btn-primary">
            <Sparkles size={15} />
            Novo procedimento
          </button>
        )}
      </span>

      <dialog
        ref={dialogRef}
        className="modal modal-flex"
        style={{ maxWidth: 640 }}
        onClick={e => { if (e.target === dialogRef.current) close() }}
      >
        {/* Wrapper visual: arredondamento + overflow na mesma camada → scrollbar clipada corretamente */}
        <div className="modal-container">
          {/* Cabeçalho fixo */}
          <div style={{
            flexShrink: 0,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--hairline)',
            padding: '18px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
                {isEdit ? 'Editar procedimento' : 'Novo procedimento'}
              </h2>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {isEdit ? existing!.name : 'Catálogo da rede · disponível em todas as filiais selecionadas'}
              </p>
            </div>
            <button
              type="button" onClick={close}
              style={{
                width: 32, height: 32, borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg-app)',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
              aria-label="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          {/* Corpo rolável */}
          <div className="modal-body" style={{ padding: '24px 24px 28px' }}>
            <ProcedureForm
              branches={branches}
              products={products}
              existing={existing}
              onSuccess={handleSuccess}
              onCancel={close}
            />
          </div>
        </div>
      </dialog>
    </>
  )
}
