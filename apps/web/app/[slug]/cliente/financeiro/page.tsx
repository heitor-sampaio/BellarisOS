import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getDoCliente, getCreditoInternoDoCliente } from '@/lib/metrics/unidade'
import { formatBRL, formatDia } from '@estetica-os/utils'
import { formaDoLancamento } from '@/lib/financeiro/formas'
import { vendaDeProdutoNaoPontua } from '@/lib/fidelidade/leitura'
import { ordemDosPagamentosDoApp } from '@/lib/clientes/ordem-dos-pagamentos'

type TxRow = {
  id:             string
  description:    string
  amount:         number
  payment_method: string | null
  cartao_vezes: number | null
  is_paid:        boolean
  paid_at:        string | null
  created_at:     string
  /** D4 da 7ª: o vencimento do pendente (AAAA-MM-DD…), o `due_date` ou a data de referência. */
  vencimento:     string | null
  /** A data de referência (pago: o pagamento; em aberto: o vencimento) — a ordem da lista. */
  referencia:     string
  procedure_name: string | null
  /** Estornado (`notes = 'Estornada'`): o dinheiro voltou à cliente (D6, 2026-10-28). */
  estornado:      boolean
  /** A forma pronta: a parcela do crediário sem meio é "Com a clínica" (D6 da 6ª simulação). */
  forma:          string | null
  /** A40: a venda de produto paga que não pontua (fidelidade ligada, produto sem pontos). */
  semPontos:      boolean
  /** A46: o estorno devolvido à cliente (a contra-transação): saiu, com o sinal. */
  estorno:        boolean
  /** A46: o pagamento de um pacote cancelado — o dia do cancelamento. */
  pacoteCancelado: string | null
}

/** Lançamento como o select pede, com o procedimento do agendamento (se houver). */
type LancamentoLido = {
  id: string; description: string; amount: number | string; payment_method: string | null; cartao_vezes: number | null
  is_paid: boolean; paid_at: string | null; created_at: string; notes: string | null; parcela_numero: number | null
  due_date: string | null; data_de_referencia: string | null
  cartao_bandeira: string | null; product_sale_id: string | null
  type: string; category: string | null; client_packages: { cancelado_em: string | null } | null
  appointments: { procedures: { name: string } | null } | null
}

