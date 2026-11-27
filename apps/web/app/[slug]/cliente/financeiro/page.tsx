import { situacaoDoVencimento, textoDoVencimento, emAbertoSemVencimento, SEM_VENCIMENTO } from '@/lib/financeiro/vencimentos'
import { getTenantContext, assertClient } from '@/lib/auth'
import { falaDaRedeDoPortal } from '@/lib/clientes/nome-da-rede'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getDoCliente, getCreditoInternoDoCliente } from '@/lib/metrics/unidade'
import { bonusDosCreditosDaCliente } from '@/lib/creditos/bonus-da-cliente'
import { formatBRL, formatDia } from '@estetica-os/utils'
import { formaDoLancamento } from '@/lib/financeiro/formas'
import { juntarAsFormasDaParcela, formaERecibosDaLinha } from '@/lib/financeiro/formas-da-parcela'
import { vendaDeProdutoNaoPontua } from '@/lib/fidelidade/leitura'
import { ordemDosPagamentosDoApp } from '@/lib/clientes/ordem-dos-pagamentos'
import { notaDoEstornoParcialParaACliente } from '@/lib/financeiro/notas-do-lancamento'
import { nomeDoPlanoNoApp, descontoDoPlanoNoApp } from '@/lib/plano-de-tratamento/nome'
import { fusoValido } from '@/lib/unidades/fuso'
import { getAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { Dica } from '@/components/shared/dica'
import { nomeDaLinhaDoLancamento, nomeDaLinhaDoPlano } from '@/lib/financeiro/nome-da-parcela'
import { procedimentosDosPlanos } from '@/lib/financeiro/procedimentos-do-plano'

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
  /** A forma pronta: a parcela do crediário sem meio é "Com a clínica" (D6 da 6ª simulação); a parcela em várias formas, as formas (D8 da 36ª). */
  forma:          string | null
  /** D8 da 36ª (CR-07): o recibo de cada forma da parcela (uma forma: um recibo, sem rótulo). */
  recibos:        { id: string; forma: string | null }[]
  /** A4 da 36ª (princípio 3): o em aberto sem data diz "Sem vencimento", não a criação. */
  semVencimento:  boolean
  /** A40: a venda de produto paga que não pontua (fidelidade ligada, produto sem pontos). */
  semPontos:      boolean
  /** A46: o estorno devolvido à cliente (a contra-transação): saiu, com o sinal. */
  estorno:        boolean
  /** A46: o pagamento de um pacote cancelado — o dia do cancelamento. */
  pacoteCancelado: string | null
  /** D4 da 9ª: o pagamento de um plano cancelado — o dia do cancelamento, como o do pacote. */
  planoCancelado: string | null
  /** A57 da 12ª: o pagamento estornado em parte — "R$ 300,00 pagos · R$ 136,36 devolvidos". */
  devolvidoEmParte: string | null
  /** A55 da 12ª: o lançamento de um plano diz o nome que a clínica deu (e o desconto do plano). */
  plano:          string | null
}

/** Lançamento como o select pede, com o procedimento do agendamento (se houver). */
type LancamentoLido = {
  id: string; description: string; amount: number | string; payment_method: string | null; cartao_vezes: number | null
  is_paid: boolean; paid_at: string | null; created_at: string; notes: string | null; parcela_numero: number | null
  parcela_total: number | null
  treatment_plan_id: string | null
  due_date: string | null; data_de_referencia: string | null
  cartao_bandeira: string | null; product_sale_id: string | null
  type: string; category: string | null; client_packages: { cancelado_em: string | null } | null
  treatment_plans: { cancelado_em: string | null; name: string | null; desconto: number | string | null } | null
  valor_antes_do_estorno: number | string | null
  appointments: { procedures: { name: string } | null } | null
}

