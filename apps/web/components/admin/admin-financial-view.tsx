'use client'

import { NotaDoDebito } from '@/components/shared/nota-do-debito'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Wallet, Users,
  ArrowUpRight, ArrowDownRight,
  Plus, CheckCircle2, Clock, RotateCcw, XCircle, CreditCard, FileText, Download,
} from 'lucide-react'
import { FinancialTransactionModal } from '@/components/branch/financial-transaction-modal'
import { markTransactionPaid, reverseTransaction } from '@/actions/financial'
import { ReceberNoCartao } from '@/components/shared/receber-no-cartao'
import { ConfirmarEstorno } from '@/components/shared/confirmar-estorno'
import { DevolverParteDaVenda } from '@/components/shared/devolver-parte-da-venda'
import { EstornarVendaDeCredito } from '@/components/shared/estornar-venda-de-credito'
import { SituacaoDoEmAberto } from '@/components/shared/situacao-do-em-aberto'
import { PagarDespesa } from '@/components/shared/pagar-despesa'
import { RemarcarVencimento, VencimentoRemarcado, type RemarcacaoDoVencimento } from '@/components/shared/remarcar-vencimento'
import type { AReceberVencido } from '@/lib/metrics/vencidas'
import { SegSelect } from '@/components/shared/seg-select'
import { toast } from 'sonner'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import type { ProximoVencimento } from '@/lib/metrics/queries'
import { NotaDoVencimento } from '@/components/shared/nota-do-vencimento'
import { ParcelasDaOperadora, LinkDasParcelas } from '@/components/shared/parcelas-da-operadora'
import type { AReceberDaOperadora, ParcelaDaOperadora } from '@/lib/metrics/operadora'
import { FluxoDeCaixa } from '@/components/shared/fluxo-de-caixa'
import type { MesDoFluxo } from '@/lib/metrics/fluxo-de-caixa'
import type { ResultadoDoPeriodo } from '@/lib/metrics/resultado'
import { ContaDoResultado } from '@/components/shared/conta-do-resultado'
import { csvDosLancamentos, linhaDoLancamento, baixarCsv } from '@/lib/financeiro/csv-dos-lancamentos'
import { useFuso } from '@/components/shared/fuso'
import { AvisosDasTaxas, CsvDoFechamentoDoDia } from '@/components/shared/caixa-no-financeiro'
import type { TaxasDoPeriodo } from '@/lib/metrics/queries'
import { AbasDoFinanceiro } from '@/components/shared/abas-do-financeiro'
import { linkDaAba, type AbaDoFinanceiro } from '@/lib/financeiro/abas'

// --- Types -------------------------------------------------------------------

interface BranchStat {
  id:          string
  name:        string
  slug:        string
  revenue:     number
  expenses:    number
  result:      number
  /** As parcelas do resultado (lib/metrics): a conta embaixo do cartão (D8 da 8ª). */
  conta:       ResultadoDoPeriodo
  commissions: number
  aReceber:    number
  /** D-14: todo o a receber em aberto da unidade, de qualquer vencimento. */
  aReceberEmAberto?: number
  /** D13 da 9ª: o que já venceu na unidade. */
  vencidas?: AReceberVencido
  /** "Reforça", item 4: os concluídos sem pagamento da unidade. */
  concluidosSemPagamento?: { n: number; valor: number }
  aPagar:      number
  /** A43 da 12ª: todo o a pagar em aberto da unidade, de qualquer vencimento. */
  aPagarEmAberto?: number
  /** O próximo vencimento depois do período (A34): "R$ 300,00 em 05/11". */
  proximoAReceber?: ProximoVencimento | null
  proximoAPagar?:   ProximoVencimento | null
  txCount:     number
}

interface AdminTx {
  id:             string
  type:           string
  category:       string | null
  description:    string
  amount:         number
  payment_method: string | null
  cartao_vezes?:  number | null
  is_paid:        boolean
  paid_at:        string | null
  due_date:       string | null
  created_at:     string
  /** O pago, no dia do pagamento; o em aberto, no vencimento (ou na criação). */
  data_de_referencia?: string | null
  branch_id:      string
  branchName:     string
  /** De quem é o lançamento (2026-10-21): o cliente, quando há. */
  clienteNome?:   string | null
  /** `'Estornada'` marca a ponta estornada — o estorno sai dos dois lados. */
  notes:          string | null
  /** Por que foi estornado (A36): na original e no estorno. */
  estorno_motivo?: string | null
  /** D13 da 9ª: em aberto com o vencimento antes de hoje (decidido no servidor). */
  vencida?: boolean
  /** A37 da 9ª: as remarcações do vencimento. */
  vencimentos_anteriores?: RemarcacaoDoVencimento[] | null
  /** O desconto e o motivo, embaixo do valor (fin-01). */
  desconto_texto?: string | null
  /** A36 da 11ª: "Pago R$ 1.100,00 · R$ 990,00 estornados" (o estorno parcial). */
  estorno_parcial_texto?: string | null
  /** A37 da 11ª: o uso do crédito na clínica não é receita. */
  uso_de_credito_texto?: string | null
  /** Da venda de produto: o estorno é da venda e pergunta se o produto voltou (H2). */
  product_sale_id?: string | null
  /** Da venda de crédito na clínica (decisão 1 da 9ª): o estorno é da venda e devolve o saldo não usado. */
  credito_vendido_id?: string | null
  /** O recebimento de um atendimento: estornar reabre a cobrança dele (A51). */
  appointment_id?: string | null
  /** A23 da 10ª: o pagamento de R$ 0, todo com o voucher ou os pontos. */
  pago_sem_dinheiro?: string | null
  /** A31 da 10ª: a taxa e o líquido da receita paga (do banco), o fornecedor e a nota — para o CSV. */
  taxa?:        number | null
  liquido?:     number | null
  /** D9 e A45 da 12ª: o que ele conta no caixa, com o sinal (do banco; nulo = não conta). */
  no_caixa?:    number | null
  fornecedor?:  string | null
  nota_fiscal?: string | null
  /** A44 da 12ª: a bandeira, o desconto em reais e a profissional — para o CSV da contadora. */
  cartao_bandeira?:   string | null
  /** A18 da 14ª: o nome da maquininha (só com mais de uma na rede). */
  maquininha_nome?:   string | null
  desconto_valor?:    number | null
  profissional_nome?: string | null
  vendedor_nome?: string | null
}