export default async function ClientFinancialPage() {
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  const data = await ler(admin
    .from('financial_transactions')
    .select(`
      id, description, amount, payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_at, notes, parcela_numero, product_sale_id,
      due_date, data_de_referencia,
      type, category, client_packages(cancelado_em),
      appointments(procedures(name))
    `)
    // Pela ficha, não pelo agendamento: o pagamento de um plano não tem
    // agendamento, e ficava fora da lista do próprio cliente.
    .eq('client_id', ctx.clientId!)
    // A46: o estorno devolvido a ela também aparece (era só a receita).
    .or('type.eq.INCOME,category.eq.Estorno')
    .order('created_at', { ascending: false }), 'carregar os lançamentos do cliente')

  // A40: com a fidelidade ligada e o produto sem pontos, a venda diz por quê.
  const fichaDaRede = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).single(), 'buscar o cliente')
  const produtoNaoPontua = fichaDaRede ? await vendaDeProdutoNaoPontua(fichaDaRede.tenant_id as string, admin) : false
  const rows: TxRow[] = ((data ?? []) as unknown as LancamentoLido[]).map(r => ({
    id:             r.id,
    description:    r.description,
    amount:         Number(r.amount),
    payment_method: r.payment_method,
    cartao_vezes: r.cartao_vezes,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at,
    created_at:     r.created_at,
    vencimento:     r.is_paid || r.notes === 'Estornada' ? null : (r.due_date ?? r.data_de_referencia ?? null),
    referencia:     r.data_de_referencia ?? r.paid_at ?? r.created_at,
    procedure_name: r.appointments?.procedures?.name ?? null,
    estornado:      r.notes === 'Estornada',
    forma:          formaDoLancamento({ metodo: r.payment_method, vezes: r.cartao_vezes, bandeira: r.cartao_bandeira, pago: Boolean(r.is_paid), parcela: r.parcela_numero }),
    semPontos:      produtoNaoPontua && !!r.product_sale_id && Boolean(r.is_paid) && r.notes !== 'Estornada',
    estorno:        r.type === 'EXPENSE' && r.category === 'Estorno',
    pacoteCancelado: r.client_packages?.cancelado_em ?? null,
  }))
    // D4 da 7ª simulação: as parcelas apareciam com a data de CRIAÇÃO (todas
    // 05/11) e na ordem 3/3, 2/3, 1/3. O que falta pagar vem primeiro, pela
    // próxima a vencer; o resto, do mais recente para o mais antigo (o dia do
    // pagamento — a data de referência).
    .sort(ordemDosPagamentosDoApp)

  // O total é o LTV do cliente, do banco (pago, sem estorno) — a mesma conta
  // da ficha dele na clínica. Somar a lista aqui contava o estornado.
  const ficha = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).single(), 'buscar o cliente')
  if (!ficha) throw new Error('Cadastro do cliente não encontrado.')
  // O crédito interno é o da ficha DESTA clínica (ctx.clientId é a do
  // endereço, §5): D-17, 2026-10-30.
  const [{ ltv: total }, credito] = await Promise.all([
    getDoCliente(ficha.tenant_id as string, ctx.clientId!),
    getCreditoInternoDoCliente(ficha.tenant_id as string, ctx.clientId!),
  ])

  return (
    <div>
      <h1 style={{
        fontSize:      'clamp(20px, 4vw, 26px)',
        fontWeight:    800,
        color:         'var(--text)',
        letterSpacing: '-0.02em',
        marginBottom:  24,
      }}>
        Financeiro
      </h1>

      {/* KPI */}
      <div className="card" style={{ padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>Total investido</p>
        <p style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.02em' }}>
          R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {/* Crédito interno (D-17): só quando há saldo — zero não é informação. */}
      {credito > 0 && (
        <div data-credito-interno className="card" style={{ padding: '16px 22px', marginTop: -12, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>Crédito na clínica</p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Use como forma de pagamento nos próximos atendimentos.</p>
          </div>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--success)', letterSpacing: '-0.01em' }}>
            {formatBRL(credito)}
          </p>
        </div>
      )}

      {rows.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-base-sz)', padding: '48px 0' }}>
          Nenhuma transação encontrada.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.id} data-estorno={r.estorno || undefined} className="card" style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)', marginBottom: 2 }}>
                {r.procedure_name ?? r.description}
              </p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                {r.vencimento
                  ? `Vence ${formatDia(r.vencimento)}`
                  : new Date(r.paid_at ?? r.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {r.forma && ` · ${r.forma}`}
              </p>
              {r.pacoteCancelado && (
                <p data-pacote-cancelado style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 2 }}>
                  Pacote cancelado em {new Date(r.pacoteCancelado).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
              )}
              {r.semPontos && (
                <p data-sem-pontos style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 2 }}>Venda de produto não pontua</p>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <p style={{
                fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.01em',
                color: r.estornado ? 'var(--text-faint)' : 'var(--text)',
                textDecoration: r.estornado ? 'line-through' : undefined,
              }}>
                {r.estorno ? '− ' : ''}R$ {r.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              {/* O estornado não é "Pago": o dinheiro voltou (D6, 2026-10-28), e
                  o Total investido acima já não o conta. */}
              <span style={{
                fontSize: 'var(--text-overline)',
                fontWeight: 700,
                color:      r.estornado || r.estorno ? 'var(--text-muted)' : r.is_paid ? 'var(--success)' : 'var(--warning)',
              }}>
                {r.estorno ? 'Estorno' : r.estornado ? 'Estornado' : r.is_paid ? 'Pago' : 'Pendente'}
              </span>
              {/* ven-06: o recibo do que ela pagou (PDF). */}
              {r.is_paid && !r.estornado && !r.estorno && (
                <a href={`/api/recibos/${r.id}`} target="_blank" rel="noopener" data-recibo
                  style={{ display: 'block', marginTop: 4, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)' }}>
                  Recibo
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
