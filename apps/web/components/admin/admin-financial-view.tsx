'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Wallet, Users,
  ArrowUpRight, ArrowDownRight,
  ChevronRight, CreditCard, Plus, CheckCircle2, Clock, RotateCcw, Gift,
} from 'lucide-react'
import { FinancialTransactionModal } from '@/components/branch/financial-transaction-modal'
import { ClientCreditModal, type ClientCreditModalHandle } from '@/components/branch/client-credit-modal'
import { markTransactionPaid, reverseTransaction } from '@/actions/financial'
import { SegSelect } from '@/components/shared/seg-select'

// --- Types -------------------------------------------------------------------

interface BranchStat {
  id:          string
  name:        string
  slug:        string
  revenue:     number
  expenses:    number
  result:      number
  commissions: number
  txCount:     number
}

interface AdminTx {
  id:             string
  type:           string
  category:       string | null
  description:    string
  amount:         number
  payment_method: string | null
  is_paid:        boolean
  paid_at:        string | null
  due_date:       string | null
  created_at:     string
  branch_id:      string
  branchName:     string
  /** `'Estornada'` marca a ponta estornada — o estorno sai dos dois lados. */
  notes:          string | null
}

interface Props {
  period:           string
  periodLabel:      string
  customFrom?:      string
  customTo?:        string
  totalRevenue:     number
  totalExpenses:    number
  totalResult:      number
  totalCommissions: number
  prevRevenue:      number
  prevExpenses:     number
  branchStats:      BranchStat[]
  transactions:     AdminTx[]
  branchSlugMap:    Record<string, string>
  branches:         { id: string; name: string; slug: string }[]
  /**
   * Unidade já recortada ao abrir (`?unidade=` na URL).
   *
   * É o destino do "ver o financeiro desta unidade" — no dashboard da rede e na
   * própria tabela por filial, que antes saíam para o portal da unidade.
   */
  unidadeInicial?:  string
  canWrite?:        boolean
  /** Recebe (caixa ou financeiro): marca pendência como paga e dá crédito. */
  canPay?:          boolean
  /** Estorna: só `financial: Gerenciar` — estorno mexe em lançamento fechado. */
  canReverse?:      boolean
  /** Concede crédito interno — exige financial: Gerenciar, como a action. */
  podeDarCredito?:  boolean
  /** Clientes da rede, para o crédito interno. */
  clients?:         { id: string; name: string }[]
}