interface Props {
  period:           string
  periodLabel:      string
  customFrom?:      string
  customTo?:        string
  totalRevenue:     number
  totalExpenses:    number
  totalResult:      number
  /** As parcelas do resultado da rede (lib/metrics): a conta embaixo do cartão (D8 da 8ª). */
  totalConta:       ResultadoDoPeriodo
  totalCommissions: number
  /** A receber e a pagar no período (lib/metrics: revenuePending, metrics_a_pagar). */
  totalAReceber:    number
  /** D-14: todo o a receber em aberto da rede, de qualquer vencimento (getAReceberEmAberto). */
  totalAReceberEmAberto: number
  /** D13 da 9ª: o que já venceu na rede (getAReceberVencido). */
  totalVencidas?:   AReceberVencido
  /** "Reforça", item 4: os atendimentos concluídos sem pagamento da rede, separados dos lançamentos. */
  totalConcluidosSemPagamento?: { n: number; valor: number }
  totalAPagar:      number
  /** A43 da 12ª: todo o a pagar em aberto da rede, de qualquer vencimento (getAPagarEmAberto). */
  totalAPagarEmAberto?: number
  /**
   * F2c: o cartão em N vezes que a OPERADORA ainda deposita (a cliente já
   * pagou tudo) — o total das ativas e cada unidade (lib/metrics/operadora).
   */
  aReceberDaOperadora: { total: AReceberDaOperadora; porUnidade: Record<string, AReceberDaOperadora> }
  /** A38 da 11ª: o débito do período (a composição por forma), que conta como recebido no dia. */
  debitoNoPeriodo?: number
  /** D8 da 13ª: o débito do período de cada unidade (o recorte do filtro). */
  debitoPorUnidade?: Record<string, number>
  /**
   * CX6 (2026-11-14): as taxas da maquininha estimadas e a venda sem taxa
   * cadastrada, no período — o total e cada unidade (eram do Fechamento do dia).
   */
  taxasDoPeriodo?: { total: TaxasDoPeriodo; porUnidade: Record<string, TaxasDoPeriodo> }
  /** As parcelas da operadora: todo o em aberto e o que vence no período (D3). */
  parcelasDaOperadora: ParcelaDaOperadora[]
  /** r2-fin-04: o fluxo de caixa dos próximos meses — o do recorte e o de cada unidade. */
  fluxoDeCaixa?: { total: MesDoFluxo[]; porUnidade: Record<string, MesDoFluxo[]> }
  /** O próximo vencimento da rede depois do período, de cada lado (getEmAberto). */
  totalProximoAReceber?: ProximoVencimento | null
  totalProximoAPagar?:   ProximoVencimento | null
  /** O total de movimentações (metrics_movimentacoes), a mesma conta da coluna. */
  totalMovimentacoes: number
  prevRevenue:      number
  prevExpenses:     number
  branchStats:      BranchStat[]
  /** A rede tem UMA unidade ativa (D-19): sem "Por filial", "Total rede" nem o filtro de filial. */
  umaUnidade?:      boolean
  transactions:     AdminTx[]
  /** D13 da 9ª: o A receber só com as VENCIDAS (`?aba=a-receber&aberto=vencidas`). */
  soAsVencidas?:    boolean
  /** A44 da 8ª: o nome do CSV das movimentações. */
  nomeDoCsv?:       string
  branchSlugMap:    Record<string, string>
  /** As unidades de leitura (F72): `ativa: false` é a desativada com o que ficou — aparece, mas não recebe lançamento novo. */
  branches:         { id: string; name: string; slug: string; ativa?: boolean }[]
  /**
   * Unidade já recortada ao abrir (`?unidade=` na URL).
   *
   * É o destino do "ver o financeiro desta unidade" — no dashboard da rede e na
   * própria tabela por filial, que antes saíam para o portal da unidade.
   */
  unidadeInicial?:  string
  /** Lança (Financeiro em Gerenciar): sem isso, o "Novo lançamento" não aparece (D7, 2026-11-01). */
  canWrite?:        boolean
  /** Recebe (caixa ou financeiro): marca pendência como paga e dá crédito. */
  canPay?:          boolean
  /** Estorna: só `financial: Gerenciar` — estorno mexe em lançamento fechado. */
  canReverse?:      boolean
  /** FI1: a aba aberta (Comissões é a página dela). */
  aba:              Exclude<AbaDoFinanceiro, 'comissoes'>
  /** O plano da rede tem comissões: a aba aparece. */
  comComissoes:     boolean
}

