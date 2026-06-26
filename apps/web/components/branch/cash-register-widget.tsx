'use client'

import { useRef, useCallback, useActionState, useEffect } from 'react'
import { X, Unlock, Lock, CheckCircle2 } from 'lucide-react'
import { openCashRegister, closeCashRegister } from '@/actions/financial'

interface CashRegister {
  id:              string
  opening_balance: number
  opening_amount?: number  // total income so far
  opened_at:       string
  notes:           string | null
}

interface Props {
  branchId: string
  slug:     string
  register: CashRegister | null
  totalIncome:  number
  totalExpense: number
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

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function CashRegisterWidget({ branchId, slug, register, totalIncome, totalExpense }: Props) {
  const openDialogRef  = useRef<HTMLDialogElement>(null)
  const closeDialogRef = useRef<HTMLDialogElement>(null)

  const [openState,  openAction,  openPending]  = useActionState(openCashRegister,  undefined)
  const [closeState, closeAction, closePending] = useActionState(closeCashRegister, undefined)

  useEffect(() => {
    if (openState?.success)  openDialogRef.current?.close()
  }, [openState?.success])

  useEffect(() => {
    if (closeState?.success) closeDialogRef.current?.close()
  }, [closeState?.success])

  const saldo   = (register?.opening_balance ?? 0) + totalIncome - totalExpense
  const isOpen  = !!register

  return (
    <>
      {/* Widget inline */}
      <div className="card" style={{
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
        borderLeft: `4px solid ${isOpen ? '#16a34a' : 'var(--border)'}`,
      }}>
        {/* Status dot + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: isOpen ? '#16a34a' : 'var(--text-faint)',
            boxShadow: isOpen ? '0 0 0 3px #dcfce7' : 'none',
          }} />
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
              {isOpen ? 'Caixa aberto' : 'Caixa fechado'}
            </p>
            {isOpen && (
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                Desde {fmtTime(register.opened_at)} · troco inicial {fmtBRL(register.opening_balance)}
              </p>
            )}
          </div>
        </div>

        {/* Saldo (só quando aberto) */}
        {isOpen && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              SALDO ATUAL
            </p>
            <p style={{
              fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em',
              color: saldo >= 0 ? 'var(--text)' : '#dc2626',
            }}>
              {fmtBRL(saldo)}
            </p>
          </div>
        )}

        {/* Botão ação */}
        {isOpen ? (
          <button
            type="button"
            onClick={() => closeDialogRef.current?.showModal()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Lock size={14} />
            Fechar caixa
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openDialogRef.current?.showModal()}
            className="btn-primary"
            style={{ flexShrink: 0 }}
          >
            <Unlock size={14} />
            Abrir caixa
          </button>
        )}
      </div>

      {/* Modal: Abrir caixa */}
      <dialog
        ref={openDialogRef} className="modal"
        style={{ maxWidth: 400 } as React.CSSProperties}
        onClick={e => { if (e.target === openDialogRef.current) openDialogRef.current.close() }}
      >
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
          padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
            Abrir caixa
          </h2>
          <button type="button" onClick={() => openDialogRef.current?.close()} style={{
            width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--bg-app)',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '24px 24px 28px' }}>
          <form action={openAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="_branchId" value={branchId} />
            <input type="hidden" name="_slug"     value={slug} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Troco inicial (R$)</Label>
              <input name="opening_balance" type="number" step="0.01" min="0"
                defaultValue={0} className="field"
                placeholder="0,00" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Observações</Label>
              <textarea name="notes" rows={2} className="field"
                placeholder="Opcional…" style={{ resize: 'none' }} />
            </div>

            {openState?.error && (
              <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                {openState.error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => openDialogRef.current?.close()} className="btn-secondary" disabled={openPending}>
                Cancelar
              </button>
              <button type="submit" disabled={openPending} className="btn-primary">
                <Unlock size={14} />
                {openPending ? 'Abrindo…' : 'Abrir caixa'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      {/* Modal: Fechar caixa */}
      <dialog
        ref={closeDialogRef} className="modal"
        style={{ maxWidth: 440 } as React.CSSProperties}
        onClick={e => { if (e.target === closeDialogRef.current) closeDialogRef.current.close() }}
      >
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
          padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
            Fechar caixa
          </h2>
          <button type="button" onClick={() => closeDialogRef.current?.close()} style={{
            width: 32, height: 32, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--bg-app)',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '24px 24px 28px' }}>
          {/* Resumo */}
          <div style={{
            background: 'var(--bg-app)', borderRadius: 12, padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20,
          }}>
            {[
              ['Troco inicial',  fmtBRL(register?.opening_balance ?? 0), false],
              ['Entradas',       fmtBRL(totalIncome),   false],
              ['Saídas',        `- ${fmtBRL(totalExpense)}`, false],
              ['Saldo final',   fmtBRL(saldo), true],
            ].map(([label, value, bold]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: bold ? 800 : 600, color: bold ? 'var(--text)' : 'var(--text-muted)' }}>
                  {label}
                </span>
                <span style={{ fontSize: bold ? 16 : 13, fontWeight: 800, color: bold ? 'var(--brand)' : 'var(--text)', letterSpacing: '-0.01em' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          <form action={closeAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="_registerId" value={register?.id ?? ''} />
            <input type="hidden" name="_slug"       value={slug} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Valor em caixa (contagem física)</Label>
              <input name="closing_balance" type="number" step="0.01" min="0"
                defaultValue={saldo > 0 ? saldo : 0} className="field"
                placeholder={fmtBRL(saldo)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Observações</Label>
              <textarea name="notes" rows={2} className="field"
                placeholder="Divergências, ocorrências…" style={{ resize: 'none' }} />
            </div>

            {closeState?.error && (
              <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                {closeState.error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => closeDialogRef.current?.close()} className="btn-secondary" disabled={closePending}>
                Cancelar
              </button>
              <button type="submit" disabled={closePending} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 10,
                border: '1px solid #dc2626', background: '#fef2f2',
                color: '#dc2626', cursor: 'pointer',
              }}>
                <Lock size={14} />
                {closePending ? 'Fechando…' : 'Confirmar fechamento'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  )
}