// --- Helpers -----------------------------------------------------------------

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtShort = (v: number): string => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`
  return fmtBRL(v)
}

const PERIOD_OPTIONS = [
  { value: 'today',      label: 'Hoje' },
  { value: 'week',       label: 'Esta semana' },
  { value: 'month',      label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'quarter',    label: 'Últimos 90 dias' },
  { value: 'custom',     label: 'Personalizado' },
]

const PM_LABELS: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'PIX',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}

function pctDelta(curr: number, prev: number) {
  // Sem base de comparação não existe variação: antes o primeiro mês de uso
  // exibia "▲ 100%" de crescimento inventado a partir do zero.
  if (prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  return { pct: Math.abs(pct), up: pct >= 0 }
}

// --- KPI Card ----------------------------------------------------------------

function KpiCard({
  label, value, delta, icon, brand = false,
}: {
  label:  string
  value:  string
  delta?: { pct: number; up: boolean } | null
  icon:   React.ReactNode
  brand?: boolean
}) {
  return (
    <div className="card" style={{
      padding: '20px 22px',
      background: brand ? 'var(--brand)' : 'var(--surface)',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: brand ? '0 4px 16px -4px rgba(195,77,107,.35)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: brand ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)',
        }}>{label}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: brand ? 'rgba(255,255,255,0.18)' : 'var(--brand-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
      </div>
      <span style={{
        fontSize: 'clamp(20px, 5.4vw, 26px)', fontWeight: 800, letterSpacing: '-0.025em',
        color: brand ? '#fff' : 'var(--text)',
      }}>{value}</span>
      {delta !== null && delta !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {delta.up
            ? <ArrowUpRight size={13} color={brand ? 'rgba(255,255,255,0.8)' : '#16a34a'} />
            : <ArrowDownRight size={13} color={brand ? 'rgba(255,255,255,0.6)' : '#dc2626'} />
          }
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: brand ? 'rgba(255,255,255,0.8)' : delta.up ? '#16a34a' : '#dc2626',
          }}>
            {delta.pct.toFixed(1).replace('.', ',')}% vs. período anterior
          </span>
        </div>
      )}
    </div>
  )
}

// --- Main component -----------------------------------------------------------

export function AdminFinancialView({
  period, periodLabel, customFrom, customTo,
  totalRevenue, totalExpenses, totalResult, totalCommissions,
  prevRevenue, prevExpenses,
  branchStats, transactions, branchSlugMap, branches, unidadeInicial = '',
  canPay = false, canReverse = false, podeDarCredito = false, clients = [],
}: Props) {
  const router      = useRouter()
  const [, startT]  = useTransition()
  const creditModalRef = useRef<ClientCreditModalHandle>(null)

  // A unidade da ação vem da própria transação — não há o que perguntar.
  function marcarPago(id: string, slug: string) {
    startT(async () => { await markTransactionPaid(id, slug); router.refresh() })
  }
  function estornar(id: string, branchId: string, slug: string) {
    startT(async () => { await reverseTransaction(id, branchId, slug); router.refresh() })
  }
  const [filterBranch, setFilterBranch] = useState<string>(unidadeInicial || 'all')
  const [customF, setCustomF] = useState(customFrom ?? '')
  const [customT, setCustomT] = useState(customTo   ?? '')

  function navigate(p: string, f?: string, t?: string, unidade: string = filterBranch) {
    startT(() => {
      const q = new URLSearchParams({ period: p })
      if (p === 'custom' && f) q.set('from', f)
      if (p === 'custom' && t) q.set('to',   t)
      if (unidade && unidade !== 'all') q.set('unidade', unidade)
      router.push(`/admin/financeiro?${q}`)
    })
  }

  /** Recorta a tela para uma unidade sem sair do portal da rede. */
  function verUnidade(id: string) {
    setFilterBranch(id)
    navigate(period, customF, customT, id)
  }

  const visibleTxs = filterBranch === 'all'
    ? transactions
    : transactions.filter(t => t.branch_id === filterBranch)

  // Com uma unidade recortada, os números do topo são os DELA — senão a tela
  // diria "receita total" mostrando a rede inteira enquanto a lista embaixo já
  // está filtrada, e os dois blocos se contradiriam.
  const statDaUnidade = filterBranch === 'all'
    ? null
    : branchStats.find(b => b.id === filterBranch) ?? null
  const revenue     = statDaUnidade ? statDaUnidade.revenue     : totalRevenue
  const expenses    = statDaUnidade ? statDaUnidade.expenses    : totalExpenses
  const result      = statDaUnidade ? statDaUnidade.result      : totalResult
  const commissions = statDaUnidade ? statDaUnidade.commissions : totalCommissions

  const iconColor    = (brand: boolean) => brand ? '#fff' : 'var(--brand)'
  // Sem base de comparação por unidade, não se inventa delta: `prevRevenue` e
  // `prevExpenses` são da rede.
  const deltaRevenue  = statDaUnidade ? null : pctDelta(totalRevenue,  prevRevenue)
  const deltaExpenses = statDaUnidade ? null : pctDelta(totalExpenses, prevExpenses)

  // Sort branchStats by revenue desc for the table
  const sortedStats = [...branchStats].sort((a, b) => b.revenue - a.revenue)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header: título (esquerda) + seletores e botão (direita) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Financeiro da Rede
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>
            {periodLabel} · {statDaUnidade
              ? statDaUnidade.name
              : `${branchStats.length} filial${branchStats.length !== 1 ? 'is' : ''}`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SegSelect
            options={PERIOD_OPTIONS.map(o => ({ key: o.value, label: o.label }))}
            value={period}
            onSelect={(k) => navigate(k)}
            ariaLabel="Selecionar período"
          />
          {period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <input type="date" value={customF} onChange={e => setCustomF(e.target.value)} className="field" style={{ width: 140, fontSize: 12, padding: '5px 10px' }} />
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>até</span>
              <input type="date" value={customT} onChange={e => setCustomT(e.target.value)} className="field" style={{ width: 140, fontSize: 12, padding: '5px 10px' }} />
              <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => navigate('custom', customF, customT)}>
                Aplicar
              </button>
            </div>
          )}
          {/* Crédito interno saía só pelo financeiro da unidade — quem opera a
              rede tinha de entrar no portal dela para devolver um valor. */}
          {podeDarCredito && clients.length > 0 && (
            <button
              type="button" className="btn-secondary"
              onClick={() => creditModalRef.current?.open()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}
            >
              <Gift size={14} />
              Crédito para cliente
            </button>
          )}
          <FinancialTransactionModal
            branches={branches}
            trigger={
              <button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                <Plus size={15} />
                Novo lançamento
              </button>
            }
          />
        </div>
      </div>

      {/* KPI Cards consolidados */}
      <div className="kpi-grid-auto" style={{ gap: 14 }}>
        <KpiCard
          label={statDaUnidade ? 'Receita da unidade' : 'Receita total'}
          value={fmtBRL(revenue)}
          delta={deltaRevenue}
          icon={<TrendingUp size={16} color={iconColor(true)} />}
          brand
        />
        <KpiCard
          label={statDaUnidade ? 'Despesas da unidade' : 'Despesas totais'}
          value={fmtBRL(expenses)}
          delta={deltaExpenses}
          icon={<TrendingDown size={16} color="var(--brand)" />}
        />
        <KpiCard
          label="Resultado líquido"
          value={fmtBRL(result)}
          icon={<Wallet size={16} color="var(--brand)" />}
        />
        <KpiCard
          label="Comissões"
          value={fmtBRL(commissions)}
          icon={<Users size={16} color="var(--brand)" />}
        />
      </div>


      {/* Por filial */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Por filial</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel}</span>
        </div>

        <div className="table-wrap">
        {/* Sete colunas nao cabem em 390px: no celular cada filial vira um
            bloco de rotulo e valor, em vez de a tabela rolar dentro do card. */}
        <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Filial', 'Receita', 'Despesas', 'Resultado', 'Comissões', 'Movim.', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: h === 'Filial' ? 'left' : 'right',
                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  width: h === '' ? 80 : undefined,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((b, i) => (
              <tr
                key={b.id}
                style={{
                  borderBottom: i < sortedStats.length - 1 ? '1px solid var(--hairline)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td data-label="" style={{ padding: '13px 16px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{b.name}</span>
                </td>
                <td data-label="Receita" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                  {fmtBRL(b.revenue)}
                </td>
                <td data-label="Despesas" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-muted)' }}>
                  {fmtBRL(b.expenses)}
                </td>
                <td data-label="Resultado" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: b.result >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmtBRL(b.result)}
                </td>
                <td data-label="Comissões" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-muted)' }}>
                  {fmtBRL(b.commissions)}
                </td>
                <td data-label="Movim." data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-faint)' }}>
                  {b.txCount}
                </td>
                <td data-label="" style={{ padding: '13px 16px', textAlign: 'right' }}>
                  {/* Recorta a própria tela, em vez de abrir o portal da
                      unidade: quem está na rede continua na rede. */}
                  <button
                    type="button"
                    onClick={() => verUnidade(b.id === filterBranch ? 'all' : b.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 700,
                      color: b.id === filterBranch ? 'var(--text-muted)' : 'var(--brand)',
                      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {b.id === filterBranch ? 'Ver a rede' : 'Ver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {/* Totais */}
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-app)' }}>
              <td style={{ padding: '13px 16px', fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total rede</td>
              <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#16a34a' }}>{fmtBRL(totalRevenue)}</td>
              <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>{fmtBRL(totalExpenses)}</td>
              <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: totalResult >= 0 ? '#16a34a' : '#dc2626' }}>{fmtBRL(totalResult)}</td>
              <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>{fmtBRL(totalCommissions)}</td>
              <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--text-faint)' }}>{transactions.length}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        </div>{/* end table-wrap */}
      </div>

      {/* Movimentações */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Movimentações
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
              {visibleTxs.length} registro{visibleTxs.length !== 1 ? 's' : ''}
            </span>
          </span>

          {/* Filtro por filial */}
          <select
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}
            className="field"
            style={{ width: 200, fontSize: 12, padding: '6px 10px' }}
          >
            <option value="all">Todas as filiais</option>
            {branchStats.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {visibleTxs.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhuma movimentação no período.
          </div>
        ) : (
          <div className="table-wrap">
          {/* Oito colunas: no celular cada movimentacao vira um bloco. */}
          <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Data', 'Descrição', 'Filial', 'Método', 'Tipo', 'Situação', 'Valor', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: h === 'Valor' ? 'right' : 'left',
                    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTxs.slice(0, 100).map((t, i) => {
                const isIncome  = t.type === 'INCOME'
                const estornada = t.notes === 'Estornada'
                const slugDaTx  = branchSlugMap[t.branch_id] ?? ''
                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: i < Math.min(visibleTxs.length, 100) - 1 ? '1px solid var(--hairline)' : 'none',
                      transition: 'background 0.1s',
                      opacity: estornada ? 0.5 : 1,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td data-label="Data" data-par style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(t.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td data-label="" style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)', maxWidth: 280 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {t.description || '—'}
                      </span>
                    </td>
                    <td data-label="Filial" data-par style={{ padding: '11px 16px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-field-token)',
                        background: 'var(--bg-app)', color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                      }}>
                        {t.branchName}
                      </span>
                    </td>
                    <td data-label="Método" data-par style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {t.payment_method ? PM_LABELS[t.payment_method] ?? t.payment_method : '—'}
                    </td>
                    <td data-label="Tipo" data-par style={{ padding: '11px 16px' }}>
                      <span className={isIncome ? 'chip chip-success' : 'chip chip-muted'} style={{ fontSize: 10 }}>
                        {isIncome ? 'Receita' : 'Despesa'}
                      </span>
                    </td>
                    {/* Situação — a tabela da rede era só leitura e nem dizia se
                        o lançamento estava pago. */}
                    <td data-label="Situação" data-par style={{ padding: '11px 16px' }}>
                      {estornada ? (
                        <span className="chip chip-muted" style={{ fontSize: 10 }}>Estornada</span>
                      ) : t.is_paid ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                          background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
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

                    <td data-label="Valor" data-par style={{ padding: '11px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: isIncome ? '#16a34a' : 'var(--text)', whiteSpace: 'nowrap' }}>
                      {isIncome ? '+' : '−'} {fmtBRL(t.amount)}
                    </td>

                    {/* Receber e estornar sem sair do portal da rede. */}
                    <td data-label="" style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {!t.is_paid && !estornada && canPay && (
                          <button type="button" onClick={() => marcarPago(t.id, slugDaTx)} title="Marcar como pago" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                            border: '1.5px solid #16a34a', background: '#f0fdf4',
                            color: '#16a34a', cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                            <CheckCircle2 size={12} /> Pagar
                          </button>
                        )}
                        {t.is_paid && !estornada && canReverse && (
                          <button type="button" onClick={() => estornar(t.id, t.branch_id, slugDaTx)} title="Estornar" style={{
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
        {visibleTxs.length > 100 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--hairline)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Exibindo 100 de {visibleTxs.length} registros. Use filtro de filial para refinar.
          </div>
        )}
      </div>

      <ClientCreditModal
        ref={creditModalRef}
        branchId={filterBranch !== 'all' ? filterBranch : ''}
        slug=""
        clients={clients}
        branches={branches}
      />
    </div>
  )
}