// --- Helpers -----------------------------------------------------------------

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PERIOD_OPTIONS = [
  { value: 'today',      label: 'Hoje' },
  { value: 'week',       label: 'Esta semana' },
  { value: 'month',      label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'quarter',    label: 'Últimos 90 dias' },
  { value: 'custom',     label: 'Personalizado' },
]

function pctDelta(curr: number, prev: number) {
  // Sem base de comparação não existe variação: antes o primeiro mês de uso
  // exibia "▲ 100%" de crescimento inventado a partir do zero.
  if (prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  return { pct: Math.abs(pct), up: pct >= 0 }
}

// --- KPI Card ----------------------------------------------------------------

function KpiCard({
  label, value, delta, icon, brand = false, chave, nota,
}: {
  /** `data-kpi`, para o teste achar o cartão. */
  chave?: string
  /** Uma linha a mais embaixo (o "pelo vencimento" e o próximo). */
  nota?:  React.ReactNode
  label:  string
  value:  string
  delta?: { pct: number; up: boolean } | null
  icon:   React.ReactNode
  brand?: boolean
}) {
  return (
    <div className="card" data-kpi={chave} style={{
      padding: '20px 22px',
      background: brand ? 'var(--brand)' : 'var(--surface)',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: brand ? '0 4px 16px -4px rgba(195,77,107,.35)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 'var(--text-overline)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
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
      <span data-valor-do-kpi style={{
        fontSize: 'clamp(20px, 5.4vw, 26px)', fontWeight: 800, letterSpacing: '-0.025em',
        color: brand ? 'var(--on-brand)' : 'var(--text)', whiteSpace: 'nowrap',
      }}>{value}</span>
      {delta !== null && delta !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {delta.up
            ? <ArrowUpRight size={13} color={brand ? 'rgba(255,255,255,0.8)' : 'var(--success)'} />
            : <ArrowDownRight size={13} color={brand ? 'rgba(255,255,255,0.6)' : 'var(--danger)'} />
          }
          <span style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700,
            color: brand ? 'rgba(255,255,255,0.8)' : delta.up ? 'var(--success)' : 'var(--danger)',
          }}>
            {delta.pct.toFixed(1).replace('.', ',')}% vs. período anterior
          </span>
        </div>
      )}
      {nota && <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>{nota}</div>}
    </div>
  )
}

// --- Main component -----------------------------------------------------------