export default async function ClientFinancialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { credito: creditoNaRede } = await falaDaRedeDoPortal(slug)
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  // O dia no relógio da unidade do endereço (F62b).
  const fuso = fusoValido((await ler(admin.from('branches').select('fuso').eq('slug', slug).maybeSingle(),
    'buscar o fuso da unidade') as { fuso: string | null } | null)?.fuso)

  const data = await ler(admin
    .from('financial_transactions')
    .select(`
      id, description, amount, payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_at, notes, parcela_numero, parcela_total, product_sale_id, treatment_plan_id,
      due_date, data_de_referencia, valor_antes_do_estorno,
      type, category, client_packages(cancelado_em), treatment_plans(cancelado_em, name, desconto),
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
  // A5 da 31ª (princípio 3): a parcela do plano diz os procedimentos dele, como no PDV.
  const dosPlanos = await procedimentosDosPlanos((data ?? []).map(r => (r as { treatment_plan_id: string | null }).treatment_plan_id))
  // D8 da 36ª (CR-07): a parcela paga em várias formas é UMA linha, como na equipe.
  const rows: TxRow[] = juntarAsFormasDaParcela((data ?? []) as unknown as LancamentoLido[]).map(r => ({
    id:             r.id,
    description:    r.description,
    amount:         Number(r.amount),
    payment_method: r.payment_method,
    cartao_vezes: r.cartao_vezes,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at,
    created_at:     r.created_at,
    vencimento:     r.is_paid || r.notes === 'Estornada' ? null : (r.due_date ?? r.data_de_referencia ?? null),
    semVencimento:  emAbertoSemVencimento({ pago: Boolean(r.is_paid), vencimento: r.due_date, estornado: r.notes === 'Estornada' }),
    referencia:     r.data_de_referencia ?? r.paid_at ?? r.created_at,
    // A16 da 30ª (CR-05, AC-01): a parcela do crediário diz qual é ("Microagulhamento — parcela 2/3").
    procedure_name: nomeDaLinhaDoLancamento(r.appointments?.procedures?.name, { numero: r.parcela_numero, total: r.parcela_total, descricao: r.description })
      ?? (r.treatment_plan_id ? nomeDaLinhaDoPlano(dosPlanos.get(r.treatment_plan_id) ?? [], r.description) : null),
    estornado:      r.notes === 'Estornada',
    ...formaERecibosDaLinha(r, formaDoLancamento({ metodo: r.payment_method, vezes: r.cartao_vezes, bandeira: r.cartao_bandeira, pago: Boolean(r.is_paid), parcela: r.parcela_numero })),
    semPontos:      produtoNaoPontua && !!r.product_sale_id && Boolean(r.is_paid) && r.notes !== 'Estornada',
    estorno:        r.type === 'EXPENSE' && r.category === 'Estorno',
    pacoteCancelado: r.client_packages?.cancelado_em ?? null,
    planoCancelado:  r.treatment_plans?.cancelado_em ?? null,
    plano: r.treatment_plans
      ? `Plano “${nomeDoPlanoNoApp(r.treatment_plans.name)}”${descontoDoPlanoNoApp(r.treatment_plans.desconto) ? ` · ${descontoDoPlanoNoApp(r.treatment_plans.desconto)!.replace(/^Com /, 'com ')} no total` : ''}`
      : null,
    devolvidoEmParte: r.type === 'INCOME' && r.category !== 'Estorno'
      ? notaDoEstornoParcialParaACliente({ type: r.type, amount: r.amount, is_paid: Boolean(r.is_paid), notes: r.notes, valor_antes_do_estorno: r.valor_antes_do_estorno })
      : null,
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
  const [{ ltv: total }, credito, bonus, aReceber] = await Promise.all([
    getDoCliente(ficha.tenant_id as string, ctx.clientId!),
    getCreditoInternoDoCliente(ficha.tenant_id as string, ctx.clientId!),
    // A20 da 11ª: "R$ 500,00 pagos + R$ 50,00 de bônus" ao lado do saldo.
    bonusDosCreditosDaCliente(ficha.tenant_id as string, ctx.clientId!),
    // A14 da 16ª (princípio 3): o atendimento concluído e não pago (sem
    // lançamento) também é dela a pagar — o Histórico já o mostrava, e o
    // Financeiro dizia "Nenhuma transação". A mesma conta (`atendimentos_a_receber`).
    getAtendimentosAReceber({ tenantId: ficha.tenant_id as string, clienteId: ctx.clientId! }),
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
            {/* O uso do crédito mora na dica (docs/regras/design.md). */}
            <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{creditoNaRede}</span>
              <Dica rotulo="Como usar o crédito">Use como forma de pagamento nos próximos atendimentos.</Dica>
            </p>
            {bonus.map((b, i) => (
              <p key={i} data-bonus-do-credito style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Crédito comprado: {b}.</p>
            ))}
          </div>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--success)', letterSpacing: '-0.01em' }}>
            {formatBRL(credito)}
          </p>
        </div>
      )}

      {aReceber.itens.length > 0 && (
        <div data-a-pagar-na-unidade style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {aReceber.itens.map(a => (
            <div key={a.appointmentId} className="card" style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)', marginBottom: 2 }}>
                  {a.procedureName ?? 'Atendimento'}
                </p>
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                  {new Date(a.completedAt ?? a.scheduledAt).toLocaleDateString('pt-BR', { timeZone: fuso })}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                  {formatBRL(a.price)}
                </p>
                <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--warning)' }}>A pagar na unidade</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && aReceber.itens.length === 0 && (
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
                {/* D13 da 9ª: a vencida diz que venceu (era só "Pendente"). A4 da 36ª: o sem data diz que não tem. */}
                {r.semVencimento
                  ? SEM_VENCIMENTO
                  : r.vencimento && !r.is_paid && !r.estornado && situacaoDoVencimento(r.vencimento, new Date(), fuso) === 'VENCIDA'
                  ? textoDoVencimento(r.vencimento, new Date(), fuso)
                  : r.vencimento
                  ? `Vence ${formatDia(r.vencimento)}`
                  : new Date(r.paid_at ?? r.created_at).toLocaleDateString('pt-BR', { timeZone: fuso })}
                {r.forma && ` · ${r.forma}`}
              </p>
              {r.plano && (
                <p data-plano-do-lancamento style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>{r.plano}</p>
              )}
              {r.pacoteCancelado && (
                <p data-pacote-cancelado style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 2 }}>
                  Pacote cancelado em {new Date(r.pacoteCancelado).toLocaleDateString('pt-BR', { timeZone: fuso })}
                </p>
              )}
              {r.planoCancelado && (
                <p data-plano-cancelado style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 2 }}>
                  Plano cancelado em {new Date(r.planoCancelado).toLocaleDateString('pt-BR', { timeZone: fuso })}
                </p>
              )}
              {r.devolvidoEmParte && (
                <p data-devolvido-em-parte style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>{r.devolvidoEmParte}</p>
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
                color:      r.estornado || r.estorno ? 'var(--text-muted)' : r.is_paid ? 'var(--success)'
                  : !r.semVencimento && r.vencimento && situacaoDoVencimento(r.vencimento, new Date(), fuso) === 'VENCIDA' ? 'var(--danger)' : 'var(--warning)',
              }}>
                {r.estorno ? 'Estorno' : r.estornado ? 'Estornado' : r.is_paid ? 'Pago'
                  : !r.semVencimento && r.vencimento && situacaoDoVencimento(r.vencimento, new Date(), fuso) === 'VENCIDA' ? 'Vencida' : 'Pendente'}
              </span>
              {/* ven-06: o recibo do que ela pagou (PDF) — um por forma (D8 da 36ª, CR-07). */}
              {r.is_paid && !r.estornado && !r.estorno && r.recibos.map(rec => (
                <a key={rec.id} href={`/api/recibos/${rec.id}`} target="_blank" rel="noopener" data-recibo
                  style={{ display: 'block', marginTop: 4, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)' }}>
                  {rec.forma ? `Recibo (${rec.forma})` : 'Recibo'}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
