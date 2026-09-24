'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  Search, X, TrendingUp, TrendingDown, CheckCircle2,
  Clock, RotateCcw, ChevronUp, ChevronDown,
} from 'lucide-react'
import { markTransactionPaid, reverseTransaction } from '@/actions/financial'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SegSelect } from '@/components/shared/seg-select'

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
  canPay:       boolean
}

const PM_LABELS: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'PIX',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}

const PM_COLORS: Record<string, { bg: string; color: string }> = {
  CASH:            { bg: 'var(--success-bg)', color: 'var(--success)' },
  PIX:             { bg: 'var(--info-soft)', color: 'var(--info)' },
  DEBIT_CARD:      { bg: 'var(--surface)', color: 'var(--cat-4)' },
  CREDIT_CARD:     { bg: 'var(--cat-5-soft)', color: 'var(--cat-5)' },
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

export function FinancialTable({ transactions, branchId, slug, canReverse, canPay }: Props) {
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'pending'>('all')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')

  const router        = useRouter()
  const [_p, startTx] = useTransition()

  // As actions devolvem `{ error }` quando não conseguem — descartar isso
  // fazia a tela recarregar e mostrar a linha igual, que é o mesmo que a
  // pessoa veria se a operação simplesmente não tivesse efeito ainda.
  function handleMarkPaid(id: string) {
    startTx(async () => {
      const r = await markTransactionPaid(id, slug)
      if (r?.error) toast.error(r.error)
      else router.refresh()
    })
  }

  function handleReverse(id: string) {
    startTx(async () => {
      const r = await reverseTransaction(id, slug)
      if (r?.error) { toast.error(r.error); return }
      toast.success('Lançamento estornado.')
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
    fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
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
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--text-base-sz)', color: 'var(--text)', width: '100%' }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Tipo — três opções fixas e curtas: é segmento, e o segmento do
            sistema é o SegSelect. Estava reimplementado à mão aqui, com outro
            raio, outra altura e uma sombra que superfície neutra não usa. */}
        <SegSelect
          compacto
          ariaLabel="Tipo de lançamento"
          value={filterType}
          onSelect={v => setFilterType(v as FilterType)}
          options={[
            { key: 'all',     label: 'Todos' },
            { key: 'INCOME',  label: 'Receitas' },
            { key: 'EXPENSE', label: 'Despesas' },
          ]}
        />

        {/* Status */}
        <select value={filterPaid} onChange={e => setFilterPaid(e.target.value as any)} className="filtro-select">
          <option value="all">Todos os status</option>
          <option value="paid">Pago</option>
          <option value="pending">Pendente</option>
        </select>

        {/* Ordenar */}
        <button
          type="button" className="filtro-toggle"
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
        >
          {sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          {sortDir === 'desc' ? 'Mais recente' : 'Mais antigo'}
        </button>

        {/* Resultado filtrado */}
        <span style={{
          marginLeft: 'auto', fontSize: 'var(--text-sm-sz)', fontWeight: 800,
          color: totalFiltered >= 0 ? 'var(--success)' : 'var(--danger)',
        }}>
          {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''} · {fmtBRL(Math.abs(totalFiltered))}
        </span>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 24px' }}>
            <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 'var(--text-base-sz)' }}>Nenhum lançamento encontrado</p>
            <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
              Ajuste os filtros ou lance uma nova transação.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                      <td data-label="Data" data-par style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {fmtDatetime(tx.created_at)}
                        </p>
                      </td>

                      {/* Descrição */}
                      <td data-label="" style={{ padding: '13px 16px', maxWidth: 260 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isIncome ? 'var(--success-bg)' : 'var(--danger-soft)',
                          }}>
                            {isIncome
                              ? <TrendingUp   size={13} style={{ color: 'var(--success)' }} />
                              : <TrendingDown size={13} style={{ color: 'var(--danger)' }} />}
                          </div>
                          <div>
                            <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: isReversed ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.3 }}>
                              {tx.description}
                            </p>
                            {tx.appointment_id && (
                              <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)', marginTop: 1 }}>Atendimento</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td data-label="Categoria" style={{ padding: '13px 16px' }}>
                        <span style={{
                          fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          background: tx.category === 'Estorno' ? 'var(--danger-soft)' : 'var(--bg-app)',
                          color: tx.category === 'Estorno' ? 'var(--danger)' : 'var(--text-muted)',
                          border: `1px solid ${tx.category === 'Estorno' ? 'var(--danger-border)' : 'var(--border)'}`,
                        }}>
                          {tx.category}
                        </span>
                      </td>

                      {/* Pagamento */}
                      <td data-label="Pagamento" data-par style={{ padding: '13px 16px' }}>
                        {tx.payment_method && pmStyle ? (
                          <span style={{
                            fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: pmStyle.bg, color: pmStyle.color,
                            border: `1px solid ${pmStyle.color}30`,
                          }}>
                            {PM_LABELS[tx.payment_method]}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)' }}>—</span>
                        )}
                      </td>

                      {/* Valor */}
                      <td data-label="Valor" data-par style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: 'var(--text-base-sz)', fontWeight: 800, letterSpacing: '-0.01em',
                          color: isIncome ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {isIncome ? '+' : '- '}{fmtBRL(tx.amount)}
                        </span>
                      </td>

                      {/* Status */}
                      <td data-label="Status" data-par style={{ padding: '13px 16px' }}>
                        {isReversed ? (
                          <span style={{
                            fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: 'var(--bg-app)', color: 'var(--text-faint)',
                            border: '1px solid var(--border)',
                          }}>
                            Estornada
                          </span>
                        ) : tx.is_paid ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)',
                          }}>
                            <CheckCircle2 size={10} /> Pago
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                            background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning-border)',
                          }}>
                            <Clock size={10} /> Pendente
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td data-label="" style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {!tx.is_paid && !isReversed && canPay && (
                            <button type="button" onClick={() => handleMarkPaid(tx.id)} title="Marcar como pago" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                              border: '1.5px solid var(--success)', background: 'var(--success-bg)',
                              color: 'var(--success)', cursor: 'pointer',
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