export function AdminFinancialView({
  period, periodLabel, customFrom, customTo,
  totalRevenue, totalExpenses, totalResult, totalConta, totalCommissions, totalAReceber, totalAReceberEmAberto, totalVencidas, totalConcluidosSemPagamento, totalAPagar, totalAPagarEmAberto = 0, totalMovimentacoes,
  aReceberDaOperadora, parcelasDaOperadora, fluxoDeCaixa, debitoNoPeriodo = 0, debitoPorUnidade = {}, taxasDoPeriodo,
  totalProximoAReceber = null, totalProximoAPagar = null,
  prevRevenue, prevExpenses,
  branchStats, umaUnidade = false, transactions, soAsVencidas = false, nomeDoCsv = 'lancamentos.csv', branchSlugMap, branches, unidadeInicial = '',
  canWrite = false, canPay = false, canReverse = false, aba, comComissoes,
}: Props) {
  const fuso = useFuso()
  const router      = useRouter()
  const [estornando, startT] = useTransition()
  // O lançamento esperando a confirmação do estorno (era um clique só, sem volta).
  // A34 da 8ª: a devolução de PARTE da venda de produto (a janela do estorno a oferece).
  const [aDevolverParte, setADevolverParte] = useState<string | null>(null)
  // Decisão 1 da 9ª: o estorno da venda de crédito na clínica (volta o saldo não usado).
  const [creditoAEstornar, setCreditoAEstornar] = useState<{ id: string; descricao: string } | null>(null)
  const [aEstornar, setAEstornar] = useState<{ id: string; slug: string; descricao: string; valor: number; vendaDeProduto?: boolean; cancelarVenda?: boolean; doAtendimento?: boolean; pagoSemDinheiro?: string | null } | null>(null)

  // A unidade da ação vem da própria transação — não há o que perguntar.
  // O resultado das actions não pode ser descartado: as duas falham devolvendo
  // `{ error }`, e engolir isso deixava a tela dar um refresh e mostrar a linha
  // exatamente como estava — indistinguível de "ainda não atualizou".
  // r3-f13-01: no cartão, a baixa pergunta a bandeira antes (opcional).
  // D6: a receita SEM meio (a parcela do crediário) pergunta a forma na mesma janela.
  const [noCartao, setNoCartao] = useState<{ id: string; slug: string; descricao: string; metodo: string | null; valor: number } | null>(null)
  // A15 da 9ª: a despesa sem forma pergunta a forma na baixa.
  const [despesaAPagar, setDespesaAPagar] = useState<{ id: string; slug: string; descricao: string; valor: number } | null>(null)
  function marcarPago(id: string, slug: string, bandeira?: string | null, vezes?: number, forma?: string | null, maquininha?: string | null) {
    startT(async () => {
      const r = await markTransactionPaid(id, slug, bandeira ?? null, vezes ?? null, forma ?? null, maquininha ?? null)
      if (r?.error) toast.error(r.error)
      else { setNoCartao(null); setDespesaAPagar(null); router.refresh() }
    })
  }
  function estornar(id: string, slug: string, motivo: string, voltou?: boolean) {
    startT(async () => {
      const r = await reverseTransaction(id, slug, motivo, voltou)
      if (r?.error) { toast.error(r.error); return }
      setAEstornar(null)
      toast.success(aEstornar?.cancelarVenda ? 'Venda cancelada.' : 'Lançamento estornado.')
      router.refresh()
    })
  }
  const [filterBranch, setFilterBranch] = useState<string>(unidadeInicial || 'all')
  const [customF, setCustomF] = useState(customFrom ?? '')
  const [customT, setCustomT] = useState(customTo   ?? '')

  // O período (ou a unidade) muda e a aba fica (FI1).
  function navigate(p: string, f?: string, t?: string, unidade: string = filterBranch) {
    startT(() => {
      const q = new URLSearchParams()
      if (aba !== 'resumo') q.set('aba', aba)
      if (aba === 'a-receber' && soAsVencidas) q.set('aberto', 'vencidas')
      q.set('period', p)
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
  const conta       = statDaUnidade ? statDaUnidade.conta       : totalConta
  const commissions = statDaUnidade ? statDaUnidade.commissions : totalCommissions
  const aReceber    = statDaUnidade ? statDaUnidade.aReceber    : totalAReceber
  const aReceberEmAberto = statDaUnidade ? statDaUnidade.aReceberEmAberto ?? 0 : totalAReceberEmAberto
  const vencidas = statDaUnidade ? statDaUnidade.vencidas : totalVencidas
  const concluidosSemPagamento = statDaUnidade ? statDaUnidade.concluidosSemPagamento : totalConcluidosSemPagamento
  const aPagar      = statDaUnidade ? statDaUnidade.aPagar      : totalAPagar
  const aPagarEmAberto = statDaUnidade ? statDaUnidade.aPagarEmAberto ?? 0 : totalAPagarEmAberto
  const proximoAReceber = statDaUnidade ? statDaUnidade.proximoAReceber ?? null : totalProximoAReceber
  const proximoAPagar   = statDaUnidade ? statDaUnidade.proximoAPagar ?? null   : totalProximoAPagar
  const SEM_OPERADORA: AReceberDaOperadora = { aReceber: 0, aReceberBruto: 0, recebido: 0, emAberto: 0, emAbertoBruto: 0, proximo: null }
  const operadora = statDaUnidade ? aReceberDaOperadora.porUnidade[statDaUnidade.id] ?? SEM_OPERADORA : aReceberDaOperadora.total
  const parcelasVisiveis = filterBranch === 'all' ? parcelasDaOperadora : parcelasDaOperadora.filter(p => p.branchId === filterBranch)

  const iconColor    = (brand: boolean) => brand ? 'var(--surface)' : 'var(--brand)'
  // Sem base de comparação por unidade, não se inventa delta: `prevRevenue` e
  // `prevExpenses` são da rede.
  const deltaRevenue  = statDaUnidade ? null : pctDelta(totalRevenue,  prevRevenue)
  const deltaExpenses = statDaUnidade ? null : pctDelta(totalExpenses, prevExpenses)

  // Sort branchStats by revenue desc for the table
  const sortedStats = [...branchStats].sort((a, b) => b.revenue - a.revenue)

  /** Uma linha da lista (receber e estornar sem sair do portal da rede). */
  function linhaDaTabela(t: AdminTx, ultima: boolean) {
    const isIncome  = t.type === 'INCOME'
    const estornada = t.notes === 'Estornada'
    const slugDaTx  = branchSlugMap[t.branch_id] ?? ''
    return (
      <tr
        key={t.id}
        data-lancamento={t.id}
        style={{
          borderBottom: ultima ? 'none' : '1px solid var(--hairline)',
          transition: 'background 0.1s',
          opacity: estornada ? 0.5 : 1,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <td data-label="Data" data-par style={{ padding: '11px 16px', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {!t.is_paid && t.due_date
            ? `Vence ${new Date(t.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
            : new Date(t.data_de_referencia ?? t.created_at).toLocaleDateString('pt-BR', { timeZone: fuso })}
        </td>
        {/* A36 da 12ª: a 1440 px a tabela passava do cartão e cortava as ações. A descrição
            quebra em até duas linhas (o nowrap fazia dela a largura mínima da coluna), e o
            limite mora no span — o maxWidth do td a tabela ignora. */}
        <td data-label="" style={{ padding: '11px 16px', fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text)' }}>
          <span title={t.description || undefined} style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxWidth: 280, overflowWrap: 'anywhere' }}>
            {t.description || '—'}
          </span>
          {/* A52: o contra-lançamento diz o que é — não é despesa, anula a receita.
              D3 da 12ª: o de uma DESPESA (a entrada) anula a despesa. */}
          {t.category === 'Estorno' && (t.type === 'INCOME'
            ? <span data-anula-a-despesa style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)' }}>Anula a despesa estornada</span>
            : <span data-anula-a-receita style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)' }}>Anula a receita estornada</span>
          )}
          <VencimentoRemarcado historico={t.vencimentos_anteriores} />
          {t.estorno_motivo && (
            <span data-motivo-do-estorno style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)' }}>Motivo: {t.estorno_motivo}</span>
          )}
        </td>
        <td data-label="Cliente" data-par style={{ padding: '11px 16px', fontSize: 'var(--text-sm-sz)', color: t.clienteNome ? 'var(--text)' : 'var(--text-faint)' }}>
          <span style={{ display: 'block', maxWidth: 200 }}>{t.clienteNome ?? '—'}</span>
        </td>
        {!umaUnidade && <td data-label="Unidade" data-par style={{ padding: '11px 16px' }}>
          <span style={{
            fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-field-token)',
            background: 'var(--bg-app)', color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}>
            {t.branchName}
          </span>
        </td>}
        <td data-label="Método" data-par style={{ padding: '11px 16px', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {t.payment_method ? rotuloDaForma(t.payment_method, t.cartao_vezes, { maquininha: t.maquininha_nome })
            // A23 da 10ª: o R$ 0 pago todo com o voucher ou os pontos diz isso.
            : t.pago_sem_dinheiro ? <span data-pago-sem-dinheiro>{t.pago_sem_dinheiro}</span> : '—'}
        </td>
        <td data-label="Tipo" data-par style={{ padding: '11px 16px' }}>
          <span data-tipo-do-lancamento className={isIncome ? 'chip chip-success' : 'chip chip-muted'} style={{ fontSize: 'var(--text-overline)' }}>
            {t.category === 'Estorno' ? 'Estorno' : isIncome ? 'Receita' : 'Despesa'}
          </span>
        </td>
        {/* Situação — a tabela da rede era só leitura e nem dizia se
            o lançamento estava pago. */}
        <td data-label="Situação" data-par style={{ padding: '11px 16px' }}>
          {estornada ? (
            <span className="chip chip-muted" style={{ fontSize: 'var(--text-overline)' }}>Estornada</span>
          ) : t.is_paid ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
              background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)',
            }}>
              <CheckCircle2 size={10} /> Pago
            </span>
          ) : (
            <SituacaoDoEmAberto vencida={t.vencida} vencimento={t.due_date} />
          )}
        </td>

        <td data-label="Valor" data-par style={{ padding: '11px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: isIncome ? 'var(--success)' : 'var(--text)', whiteSpace: 'nowrap' }}>
          {isIncome ? '+' : '−'} {fmtBRL(t.amount)}
          {t.desconto_texto && (
            <span data-desconto-do-lancamento style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'normal', maxWidth: 220, marginLeft: 'auto' }}>
              {t.desconto_texto}
            </span>
          )}
          {t.estorno_parcial_texto && (
            <span data-estorno-parcial-do-lancamento style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'normal', maxWidth: 220, marginLeft: 'auto' }}>
              {t.estorno_parcial_texto}
            </span>
          )}
          {t.uso_de_credito_texto && (
            <span data-uso-de-credito style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'normal', maxWidth: 220, marginLeft: 'auto' }}>
              {t.uso_de_credito_texto}
            </span>
          )}
        </td>

        {/* Receber e estornar sem sair do portal da rede. */}
        <td data-label="" style={{ padding: '11px 16px', width: 1 }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', minWidth: 120 }}>
            {!t.is_paid && !estornada && canPay && (
              <button type="button" onClick={() => t.type === 'INCOME'
                ? setNoCartao({ id: t.id, slug: slugDaTx, descricao: t.description ?? 'Lançamento', metodo: t.payment_method ?? null, valor: Number(t.amount) })
                : t.type === 'EXPENSE' && !t.payment_method
                ? setDespesaAPagar({ id: t.id, slug: slugDaTx, descricao: t.description ?? 'Despesa', valor: Number(t.amount) })
                : marcarPago(t.id, slugDaTx)} title="Marcar como pago" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                border: '1.5px solid var(--success)', background: 'var(--success-bg)',
                color: 'var(--success)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <CheckCircle2 size={12} /> Pagar
              </button>
            )}
            {/* A37 da 9ª: remarcar o vencimento do que está em aberto. */}
            {!t.is_paid && !estornada && canWrite && (
              <RemarcarVencimento lancamento={{ id: t.id, descricao: t.description, valor: Number(t.amount), vencimento: t.due_date }} />
            )}
            {/* ven-06: o recibo do que foi pago (PDF — imprimir ou baixar). */}
            {isIncome && t.is_paid && !estornada && t.category !== 'Estorno' && (
              <a href={`/api/recibos/${t.id}`} target="_blank" rel="noopener" aria-label="Recibo" title="Recibo (PDF): imprimir ou baixar" style={{
                width: 30, height: 30, borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-faint)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileText size={12} />
              </a>
            )}
            {/* Estorno não se estorna (o banco também recusa): desfazer é
                coisa do financeiro, não um segundo clique. */}
            {t.is_paid && !estornada && t.category !== 'Estorno' && canReverse && (
              // A32 da 9ª: o "Estornar" com texto (era só o ícone de 30 px).
              <button type="button" data-estornar title={t.pago_sem_dinheiro ? 'Desfazer o pagamento' : 'Estornar'} onClick={() => t.credito_vendido_id
                ? setCreditoAEstornar({ id: t.id, descricao: t.description })
                : setAEstornar({ id: t.id, slug: slugDaTx, descricao: t.description, valor: Number(t.amount), vendaDeProduto: !!t.product_sale_id, doAtendimento: !!t.appointment_id, pagoSemDinheiro: t.pago_sem_dinheiro ?? null })} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 'var(--text-xs-sz)', fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <RotateCcw size={12} aria-hidden /> {t.pago_sem_dinheiro ? 'Desfazer o pagamento' : 'Estornar'}
              </button>
            )}
            {/* A venda de produto toda a receber não tem o que estornar: se
                CANCELA (a mesma pergunta do produto, produto_estornar_venda). */}
            {!t.is_paid && !estornada && !!t.product_sale_id && canReverse && (
              <button type="button" onClick={() => setAEstornar({ id: t.id, slug: slugDaTx, descricao: t.description, valor: Number(t.amount), vendaDeProduto: true, cancelarVenda: true })} title="Cancelar venda" aria-label="Cancelar venda" style={{
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
  }

  // FI1: o link de cada aba guarda o período e a unidade; a mudança de período guarda a aba.
  const base = '/admin/financeiro'
  const manter = {
    period,
    from: period === 'custom' ? customFrom : undefined,
    to:   period === 'custom' ? customTo : undefined,
    unidade: filterBranch !== 'all' ? filterBranch : undefined,
  }
  const daAba = (a: AbaDoFinanceiro, extra: Record<string, string> = {}) => linkDaAba(base, a, manter, extra)
  // A42 da 12ª: quem só vê o Financeiro lia "use Pagar na linha" sem botão nenhum.
  const fraseDaBaixa = canPay ? 'Para dar baixa, use “Pagar” na linha.' : 'Dar baixa é de quem tem Recebimentos (o caixa) no cargo.'
  const faixa: React.CSSProperties = { fontSize: 'var(--text-sm-sz)', color: 'var(--text)', background: 'var(--info-soft)', borderRadius: 'var(--radius-field-token)', padding: '10px 14px', margin: 0 }

  // A receber e a pagar (2026-10-21): a unidade mostrava, a rede não.
  const cartaoAReceber = (naAba: boolean) => (
    <KpiCard
      chave="a-receber"
      label="A receber da cliente"
      value={fmtBRL(aReceber)}
      nota={<NotaDoVencimento valor={aReceber} proximo={proximoAReceber} emAbertoTotal={aReceberEmAberto} concluidosSemPagamento={concluidosSemPagamento}
        hrefDaBaixa={naAba ? undefined : daAba('a-receber')} podeDarBaixa={canPay}
        vencidas={vencidas} hrefDasVencidas={naAba && soAsVencidas ? undefined : daAba('a-receber', { aberto: 'vencidas' })} />}
      icon={<Clock size={16} color="var(--brand)" />}
    />
  )
  // F2c: o que a operadora ainda deposita do cartão em N vezes — não é
  // dívida da cliente (ela pagou tudo na maquininha).
  const cartaoDaOperadora = (naAba: boolean) => (
    <KpiCard
      chave="a-receber-operadora"
      label="A receber da operadora"
      value={fmtBRL(operadora.aReceber)}
      nota={<>
        <NotaDoVencimento valor={operadora.aReceber} proximo={operadora.proximo} emAbertoTotal={operadora.emAberto}
          bruto={{ periodo: operadora.aReceberBruto, emAberto: operadora.emAbertoBruto }} />
        {/* D3: o cartão leva à lista das parcelas (no A receber). */}
        <LinkDasParcelas temParcelas={parcelasVisiveis.length > 0} href={naAba ? undefined : daAba('a-receber')} />
        {/* A38 da 11ª: o débito conta como recebido no dia. */}
        <NotaDoDebito debito={statDaUnidade ? debitoPorUnidade[statDaUnidade.id] ?? 0 : debitoNoPeriodo} />
      </>}
      icon={<CreditCard size={16} color="var(--brand)" />}
    />
  )
  const cartaoAPagar = (naAba: boolean) => (
    <KpiCard
      chave="a-pagar"
      label="A pagar"
      value={fmtBRL(aPagar)}
      nota={<NotaDoVencimento valor={aPagar} proximo={proximoAPagar} emAbertoTotal={aPagarEmAberto} despesa podeDarBaixa={canPay}
        hrefDaBaixa={naAba ? undefined : daAba('a-pagar')} />}
      icon={<Clock size={16} color="var(--brand)" />}
    />
  )

  /** A lista dos lançamentos (A receber, A pagar e Movimentações): a mesma tabela, com o título de cada aba. */
  const tabela = (titulo: string) => (
    <div id="movimentacoes" className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>
          {titulo}
          <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
            {visibleTxs.length} registro{visibleTxs.length !== 1 ? 's' : ''}
          </span>
        </span>

        {/* A44 da 8ª: o CSV de todas as movimentações do recorte (a tela mostra as 100 primeiras). */}
        <button type="button" className="btn-secondary" disabled={visibleTxs.length === 0} style={{ marginLeft: 'auto' }}
          onClick={() => baixarCsv(nomeDoCsv, csvDosLancamentos(
            visibleTxs.map(t => linhaDoLancamento(t, branches.find(b => b.id === t.branch_id)?.name ?? null)), fuso))}>
          <Download size={14} aria-hidden /> Exportar CSV
        </button>
        {/* CX6: a planilha do Fechamento do dia (era o "Exportar CSV" do Fechamento) — é do extrato. */}
        {aba === 'movimentacoes' && (
          <CsvDoFechamentoDoDia unidades={branches.map(b => ({ id: b.id, name: b.name }))} unidadeInicial={filterBranch !== 'all' ? filterBranch : null} />
        )}

        {/* Filtro por unidade — só com mais de uma (D-19). Vai à URL: as abas o levam junto. */}
        {!umaUnidade && <select
          className="filtro-select"
          aria-label="Unidade"
          value={filterBranch}
          onChange={e => verUnidade(e.target.value)}
          style={{ width: 200 }}
        >
          <option value="all">Todas as unidades</option>
          {branchStats.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>}
      </div>

      {visibleTxs.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
          {aba === 'movimentacoes' ? 'Nenhuma movimentação no período.' : 'Nada em aberto.'}
        </div>
      ) : (
        <div className="table-wrap">
        {/* Oito colunas: no celular cada movimentacao vira um bloco. */}
        <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {/* A36 da 12ª: a 1440 px a linha cortava "Remarcar vencimento" e "Estornar" —
                  a coluna Unidade sai na rede de uma unidade, e as ações quebram a linha. */}
              {['Data', 'Descrição', 'Cliente', ...(umaUnidade ? [] : ['Unidade']), 'Método', 'Tipo', 'Situação', 'Valor', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: h === 'Valor' ? 'right' : 'left',
                  fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTxs.slice(0, 100).map((t, i) => linhaDaTabela(t, i >= Math.min(visibleTxs.length, 100) - 1))}
          </tbody>
        </table>
        </div>
      )}
      {visibleTxs.length > 100 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--hairline)', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', textAlign: 'center' }}>
          Exibindo 100 de {visibleTxs.length} registros. Use o filtro de unidade para refinar.
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {aEstornar && (
        <ConfirmarEstorno alvo={aEstornar} estornando={estornando}
          onConfirmar={(motivo, voltou) => estornar(aEstornar.id, aEstornar.slug, motivo, voltou)} onVoltar={() => setAEstornar(null)}
          onDevolverParte={aEstornar.vendaDeProduto && !aEstornar.cancelarVenda ? () => { setADevolverParte(aEstornar.id); setAEstornar(null) } : undefined} />
      )}
      {aDevolverParte && <DevolverParteDaVenda transacaoId={aDevolverParte} onFechar={() => setADevolverParte(null)} />}
      {creditoAEstornar && (
        <EstornarVendaDeCredito transacaoId={creditoAEstornar.id} descricao={creditoAEstornar.descricao} onFechar={() => setCreditoAEstornar(null)} />
      )}
      {despesaAPagar && (
        <PagarDespesa descricao={despesaAPagar.descricao} valor={despesaAPagar.valor} pendente={estornando}
          aoConfirmar={f => marcarPago(despesaAPagar.id, despesaAPagar.slug, null, undefined, f)} aoFechar={() => setDespesaAPagar(null)} />
      )}
      {noCartao && (
        <ReceberNoCartao descricao={noCartao.descricao} metodo={noCartao.metodo} pending={estornando}
          valor={noCartao.valor}
          aoConfirmar={(b, v, f, m) => marcarPago(noCartao.id, noCartao.slug, b, v, f, m)} aoFechar={() => setNoCartao(null)} />
      )}

      {/* Header: título (esquerda) + período e o "Novo lançamento" (direita) — FI7: só ele no topo. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            {umaUnidade ? 'Financeiro' : 'Financeiro da Rede'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)', marginTop: 3 }}>
            {periodLabel} · {statDaUnidade
              ? statDaUnidade.name
              : `${branchStats.length} ${branchStats.length === 1 ? 'unidade' : 'unidades'}`}
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
              <input type="date" value={customF} onChange={e => setCustomF(e.target.value)} className="field" style={{ width: 140, fontSize: 'var(--text-sm-sz)', padding: '5px 10px' }} />
              <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>até</span>
              <input type="date" value={customT} onChange={e => setCustomT(e.target.value)} className="field" style={{ width: 140, fontSize: 'var(--text-sm-sz)', padding: '5px 10px' }} />
              <button type="button" className="btn-primary" style={{ fontSize: 'var(--text-sm-sz)', padding: '5px 12px' }} onClick={() => navigate('custom', customF, customT)}>
                Aplicar
              </button>
            </div>
          )}
          {/* Com o Financeiro em Ver, o botão aparecia e a recusa chegava em inglês (D7). */}
          {canWrite && <FinancialTransactionModal
            branches={branches.filter(b => b.ativa !== false)}
            trigger={
              <button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                <Plus size={15} />
                Novo lançamento
              </button>
            }
          />}
        </div>
      </div>

      {/* FI1: as cinco perguntas de quem cuida do dinheiro. */}
      <AbasDoFinanceiro base={base} atual={aba} manter={manter} comComissoes={comComissoes} />

      {/* -- Resumo (FI2): o período — entrou, saiu, resultado — e, embaixo, o que vem pela frente. */}
      {aba === 'resumo' && <>
        {/* A37 da 12ª: o resultado do período numa linha (sem esticar os vizinhos do
            "Resultado líquido", que tem a conta embaixo) e o em aberto noutra. */}
        <div className="kpi-grid" style={{ gap: 14, alignItems: 'start' }} data-aba-do-financeiro="resumo">
          <KpiCard
            chave="receita"
            label={statDaUnidade ? 'Receita da unidade' : 'Receita total'}
            value={fmtBRL(revenue)}
            delta={deltaRevenue}
            icon={<TrendingUp size={16} color={iconColor(true)} />}
            brand
          />
          {/* A24 da 10ª: o cartão é o CAIXA (com a compra de estoque e o pagamento das comissões). */}
          <KpiCard
            chave="despesas"
            label={statDaUnidade ? 'Despesas pagas da unidade (caixa)' : 'Despesas pagas (caixa)'}
            nota={<span style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)' }}>O que saiu do caixa, com a compra de estoque e o pagamento das comissões — o Resultado líquido usa a despesa operacional (veja a conta nele).</span>}
            value={fmtBRL(expenses)}
            delta={deltaExpenses}
            icon={<TrendingDown size={16} color="var(--brand)" />}
          />
          <KpiCard
            chave="resultado"
            label="Resultado líquido"
            value={fmtBRL(result)}
            nota={<ContaDoResultado receita={revenue} resultado={conta} despesasDoCaixa={expenses} aPagar={aPagar} />}
            icon={<Wallet size={16} color="var(--brand)" />}
          />
          <KpiCard
            chave="comissoes"
            label="Comissões"
            value={fmtBRL(commissions)}
            icon={<Users size={16} color="var(--brand)" />}
          />
        </div>

        {/* O que vem pela frente: o a receber e o a pagar, e o fluxo de caixa dos próximos meses. */}
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: -12 }}>
          O que vem pela frente
        </p>
        <div className="rg-3" style={{ gap: 14, alignItems: 'start' }}>
          {cartaoAReceber(false)}
          {cartaoDaOperadora(false)}
          {cartaoAPagar(false)}
        </div>
        {/* r2-fin-04: o fluxo de caixa dos próximos meses (o da unidade filtrada, ou o do recorte). */}
        {fluxoDeCaixa && (
          <FluxoDeCaixa meses={filterBranch === 'all' ? fluxoDeCaixa.total : (fluxoDeCaixa.porUnidade[filterBranch] ?? [])} />
        )}

        {/* Por unidade — só com mais de uma unidade (D-19). */}
        {!umaUnidade && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>Por unidade</span>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>{periodLabel}</span>
          </div>

          <div className="table-wrap">
          {/* Sete colunas nao cabem em 390px: no celular cada unidade vira um
              bloco de rotulo e valor, em vez de a tabela rolar dentro do card. */}
          <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Unidade', 'Receita', 'Despesas', 'Resultado', 'Comissões', 'Movim.', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: h === 'Unidade' ? 'left' : 'right',
                    fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)',
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
                    <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)' }}>{b.name}</span>
                  </td>
                  <td data-label="Receita" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--success)' }}>
                    {fmtBRL(b.revenue)}
                  </td>
                  <td data-label="Despesas" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
                    {fmtBRL(b.expenses)}
                  </td>
                  <td data-label="Resultado" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 700, color: b.result >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {fmtBRL(b.result)}
                  </td>
                  <td data-label="Comissões" data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
                    {fmtBRL(b.commissions)}
                  </td>
                  <td data-label="Movim." data-par style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)' }}>
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
                        fontSize: 'var(--text-2xs)', fontWeight: 700,
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
                <td style={{ padding: '13px 16px', fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total rede</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--success)' }}>{fmtBRL(totalRevenue)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text-muted)' }}>{fmtBRL(totalExpenses)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 800, color: totalResult >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtBRL(totalResult)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text-muted)' }}>{fmtBRL(totalCommissions)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text-faint)' }}>{totalMovimentacoes}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>{/* end table-wrap */}
        </div>
        )}
      </>}

      {/* -- A receber (FI3): das clientes (as atrasadas primeiro) e da operadora do cartão. */}
      {aba === 'a-receber' && <>
        <div className="rg-2" style={{ gap: 14, alignItems: 'start' }} data-aba-do-financeiro="a-receber">
          {cartaoAReceber(true)}
          {cartaoDaOperadora(true)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: -12 }}>
          <SegSelect
            ariaLabel="Quais a receber"
            value={soAsVencidas ? 'vencidas' : 'todas'}
            onSelect={k => startT(() => { router.push(daAba('a-receber', k === 'vencidas' ? { aberto: 'vencidas' } : {})) })}
            options={[{ key: 'todas', label: 'Todas' }, { key: 'vencidas', label: 'Só as vencidas' }]}
          />
        </div>
        <p data-so-o-em-aberto style={faixa}>
          {soAsVencidas
            ? 'Só as vencidas: o a receber em aberto com o vencimento antes de hoje, de qualquer mês.'
            : 'Todo o a receber em aberto, de qualquer vencimento — as atrasadas primeiro, as parcelas do crediário inclusive.'}{' '}
          {fraseDaBaixa}
        </p>
        {tabela('Das clientes')}
        {/* F2c: as parcelas que a operadora deposita, mês a mês. */}
        <ParcelasDaOperadora parcelas={parcelasVisiveis} podeMarcar={canWrite}
          unidades={umaUnidade ? undefined : Object.fromEntries(branches.map(b => [b.id, b.name]))} />
      </>}

      {/* -- A pagar (FI4): as despesas em aberto, a que vence primeiro no topo. */}
      {aba === 'a-pagar' && <>
        <div className="rg-3" style={{ gap: 14, alignItems: 'start' }} data-aba-do-financeiro="a-pagar">
          {cartaoAPagar(true)}
        </div>
        <p data-so-o-em-aberto style={faixa}>
          Todas as contas a pagar em aberto, de qualquer vencimento — a que vence primeiro no topo.{' '}
          {fraseDaBaixa}
        </p>
        {tabela('Contas a pagar')}
      </>}

      {/* -- Movimentações (FI5): o extrato do período, os CSVs e os avisos das taxas (CX6). */}
      {aba === 'movimentacoes' && <>
        {/* CX6: a venda sem taxa e as taxas estimadas do período (eram do Fechamento do dia). */}
        {taxasDoPeriodo && <AvisosDasTaxas dados={filterBranch === 'all' ? taxasDoPeriodo.total : taxasDoPeriodo.porUnidade[filterBranch]} />}
        <div data-aba-do-financeiro="movimentacoes">{tabela('Movimentações')}</div>
      </>}
    </div>
  )
}
