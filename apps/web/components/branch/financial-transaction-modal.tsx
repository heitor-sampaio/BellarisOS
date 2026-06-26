'use client'

import { useRef, useCallback, useActionState, useEffect, useState, useMemo, cloneElement, isValidElement } from 'react'
import { X, TrendingUp, TrendingDown, Tag, CalendarClock } from 'lucide-react'
import { createTransactionAdvanced } from '@/actions/financial'

interface Props {
  branchId?:  string
  slug?:      string
  /** Modo admin: lista de filiais para o seletor */
  branches?:  { id: string; name: string; slug: string }[]
  trigger?:   React.ReactNode
}

type TxType = 'INCOME' | 'EXPENSE'

const INCOME_CATEGORIES  = ['Atendimento', 'Venda de produto', 'Taxa de agendamento', 'Pacote de sessões', 'Outro']
const EXPENSE_CATEGORIES = ['Fornecedores', 'Aluguel', 'Salários', 'Equipamentos', 'Manutenção', 'Marketing', 'Material de escritório', 'Outro']

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'PIX',
  DEBIT_CARD:      'Cartão de débito',
  CREDIT_CARD:     'Cartão de crédito',
  INTERNAL_CREDIT: 'Crédito interno',
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

type DiscountType = 'percent' | 'fixed'

function parsePtBR(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0
}

