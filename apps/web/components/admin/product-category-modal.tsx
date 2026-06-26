'use client'

import { useRef, useCallback, useEffect, useActionState, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tags, X, Trash2, Plus, Loader2 } from 'lucide-react'
import { createCategory, deleteCategory } from '@/actions/stock'

interface Category { id: string; name: string }

interface Props {
  categories: Category[]
}

export function ProductCategoryModal({ categories }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef   = useRef<HTMLFormElement>(null)
  const router    = useRouter()

  const [state, formAction, pending] = useActionState(createCategory, undefined)
  const [deletingId, setDeletingId]  = useState<string | null>(null)
  const [, startDelete] = useTransition()

  const open  = useCallback(() => dialogRef.current?.showModal(), [])
  const close = useCallback(() => dialogRef.current?.close(), [])

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      router.refresh()
    }
  }, [state?.success, router])

  function handleDelete(id: string) {
    setDeletingId(id)
    startDelete(async () => {
      await deleteCategory(id)
      setDeletingId(null)
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={open} className="btn-secondary" style={{ gap: 6 }}>
        <Tags size={14} />
        Categorias
        {categories.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 18, borderRadius: 99,
            background: 'var(--brand-soft)', color: 'var(--brand)',
            fontSize: 10.5, fontWeight: 700, padding: '0 4px',
          }}>
            {categories.length}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        className="modal"
        style={{ maxWidth: 420 }}
        onClick={e => { if (e.target === dialogRef.current) close() }}
      >
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
              Categorias de produto
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Organizam o catálogo e geram o prefixo do SKU
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

        {/* Body */}
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Lista de categorias existentes */}
          {categories.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              Nenhuma categoria cadastrada ainda.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map(cat => (
                <div key={cat.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                }}>
                  <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text)' }}>
                    {cat.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat.id)}
                    disabled={deletingId === cat.id}
                    style={{
                      padding: '4px 6px', borderRadius: 8, border: 'none',
                      background: 'transparent', cursor: deletingId === cat.id ? 'default' : 'pointer',
                      color: 'var(--text-faint)', display: 'flex', alignItems: 'center',
                      opacity: deletingId === cat.id ? 0.4 : 1,
                    }}
                    title="Excluir categoria"
                  >
                    {deletingId === cat.id
                      ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Divisor */}
          <div style={{ borderTop: '1px solid var(--hairline)' }} />

          {/* Form nova categoria */}
          <form ref={formRef} action={formAction}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                NOVA CATEGORIA
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  name="name"
                  className="field"
                  placeholder="Ex: Cosméticos, Descartáveis…"
                  autoComplete="off"
                  required
                />
                <button type="submit" disabled={pending} className="btn-primary" style={{ flexShrink: 0, gap: 5 }}>
                  {pending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                  Adicionar
                </button>
              </div>
              {state?.error && (
                <p style={{ fontSize: 11.5, color: 'var(--brand)', margin: 0 }}>{state.error}</p>
              )}
            </div>
          </form>
        </div>
      </dialog>
    </>
  )
}
