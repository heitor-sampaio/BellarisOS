'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ProcedureForm } from './procedure-form'

interface ProcedureDrawerProps {
  branchId:       string
  slug:           string
  userId:         string
  isNetworkAdmin: boolean
}

export function ProcedureDrawer({ branchId, slug, userId, isNetworkAdmin }: ProcedureDrawerProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Novo procedimento
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(34,22,25,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
                Novo procedimento
              </h2>
              <button onClick={() => setOpen(false)} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={16} /></button>
            </div>
            <ProcedureForm
              branchId={branchId}
              slug={slug}
              userId={userId}
              isNetworkAdmin={isNetworkAdmin}
              onSuccess={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