export function FinancialTransactionModal({ branchId, slug, branches, trigger }: Props) {
  const isAdminMode = !!branches && branches.length > 0
  const [selectedBranchId,   setSelectedBranchId]   = useState(branchId ?? '')
  const [selectedBranchSlug, setSelectedBranchSlug] = useState(slug ?? '')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef   = useRef<HTMLFormElement>(null)

  const [type,           setType]           = useState<TxType>('INCOME')
  const [isPaid,         setIsPaid]         = useState(true)
  const [rawAmount,      setRawAmount]      = useState('')
  const [discountType,   setDiscountType]   = useState<DiscountType>('percent')
  const [discountVal,    setDiscountVal]    = useState('')
  const [scheduleMode,   setScheduleMode]   = useState<'single' | 'installments' | 'recurring'>('single')
  const [installCount,   setInstallCount]   = useState('2')
  const [recurringFreq,  setRecurringFreq]  = useState('monthly')
  const [recurringCount, setRecurringCount] = useState('6')
  const [firstDueDate,   setFirstDueDate]   = useState('')

  const [state, formAction, pending] = useActionState(createTransactionAdvanced, undefined)

  const grossAmount    = parsePtBR(rawAmount)
  const discountNumber = parsePtBR(discountVal)

  const { discountAmt, finalAmount } = useMemo(() => {
    if (discountNumber <= 0 || grossAmount <= 0) return { discountAmt: 0, finalAmount: grossAmount }
    const disc = discountType === 'percent'
      ? grossAmount * (discountNumber / 100)
      : discountNumber
    const discAmt = Math.min(disc, grossAmount)
    return { discountAmt: discAmt, finalAmount: Math.max(0, grossAmount - discAmt) }
  }, [grossAmount, discountNumber, discountType])

  const hasDiscount = discountAmt > 0

  const open = useCallback(() => {
    formRef.current?.reset()
    setType('INCOME')
    setIsPaid(true)
    setRawAmount('')
    setDiscountType('percent')
    setDiscountVal('')
    setScheduleMode('single')
    setInstallCount('2')
    setRecurringFreq('monthly')
    setRecurringCount('6')
    setFirstDueDate('')
    if (!isAdminMode) {
      setSelectedBranchId(branchId ?? '')
      setSelectedBranchSlug(slug ?? '')
    } else {
      setSelectedBranchId('')
      setSelectedBranchSlug('')
    }
    dialogRef.current?.showModal()
  }, [isAdminMode, branchId, slug])
  const close = useCallback(() => dialogRef.current?.close(), [])

  useEffect(() => {
    if (state?.success) close()
  }, [state?.success])

  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <>
      {trigger && isValidElement(trigger) && cloneElement(trigger as React.ReactElement<any>, {
        onClick: open,
      })}

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
              Novo lançamento
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Receita ou despesa manual
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
            <input type="hidden" name="_branchId" value={selectedBranchId} />
            <input type="hidden" name="_slug"     value={selectedBranchSlug} />

            {/* Seletor de filial — apenas no modo admin */}
            {isAdminMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Filial *</Label>
                <select
                  required
                  className="field"
                  value={selectedBranchId}
                  onChange={e => {
                    const branch = branches!.find(b => b.id === e.target.value)
                    setSelectedBranchId(branch?.id ?? '')
                    setSelectedBranchSlug(branch?.slug ?? '')
                  }}
                >
                  <option value="">Selecione a filial…</option>
                  {branches!.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            <input type="hidden" name="is_paid"   value={String(isPaid)} />

            {/* Tipo */}
            <div className="form-2col">
              {(['INCOME', 'EXPENSE'] as TxType[]).map(t => {
                const active = type === t
                const cfg = {
                  INCOME:  { label: 'Receita',  icon: <TrendingUp  size={15} />, color: '#16a34a', soft: '#f0fdf4', border: '#86efac' },
                  EXPENSE: { label: 'Despesa',   icon: <TrendingDown size={15} />, color: '#dc2626', soft: '#fef2f2', border: '#fca5a5' },
                }[t]
                return (
                  <button key={t} type="button" onClick={() => setType(t)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13.5,
                    transition: 'all 120ms',
                    border: active ? `1.5px solid ${cfg.color}` : '1px solid var(--border)',
                    background: active ? cfg.soft : 'var(--surface)',
                    color: active ? cfg.color : 'var(--text-muted)',
                  }}>
                    {cfg.icon}
                    {cfg.label}
                  </button>
                )
              })}
            </div>

            <input type="hidden" name="type" value={type} />

            {/* Descrição */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Descrição *</Label>
              <input name="description" type="text" required className="field"
                placeholder={type === 'INCOME' ? 'Ex: Venda de produto — cliente Maria' : 'Ex: Pagamento de aluguel — maio'} />
            </div>

            {/* Categoria + Valor bruto */}
            <div className="form-2col">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Categoria *</Label>
                <select name="category" required className="field" key={type}>
                  <option value="">Selecione…</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Valor bruto (R$) *</Label>
                <input
                  type="number" step="0.01" min="0.01" required className="field"
                  placeholder="0,00"
                  value={rawAmount}
                  onChange={e => setRawAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Desconto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={12} style={{ color: 'var(--text-muted)' }} />
                <Label>Desconto</Label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Toggle % / R$ */}
                <div style={{
                  display: 'flex', borderRadius: 9, overflow: 'hidden',
                  border: '1px solid var(--border)', flexShrink: 0,
                }}>
                  {(['percent', 'fixed'] as DiscountType[]).map(dt => (
                    <button
                      key={dt} type="button"
                      onClick={() => setDiscountType(dt)}
                      style={{
                        padding: '8px 12px', fontSize: 12.5, fontWeight: 800,
                        cursor: 'pointer', border: 'none', transition: 'all 80ms',
                        background: discountType === dt ? 'var(--brand)' : 'var(--surface)',
                        color:      discountType === dt ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {dt === 'percent' ? '%' : 'R$'}
                    </button>
                  ))}
                </div>
                {/* Valor do desconto */}
                <input
                  type="number" step="0.01" min="0" className="field"
                  placeholder={discountType === 'percent' ? 'Ex: 10' : 'Ex: 25,00'}
                  value={discountVal}
                  onChange={e => setDiscountVal(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            {/* Preview valor final */}
            {grossAmount > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: hasDiscount ? 'var(--brand-soft)' : 'var(--bg-app)',
                border: `1px solid ${hasDiscount ? 'var(--brand)30' : 'var(--hairline)'}`,
                borderRadius: 10, padding: '10px 14px',
                transition: 'all 200ms',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Valor final</span>
                  {hasDiscount && (
                    <span style={{
                      fontSize: 11.5, color: 'var(--text-faint)',
                      textDecoration: 'line-through',
                    }}>
                      {fmtBRL(grossAmount)}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em',
                  color: hasDiscount ? 'var(--brand)' : 'var(--text)',
                }}>
                  {fmtBRL(finalAmount)}
                  {hasDiscount && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', marginLeft: 6, opacity: 0.8 }}>
                      − {fmtBRL(discountAmt)}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Hidden amount com valor final calculado */}
            <input type="hidden" name="amount" value={finalAmount > 0 ? finalAmount.toFixed(2) : ''} />

            {/* Forma de pagamento (só para receita) */}
            {type === 'INCOME' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Forma de pagamento</Label>
                <select name="payment_method" className="field">
                  <option value="">Não informado</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Pago? + Vencimento */}
            <div className="form-2col">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Situação</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[true, false].map(v => (
                    <button key={String(v)} type="button" onClick={() => setIsPaid(v)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, transition: 'all 100ms',
                      border: isPaid === v ? (v ? '1.5px solid #16a34a' : '1.5px solid #d97706') : '1px solid var(--border)',
                      background: isPaid === v ? (v ? '#f0fdf4' : '#fffbeb') : 'var(--surface)',
                      color: isPaid === v ? (v ? '#16a34a' : '#d97706') : 'var(--text-muted)',
                    }}>
                      {v ? 'Pago' : 'Pendente'}
                    </button>
                  ))}
                </div>
              </div>
              {!isPaid && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Vencimento</Label>
                  <input name="due_date" type="date" className="field" />
                </div>
              )}
            </div>

            {/* Observações */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label>Observações</Label>
              <textarea name="notes" rows={2} className="field"
                placeholder="Detalhes adicionais…" style={{ resize: 'none' }} />
            </div>

            {/* Agendamento de pagamento — apenas para despesas */}
            {type === 'EXPENSE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarClock size={12} style={{ color: 'var(--text-muted)' }} />
                  <Label>Agendamento de pagamento</Label>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['single', 'installments', 'recurring'] as const).map(mode => {
                    const labels = { single: 'Único', installments: 'Parcelado', recurring: 'Recorrente' }
                    const active = scheduleMode === mode
                    return (
                      <button key={mode} type="button" onClick={() => setScheduleMode(mode)} style={{
                        flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, transition: 'all 100ms',
                        border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                        background: active ? 'var(--brand-soft)' : 'var(--surface)',
                        color: active ? 'var(--brand)' : 'var(--text-muted)',
                      }}>
                        {labels[mode]}
                      </button>
                    )
                  })}
                </div>

                {scheduleMode === 'installments' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 10, border: '1px solid var(--hairline)' }}>
                    <div className="form-2col">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <Label>Número de parcelas</Label>
                        <input
                          type="number" min={2} max={48} className="field"
                          value={installCount} onChange={e => setInstallCount(e.target.value)}
                          placeholder="Ex: 12"
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <Label>Vencimento da 1ª parcela</Label>
                        <input
                          type="date" className="field"
                          value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                    {finalAmount > 0 && parseInt(installCount, 10) >= 2 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                        {parseInt(installCount, 10)}x de {fmtBRL(finalAmount / parseInt(installCount, 10))} · Total {fmtBRL(finalAmount)}
                      </p>
                    )}
                  </div>
                )}

                {scheduleMode === 'recurring' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'var(--bg-app)', borderRadius: 10, border: '1px solid var(--hairline)' }}>
                    <div className="form-2col">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <Label>Frequência</Label>
                        <select className="field" value={recurringFreq} onChange={e => setRecurringFreq(e.target.value)}>
                          <option value="weekly">Semanal</option>
                          <option value="biweekly">Quinzenal</option>
                          <option value="monthly">Mensal</option>
                          <option value="bimonthly">Bimestral</option>
                          <option value="quarterly">Trimestral</option>
                          <option value="yearly">Anual</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <Label>Repetições</Label>
                        <input
                          type="number" min={2} max={60} className="field"
                          value={recurringCount} onChange={e => setRecurringCount(e.target.value)}
                          placeholder="Ex: 12"
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <Label>Primeiro vencimento</Label>
                      <input
                        type="date" className="field"
                        value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)}
                      />
                    </div>
                    {finalAmount > 0 && parseInt(recurringCount, 10) >= 2 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                        {parseInt(recurringCount, 10)} lançamentos de {fmtBRL(finalAmount)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <input type="hidden" name="schedule_mode"     value={type === 'EXPENSE' ? scheduleMode : 'single'} />
            <input type="hidden" name="installment_count" value={installCount} />
            <input type="hidden" name="recurring_freq"    value={recurringFreq} />
            <input type="hidden" name="recurring_count"   value={recurringCount} />
            <input type="hidden" name="first_due_date"    value={firstDueDate} />

            {state?.error && (
              <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
                {state.error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={close} className="btn-secondary" disabled={pending}>
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="btn-primary">
                {pending ? 'Salvando…' : 'Lançar'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  )
}
