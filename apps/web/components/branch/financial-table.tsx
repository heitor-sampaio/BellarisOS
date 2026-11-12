'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  Search, X, TrendingUp, TrendingDown, CheckCircle2,
  RotateCcw, ChevronUp, ChevronDown, XCircle, FileText, Download,
} from 'lucide-react'
import { markTransactionPaid, reverseTransaction } from '@/actions/financial'
import { ReceberNoCartao } from '@/components/shared/receber-no-cartao'
import { temBandeira } from '@/lib/financeiro/bandeiras'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { SegSelect } from '@/components/shared/seg-select'
import { ConfirmarEstorno } from '@/components/shared/confirmar-estorno'
import { DevolverParteDaVenda } from '@/components/shared/devolver-parte-da-venda'
import { EstornarVendaDeCredito } from '@/components/shared/estornar-venda-de-credito'
import { SituacaoDoEmAberto } from '@/components/shared/situacao-do-em-aberto'
import { PagarDespesa } from '@/components/shared/pagar-despesa'
import { RemarcarVencimento, VencimentoRemarcado, type RemarcacaoDoVencimento } from '@/components/shared/remarcar-vencimento'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { resultadoDaLista } from '@/lib/metrics/resultado'
import { csvDosLancamentos, linhaDoLancamento, baixarCsv } from '@/lib/financeiro/csv-dos-lancamentos'
import { useFuso } from '@/components/shared/fuso'

export interface Transaction {
  id:             string
  type:           'INCOME' | 'EXPENSE'
  category:       string
  description:    string
  amount:         number
  payment_method: string | null
  /** Crédito em N vezes, pago na hora (A33: a lista dizia só "Crédito"). */
  cartao_vezes?:  number | null
  is_paid:        boolean
  paid_at:        string | null
  due_date:       string | null
  notes:          string | null
  /** Por que foi estornado (A36): na original e no estorno. */
  estorno_motivo?: string | null
  /** O desconto e o motivo, embaixo do valor (fin-01): "Desconto R$ 20,00 · cliente antiga". */
  desconto_texto?: string | null
  /** A36 da 11ª: "Pago R$ 1.100,00 · R$ 990,00 estornados" (o estorno parcial). */
  estorno_parcial_texto?: string | null
  /** A37 da 11ª: o uso do crédito na clínica não é receita. */
  uso_de_credito_texto?: string | null
  created_at:     string
  appointment_id: string | null
  /** Da venda de produto: o estorno é da venda e pergunta se o produto voltou (H2). */
  product_sale_id?: string | null
  /** Da venda de crédito na clínica (decisão 1 da 9ª): o estorno é da venda e devolve o saldo não usado. */
  credito_vendido_id?: string | null
  /** O pago, no dia do pagamento; o em aberto, no vencimento (ou na criação). */
  data_de_referencia?: string | null
  /** D13 da 9ª: em aberto com o vencimento antes de hoje (decidido no servidor). */
  vencida?:       boolean
  /** A37 da 9ª: as remarcações do vencimento. */
  vencimentos_anteriores?: RemarcacaoDoVencimento[] | null
  /** De quem é o lançamento (2026-10-21). */
  cliente?: { name: string } | null
  /** A23 da 10ª: o pagamento de R$ 0, todo com o voucher ou os pontos ("Pago com pontos: R$ 180,00"). */
  pago_sem_dinheiro?: string | null
  /** A31 da 10ª: a taxa da maquininha e o líquido da receita paga (do banco), o fornecedor e a nota — para o CSV. */
  taxa?:        number | null
  liquido?:     number | null
  /** D9 e A45 da 12ª: o que ele conta no caixa, com o sinal (do banco; nulo = não conta). */
  no_caixa?:    number | null
  fornecedor?:  string | null
  nota_fiscal?: string | null
}

