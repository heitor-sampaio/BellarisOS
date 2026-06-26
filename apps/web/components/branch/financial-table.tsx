'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  Search, X, TrendingUp, TrendingDown, CheckCircle2,
  Clock, RotateCcw, ChevronUp, ChevronDown,
} from 'lucide-react'
import { markTransactionPaid, reverseTransaction } from '@/actions/financial'
import { useRouter } from 'next/navigation'

export interface Transaction {
  id:             string
  type:           'INCOME' | 'EXPENSE'
  category:       string
  description:    string
  amount:         number
  payment_method: string | null
  is_paid:        boolean
  paid_at:        string | null
  due_date:       string | null
  notes:          string | null
  created_at:     string
  appointment_id: string | null
}

interface Props {
  transactions: Transaction[]
  branchId:     string
  slug:         string
  canReverse:   boolean
}

const PM_LABELS: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'PIX',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}

const PM_COLORS: Record<string, { bg: string; color: string }> = {
  CASH:            { bg: '#f0fdf4', color: '#16a34a' },
  PIX:             { bg: '#eff6ff', color: '#2563eb' },
  DEBIT_CARD:      { bg: '#faf5ff', color: '#7c3aed' },
  CREDIT_CARD:     { bg: '#fff7ed', color: '#c2410c' },
  INTERNAL_CREDIT: { bg: 'var(--brand-soft)', color: 'var(--brand)' },
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

type FilterType = 'all' | 'INCOME' | 'EXPENSE'
type SortDir    = 'asc' | 'desc'

export function FinancialTable({ transactions, branchId, slug, canReverse }: Props) {
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'pending'>('all')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')

  const router        = useRouter()
  const [_p, startTx] = useTransition()

  function handleMarkPaid(id: string) {
    startTx(async () => {
      await markTransactionPaid(id, slug)
      router.refresh()
    })
  }

  function handleReverse(id: string) {
    startTx(async () => {
      await reverseTransaction(id, branchId, slug)
      router.refresh()
    })
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return [...transactions]
      .filter(tx => {
        if (filterType !== 'all' && tx.type !== filterType) return false
        if (filterPaid === 'paid'    && !tx.is_paid) return false
        if (filterPaid === 'pending' &&  tx.is_paid) return false
        if (q && !tx.description.toLowerCase().includes(q) && !tx.category.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        return sortDir === 'desc' ? -diff : diff
      })
  }, [transactions, filterType, filterPaid, search, sortDir])

  const totalFiltered = filtered.reduce((acc, tx) => {
    if (!tx.is_paid) return acc
    return tx.type === 'INCOME' ? acc + tx.amount : acc - tx.amount
  }, 0)

  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
    background: 'var(--bg-app)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Busca */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--surface)', padding: '7px 12px', flex: 1, minWidth: 200,
        }}>
          <Search size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar descrição ou categoria…"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', width: '100%' }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Tipo */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-app)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
          {([['all', 'Todos'], ['INCOME', 'Receitas'], ['EXPENSE', 'Despesas']] as [FilterType, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFilterType(v)} style={{
              fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 7,
              cursor: 'pointer', border: 'none', transition: 'all 100ms',
              background: filterType === v ? 'var(--surface)' : 'transparent',
              color: filterType === v ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: filterType === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
              {l}
            </button>
          ))}
        </div>

        {/* Status */}
        <select value={filterPaid} onChange={e => setFilterPaid(e.target.value as any)} style={{
          fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '7px 10px', cursor: 'pointer', outline: 'none',
        }}>
          <option value="all">Todos os status</option>
          <option value="paid">Pago</option>
          <option value="pending">Pendente</option>
        </select>

        {/* Ordenar */}
        <button type="button" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          {sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          {sortDir === 'desc' ? 'Mais recente' : 'Mais antigo'}
        </button>

        {/* Resultado filtrado */}
        <span style={{
          marginLeft: 'auto', fontSize: 12.5, fontWeight: 800,
          color: totalFiltered >= 0 ? '#16a34a' : '#dc2626',
        }}>
          {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''} · {fmtBRL(Math.abs(totalFiltered))}
        </span>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 24px' }}>
            <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 14 }}>Nenhum lançamento encontrado</p>
            <p style={{ color: 'var(--text-faint)', fontSize: 12.5, marginTop: 4 }}>
              Ajuste os filtros ou lance uma nova transação.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>DATA</th>
                  <th style={thStyle}>DESCRIÇÃO</th>
                  <th style={thStyle}>CATEGORIA</th>
                  <th style={thStyle}>PAGAMENTO</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>VALOR</th>
                  <th style={thStyle}>STATUS</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx, i) => {
                  const isIncome  = tx.type === 'INCOME'
                  const pmStyle   = tx.payment_method ? (PM_COLORS[tx.payment_method] ?? { bg: 'var(--bg-app)', color: 'var(--text-muted)' }) : null
                  const isReversed = tx.notes === 'Estornada'

                  return (
                    <tr key={tx.id} style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none',
                      background: isReversed ? 'var(--bg-app)' : i % 2 === 0 ? 'var(--surface)' : 'transparent',
                      opacity: isReversed ? 0.5 : 1,
                    }}>
                      {/* Data */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>
                          {fmtDatetime(tx.created_at)}
                        </p>
                      </td>

                      {/* Descrição */}
                      <td style={{ padding: '13px 16px', maxWidth: 260 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isIncome ? '#f0fdf4' : '#fef2f2',
                          }}>
                            {isIncome
                              ? <TrendingUp   size={13} style={{ color: '#16a34a' }} />
                              : <TrendingDown size={13} style={{ color: '#dc2626' }} />}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: isReversed ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.3 }}>
                              {tx.description}
                            </p>
                            {tx.appointment_id && (
                              <p style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 1 }}>Atendimento</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{
                          fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          background: tx.category === 'Estorno' ? '#fef2f2' : 'var(--bg-app)',
                          color: tx.category === 'Estorno' ? '#dc2626' : 'var(--text-muted)',
                          border: `1px solid ${tx.category === 'Estorno' ? '#fca5a5' : 'var(--border)'}`,
                        }}>
                          {tx.category}
                        </span>
                      </td>

                      {/* Pagamento */}
                      <td style={{ padding: '13px 16px' }}>
                        {tx.payment_method && pmStyle ? (
                          <span style={{
                            fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: pmStyle.bg, color: pmStyle.color,
                            border: `1px solid ${pmStyle.color}30`,
                          }}>
                            {PM_LABELS[tx.payment_method]}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Valor */}
                      <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em',
                          color: isIncome ? '#16a34a' : '#dc2626',
                        }}>
                          {isIncome ? '+' : '- '}{fmtBRL(tx.amount)}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '13px 16px' }}>
                        {isReversed ? (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: 'var(--bg-app)', color: 'var(--text-faint)',
                            border: '1px solid var(--border)',
                          }}>
                            Estornada
                          </span>
                        ) : tx.is_paid ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac',
                          }}>
                            <CheckCircle2 size={10} /> Pago
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d',
                          }}>
                            <Clock size={10} /> Pendente
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {!tx.is_paid && !isReversed && (
                            <button type="button" onClick={() => handleMarkPaid(tx.id)} title="Marcar como pago" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                              border: '1.5px solid #16a34a', background: '#f0fdf4',
                              color: '#16a34a', cursor: 'pointer',
                            }}>
                              <CheckCircle2 size={12} />
                              Pagar
                            </button>
                          )}
                          {tx.is_paid && !isReversed && canReverse && (
                            <button type="button" onClick={() => handleReverse(tx.id)} title="Estornar" style={{
                              width: 30, height: 30, borderRadius: 7,
                              border: '1px solid var(--border)', background: 'var(--surface)',
                              color: 'var(--text-faint)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <RotateCcw size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