interface Props {
  transactions: Transaction[]
  branchId:     string
  slug:         string
  canReverse:   boolean
  canPay:       boolean
  /** A37 da 9ª: remarca o vencimento (o Financeiro em Gerenciar). */
  podeRemarcar?: boolean
  /** A44 da 8ª: o nome do CSV das movimentações (o recorte da tela). */
  nomeDoCsv?:   string
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
function fmtDatetime(iso: string, fuso = 'America/Sao_Paulo') {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: fuso, day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

type FilterType = 'all' | 'INCOME' | 'EXPENSE'
type SortDir    = 'asc' | 'desc'

export function FinancialTable({ transactions, slug, canReverse, canPay, podeRemarcar = false, nomeDoCsv = 'lancamentos.csv' }: Props) {
  const fuso = useFuso()
  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')

  const router        = useRouter()
  const [estornando, startTx] = useTransition()
  // O lançamento esperando a confirmação do estorno. Era um clique só, sem
  // volta (simulação de um dia de clínica, 2026-10-20).
  const [aEstornar, setAEstornar] = useState<{ id: string; descricao: string; valor: number; vendaDeProduto?: boolean; cancelarVenda?: boolean; doAtendimento?: boolean; pagoSemDinheiro?: string | null } | null>(null)

  // As actions devolvem `{ error }` quando não conseguem — descartar isso
  // fazia a tela recarregar e mostrar a linha igual, que é o mesmo que a
  // pessoa veria se a operação simplesmente não tivesse efeito ainda.
  // r3-f13-01: no cartão, a baixa pergunta a bandeira antes (opcional).
  // D6: a receita SEM meio (a parcela do crediário) pergunta a forma na mesma janela.
  // A34 da 8ª: a devolução de PARTE da venda de produto (a janela do estorno a oferece).
  const [aDevolverParte, setADevolverParte] = useState<string | null>(null)
  // Decisão 1 da 9ª: o estorno da venda de crédito na clínica (volta o saldo não usado).
  const [creditoAEstornar, setCreditoAEstornar] = useState<{ id: string; descricao: string } | null>(null)
  const [noCartao, setNoCartao] = useState<{ id: string; descricao: string; metodo: string | null; valor: number } | null>(null)
  // A15 da 9ª: a despesa sem forma pergunta a forma na baixa.
  const [despesaAPagar, setDespesaAPagar] = useState<{ id: string; descricao: string; valor: number } | null>(null)
  function handleMarkPaid(id: string, bandeira?: string | null, vezes?: number, forma?: string | null, maquininha?: string | null) {
    startTx(async () => {
      const r = await markTransactionPaid(id, slug, bandeira ?? null, vezes ?? null, forma ?? null, maquininha ?? null)
      if (r?.error) toast.error(r.error)
      else { setNoCartao(null); setDespesaAPagar(null); router.refresh() }
    })
  }

  function handleReverse(id: string, motivo: string, voltou?: boolean) {
    startTx(async () => {
      const r = await reverseTransaction(id, slug, motivo, voltou)
      if (r?.error) { toast.error(r.error); return }
      setAEstornar(null)
      toast.success(aEstornar?.cancelarVenda ? 'Venda cancelada.' : 'Lançamento estornado.')
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
        if (filterPaid === 'overdue' && !tx.vencida) return false
        if (q && !tx.description.toLowerCase().includes(q) && !tx.category.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const diff = new Date(a.data_de_referencia ?? a.created_at).getTime() - new Date(b.data_de_referencia ?? b.created_at).getTime()
        return sortDir === 'desc' ? -diff : diff
      })
  }, [transactions, filterType, filterPaid, search, sortDir])

  // O resultado do que está na tela, com sinal (J-48) — a conta mora em lib/metrics.
  const totalFiltered = resultadoDaLista(filtered)

  const thStyle: React.CSSProperties = {
    fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
    background: 'var(--bg-app)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }

  return (
    <>
    {aEstornar && (
      <ConfirmarEstorno alvo={aEstornar} estornando={estornando}
        onConfirmar={(motivo, voltou) => handleReverse(aEstornar.id, motivo, voltou)} onVoltar={() => setAEstornar(null)}
        onDevolverParte={aEstornar.vendaDeProduto && !aEstornar.cancelarVenda ? () => { setADevolverParte(aEstornar.id); setAEstornar(null) } : undefined} />
    )}
    {aDevolverParte && <DevolverParteDaVenda transacaoId={aDevolverParte} onFechar={() => setADevolverParte(null)} />}
    {creditoAEstornar && (
      <EstornarVendaDeCredito transacaoId={creditoAEstornar.id} descricao={creditoAEstornar.descricao} onFechar={() => setCreditoAEstornar(null)} />
    )}
    {despesaAPagar && (
      <PagarDespesa descricao={despesaAPagar.descricao} valor={despesaAPagar.valor} pendente={estornando}
        aoConfirmar={f => handleMarkPaid(despesaAPagar.id, null, undefined, f)} aoFechar={() => setDespesaAPagar(null)} />
    )}
    {noCartao && (
      <ReceberNoCartao descricao={noCartao.descricao} metodo={noCartao.metodo} pending={estornando}
        valor={noCartao.valor}
        aoConfirmar={(b, v, f, m) => handleMarkPaid(noCartao.id, b, v, f, m)} aoFechar={() => setNoCartao(null)} />
    )}
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
        <select value={filterPaid} onChange={e => setFilterPaid(e.target.value as 'all' | 'paid' | 'pending' | 'overdue')} className="filtro-select" aria-label="Situação">
          <option value="all">Todos os status</option>
          <option value="paid">Pago</option>
          <option value="pending">Pendente</option>
          <option value="overdue">Vencidas</option>
        </select>

        {/* Ordenar */}
        <button
          type="button" className="filtro-toggle"
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
        >
          {sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          {sortDir === 'desc' ? 'Mais recente' : 'Mais antigo'}
        </button>

        {/* A44 da 8ª: o CSV do que está na lista (os filtros valem), para a contadora. */}
        <button type="button" className="btn-secondary" disabled={filtered.length === 0}
          onClick={() => baixarCsv(nomeDoCsv, csvDosLancamentos(filtered.map(t => linhaDoLancamento(t)), fuso))}>
          <Download size={14} aria-hidden /> Exportar CSV
        </button>

        {/* Resultado filtrado */}
        {/* A31 da 9ª: é o CAIXA da lista (o pago que entrou − o que saiu), não o resultado do período (o Lucro). */}
        <span data-total-da-lista title="O caixa do que está na lista: o pago que entrou menos o pago que saiu. O resultado do período (o Lucro, acima) é outra conta." style={{
          marginLeft: 'auto', fontSize: 'var(--text-sm-sz)', fontWeight: 800,
          color: totalFiltered >= 0 ? 'var(--success)' : 'var(--danger)',
        }}>
          {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''} · caixa da lista {totalFiltered < 0 ? '−' : ''}{fmtBRL(Math.abs(totalFiltered))}
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
                  <th style={thStyle}>CLIENTE</th>
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
                    <tr key={tx.id} data-lancamento={tx.id} style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--hairline)' : 'none',
                      background: isReversed ? 'var(--bg-app)' : i % 2 === 0 ? 'var(--surface)' : 'transparent',
                      opacity: isReversed ? 0.5 : 1,
                    }}>
                      {/* Data */}
                      <td data-label="Data" data-par style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        {/* O em aberto mostra o VENCIMENTO (cada parcela no seu dia); o pago, o dia do pagamento. */}
                        {!tx.is_paid && tx.due_date ? (
                          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Vence {new Date(tx.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                          </p>
                        ) : (
                          <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {fmtDatetime(tx.is_paid && tx.paid_at ? tx.paid_at : tx.created_at, fuso)}
                          </p>
                        )}
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
                            {/* A52: o contra-lançamento diz o que é — não é despesa, anula a receita.
                                D3 da 12ª: o de uma DESPESA (a entrada) anula a despesa. */}
                            {tx.category === 'Estorno' && (tx.type === 'INCOME'
                              ? <p data-anula-a-despesa style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 1 }}>Anula a despesa estornada</p>
                              : <p data-anula-a-receita style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 1 }}>Anula a receita estornada</p>
                            )}
                            {tx.estorno_motivo && (
                              <p data-motivo-do-estorno style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 1 }}>Motivo: {tx.estorno_motivo}</p>
                            )}
                            <VencimentoRemarcado historico={tx.vencimentos_anteriores} />
                            {tx.appointment_id && (
                              <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)', marginTop: 1 }}>Atendimento</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Cliente */}
                      <td data-label="Cliente" data-par style={{ padding: '13px 16px', fontSize: 'var(--text-sm-sz)', color: tx.cliente?.name ? 'var(--text)' : 'var(--text-faint)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.cliente?.name ?? '—'}
                      </td>

                      {/* Categoria */}
                      <td data-label="Categoria" data-par style={{ padding: '13px 16px' }}>
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
                            {rotuloDaForma(tx.payment_method, tx.cartao_vezes)}
                          </span>
                        ) : tx.pago_sem_dinheiro ? (
                          // A23 da 10ª: o R$ 0 pago todo com o voucher ou os pontos diz isso.
                          <span data-pago-sem-dinheiro style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'normal' }}>
                            {tx.pago_sem_dinheiro}
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
                        {tx.desconto_texto && (
                          <p data-desconto-do-lancamento style={{ fontSize: 'var(--text-overline)', fontWeight: 600, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'normal', maxWidth: 220, marginLeft: 'auto' }}>
                            {tx.desconto_texto}
                          </p>
                        )}
                        {tx.estorno_parcial_texto && (
                          <p data-estorno-parcial-do-lancamento style={{ fontSize: 'var(--text-overline)', fontWeight: 600, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'normal', maxWidth: 220, marginLeft: 'auto' }}>
                            {tx.estorno_parcial_texto}
                          </p>
                        )}
                        {tx.uso_de_credito_texto && (
                          <p data-uso-de-credito style={{ fontSize: 'var(--text-overline)', fontWeight: 500, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'normal', maxWidth: 220, marginLeft: 'auto' }}>
                            {tx.uso_de_credito_texto}
                          </p>
                        )}
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
                          <SituacaoDoEmAberto vencida={tx.vencida} vencimento={tx.due_date} />
                        )}
                      </td>

                      {/* Ações */}
                      <td data-label="" style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {!tx.is_paid && !isReversed && canPay && (
                            <button type="button" onClick={() => tx.type === 'INCOME' && (temBandeira(tx.payment_method) || !tx.payment_method)
                              ? setNoCartao({ id: tx.id, descricao: tx.description ?? 'Lançamento', metodo: tx.payment_method ?? null, valor: Number(tx.amount) })
                              : tx.type === 'EXPENSE' && !tx.payment_method
                              ? setDespesaAPagar({ id: tx.id, descricao: tx.description ?? 'Despesa', valor: Number(tx.amount) })
                              : handleMarkPaid(tx.id)} title="Marcar como pago" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                              border: '1.5px solid var(--success)', background: 'var(--success-bg)',
                              color: 'var(--success)', cursor: 'pointer',
                            }}>
                              <CheckCircle2 size={12} />
                              Pagar
                            </button>
                          )}
                          {/* A37 da 9ª: remarcar o vencimento do que está em aberto. */}
                          {!tx.is_paid && !isReversed && podeRemarcar && (
                            <RemarcarVencimento lancamento={{ id: tx.id, descricao: tx.description, valor: Number(tx.amount), vencimento: tx.due_date }} />
                          )}
                          {/* ven-06: o recibo do que foi pago (PDF — imprimir ou baixar). */}
                          {isIncome && tx.is_paid && !isReversed && tx.category !== 'Estorno' && (
                            <a href={`/api/recibos/${tx.id}`} target="_blank" rel="noopener" aria-label="Recibo" title="Recibo (PDF): imprimir ou baixar" style={{
                            width: 30, height: 30, borderRadius: 7,
                            border: '1px solid var(--border)', background: 'var(--surface)',
                            color: 'var(--text-faint)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <FileText size={12} />
                          </a>
                          )}
                          {/* Estorno não se estorna — o banco também recusa. */}
                          {tx.is_paid && !isReversed && tx.category !== 'Estorno' && canReverse && (
                            // A32 da 9ª: o "Estornar" com texto (era só o ícone de 30 px).
                            <button type="button" data-estornar title={tx.pago_sem_dinheiro ? "Desfazer o pagamento" : "Estornar"} onClick={() => tx.credito_vendido_id
                              ? setCreditoAEstornar({ id: tx.id, descricao: tx.description })
                              : setAEstornar({ id: tx.id, descricao: tx.description, valor: tx.amount, vendaDeProduto: !!tx.product_sale_id, doAtendimento: !!tx.appointment_id, pagoSemDinheiro: tx.pago_sem_dinheiro ?? null })} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                              border: '1px solid var(--border)', background: 'var(--surface)',
                              color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
                            }}>
                              <RotateCcw size={12} aria-hidden /> {tx.pago_sem_dinheiro ? 'Desfazer o pagamento' : 'Estornar'}
                            </button>
                          )}
                        {/* A venda de produto toda a receber não tem o que estornar: se
                            CANCELA (a mesma pergunta do produto, produto_estornar_venda). */}
                        {!tx.is_paid && !isReversed && !!tx.product_sale_id && canReverse && (
                          <button type="button" onClick={() => setAEstornar({ id: tx.id, descricao: tx.description, valor: tx.amount, vendaDeProduto: true, cancelarVenda: true })} title="Cancelar venda" aria-label="Cancelar venda" style={{
                            width: 30, height: 30, borderRadius: 7,
                            border: '1px solid var(--border)', background: 'var(--surface)',
                            color: 'var(--text-faint)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <XCircle size={12} />
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
  </>
  )
}
