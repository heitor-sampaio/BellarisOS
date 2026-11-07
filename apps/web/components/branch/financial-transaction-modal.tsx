'use client'

import { useRef, useCallback, useActionState, useEffect, useState, useMemo, isValidElement } from 'react'
import { X, TrendingUp, TrendingDown, Tag, CalendarClock } from 'lucide-react'
import { createTransactionAdvanced } from '@/actions/financial'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { dayKeyTZ } from '@/lib/datetime'
import { CATEGORIAS_DE_RECEITA, CATEGORIAS_DE_DESPESA } from '@/lib/financeiro/categorias'
import { CampoDaBandeira } from '@/components/shared/campo-da-bandeira'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'

interface Props {
  branchId?:  string
  slug?:      string
  /** Modo admin: lista de filiais para o seletor */
  branches?:  { id: string; name: string; slug: string }[]
  trigger?:   React.ReactNode
}

type TxType = 'INCOME' | 'EXPENSE'

// As listas são as do lançamento (lib/financeiro/categorias), com a "Compra de
// estoque": fica no caixa e fora do lucro (2026-10-29).
const INCOME_CATEGORIES:  readonly string[] = CATEGORIAS_DE_RECEITA
const EXPENSE_CATEGORIES: readonly string[] = CATEGORIAS_DE_DESPESA

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'PIX',
  DEBIT_CARD:      'Cartão de débito',
  CREDIT_CARD:     'Cartão de crédito',
  INTERNAL_CREDIT: 'Crédito interno',
  // A14 da 9ª: o Boleto, só na despesa (a luz, o aluguel).
  BOLETO:          'Boleto',
}

/** `htmlFor` liga o rótulo ao campo (2026-10-21: soltos, o leitor de tela não os ligava). */
function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{
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
  // Uma unidade só: ela já vem escolhida, e a pergunta some (F8).
  const unica = branches?.length === 1 ? branches[0]! : null
  const [selectedBranchId,   setSelectedBranchId]   = useState(branchId ?? unica?.id ?? '')
  const [selectedBranchSlug, setSelectedBranchSlug] = useState(slug ?? unica?.slug ?? '')
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
  // r4-f15-02: a forma (para saber se é cartão) e a bandeira, opcional.
  const [formaDePagamento, setFormaDePagamento] = useState('')
  const [bandeira,         setBandeira]         = useState('')
  // F16-5: as vezes no crédito da receita paga (até o limite da clínica, D-15).
  const [vezesNoCartao,    setVezesNoCartao]    = useState(1)
  const opcoesDeVezes = useOpcoesDeVezes()
  const creditoPago = type === 'INCOME' && isPaid && formaDePagamento === 'CREDIT_CARD'

  const [state, formAction, pending] = useActionState(createTransactionAdvanced, undefined)
  // A chave do envio (D10): o duplo clique lança uma vez só.
  const envio = useEnvioUnico()
  // Hoje no fuso da clínica, lido ao abrir (o "agora" muda entre aberturas).
  const [hojeBR, setHojeBR] = useState(() => dayKeyTZ(new Date()))

  const grossAmount    = parsePtBR(rawAmount)
  const discountNumber = parsePtBR(discountVal)

  // Desconto é de VENDA: a despesa é o que se pagou (J-50, 2026-10-30), e o
  // desconto digitado na receita não vaza quando a pessoa troca o tipo.
  const { discountAmt, finalAmount } = useMemo(() => {
    if (type === 'EXPENSE' || discountNumber <= 0 || grossAmount <= 0) return { discountAmt: 0, finalAmount: grossAmount }
    const disc = discountType === 'percent'
      ? grossAmount * (discountNumber / 100)
      : discountNumber
    const discAmt = Math.min(disc, grossAmount)
    return { discountAmt: discAmt, finalAmount: Math.max(0, grossAmount - discAmt) }
  }, [grossAmount, discountNumber, discountType, type])

  const hasDiscount = discountAmt > 0

  const open = useCallback(() => {
    formRef.current?.reset()
    setHojeBR(dayKeyTZ(new Date()))
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
    setFormaDePagamento('')
    setBandeira('')
    setVezesNoCartao(1)
    if (!isAdminMode) {
      setSelectedBranchId(branchId ?? '')
      setSelectedBranchSlug(slug ?? '')
    } else {
      // Uma unidade só: a pergunta some (F8), e a unidade continua escolhida.
      // Zerar aqui deixava o lançamento sem unidade ("Unidade não identificada.").
      setSelectedBranchId(unica?.id ?? '')
      setSelectedBranchSlug(unica?.slug ?? '')
    }
    dialogRef.current?.showModal()
  }, [isAdminMode, branchId, slug, unica])
  const close = useCallback(() => dialogRef.current?.close(), [])

  useEffect(() => {
    if (state?.success) { envio.renovar(); close() }
  }, [state?.success, close, envio])

  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <>
      {/* O clique no gatilho sobe até aqui. `display: contents` tira a caixa do
          invólucro do layout: o botão continua filho direto do flex da barra. */}
      {trigger && isValidElement(trigger) && (
        <span style={{ display: 'contents' }} onClick={open}>{trigger}</span>
      )}

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
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
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
          <form ref={formRef} action={fd => { fd.set('_envio', envio.chave()); formAction(fd) }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input type="hidden" name="_branchId" value={selectedBranchId} />
            <input type="hidden" name="_slug"     value={selectedBranchSlug} />

            {/* Seletor de filial — apenas no modo admin */}
            {isAdminMode && !unica && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label>Unidade *</Label>
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
                  <option value="">Selecione a unidade…</option>
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
                  INCOME:  { label: 'Receita',  icon: <TrendingUp  size={15} />, color: 'var(--success)', soft: 'var(--success-bg)', border: 'var(--success-border)' },
                  EXPENSE: { label: 'Despesa',   icon: <TrendingDown size={15} />, color: 'var(--danger)', soft: 'var(--danger-soft)', border: 'var(--danger-border)' },
                }[t]
                return (
                  <button key={t} type="button" onClick={() => setType(t)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 'var(--text-base-sz)',
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
              <Label htmlFor="lanc-descricao">Descrição *</Label>
              <input id="lanc-descricao" name="description" type="text" required className="field"
                placeholder={type === 'INCOME' ? 'Ex: Venda de produto — cliente Maria' : 'Ex: Pagamento de aluguel — maio'} />
            </div>

            {/* Categoria + Valor bruto */}
            <div className="form-2col">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label htmlFor="lanc-categoria">Categoria *</Label>
                <select id="lanc-categoria" name="category" required className="field" key={type}>
                  <option value="">Selecione…</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label htmlFor="lanc-valor">{type === 'INCOME' ? 'Valor bruto (R$) *' : 'Valor (R$) *'}</Label>
                <input
                  id="lanc-valor" type="number" step="0.01" min="0.01" required className="field"
                  placeholder="0,00"
                  value={rawAmount}
                  onChange={e => setRawAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Desconto — só na receita: na despesa não há o que descontar (J-50). */}
            {type === 'INCOME' && (
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
                        padding: '8px 12px', fontSize: 'var(--text-sm-sz)', fontWeight: 800,
                        cursor: 'pointer', border: 'none', transition: 'all 80ms',
                        background: discountType === dt ? 'var(--brand)' : 'var(--surface)',
                        color:      discountType === dt ? 'var(--on-brand)' : 'var(--text-muted)',
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
            )}

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
                  <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>Valor final</span>
                  {hasDiscount && (
                    <span style={{
                      fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)',
                      textDecoration: 'line-through',
                    }}>
                      {fmtBRL(grossAmount)}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.02em',
                  color: hasDiscount ? 'var(--brand)' : 'var(--text)',
                }}>
                  {fmtBRL(finalAmount)}
                  {hasDiscount && (
                    <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--brand)', marginLeft: 6, opacity: 0.8 }}>
                      − {fmtBRL(discountAmt)}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Hidden amount com valor final calculado */}
            <input type="hidden" name="amount" value={finalAmount > 0 ? finalAmount.toFixed(2) : ''} />

            {/* Forma de pagamento — também na despesa (2026-10-21: a
                simulação não tinha onde dizer como pagou o fornecedor). */}
            {(
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label htmlFor="lanc-forma">Forma de pagamento</Label>
                <select id="lanc-forma" name="payment_method" className="field"
                  value={formaDePagamento} onChange={e => setFormaDePagamento(e.target.value)}>
                  <option value="">Não informado</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).filter(([v]) => v !== 'BOLETO' || type === 'EXPENSE').map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            )}

            {/* r4-f15-02 (o Heitor, revisão das decisões da F15): a receita paga no
                cartão diz a bandeira, opcional — o mesmo campo dos outros lugares,
                com o mesmo efeito no prazo e na taxa. Vazia, a regra geral. Em
                aberto, a bandeira é perguntada na baixa ("Receber no cartão"). */}
            {type === 'INCOME' && isPaid && (
              <CampoDaBandeira metodo={formaDePagamento} valor={bandeira} aoMudar={setBandeira} name="cartao_bandeira" gap={5}
                rotuloComoLabel="" estiloDoRotulo={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }} />
            )}

            {/* F16-5 (o Heitor: "ajuste isso para permitir escolher parcelas"): a
                receita PAGA no crédito escolhe as vezes, até o limite da clínica.
                É UM pagamento — a cliente pagou tudo agora — que a OPERADORA
                deposita em N parcelas, com o prazo e a taxa da bandeira; não é o
                "Parcelado" da despesa nem o crediário da clínica. Débito, 1x; o
                pendente diz as vezes na baixa. */}
            {creditoPago && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label htmlFor="lanc-vezes">Vezes no cartão</Label>
                <select id="lanc-vezes" name="cartao_vezes" className="field"
                  value={String(vezesNoCartao)} onChange={e => setVezesNoCartao(Number(e.target.value))}>
                  {opcoesDeVezes.map(n => <option key={n} value={String(n)}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
                </select>
                <DicaDasVezes total={finalAmount} vezes={vezesNoCartao} opcoes={opcoesDeVezes} />
                {vezesNoCartao > 1 && (
                  <span data-credito-em-vezes style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Um pagamento só: a cliente pagou tudo agora, e a operadora deposita em {vezesNoCartao} parcelas
                    (no “A receber da operadora”). Não é um parcelamento da cliente com a clínica.
                  </span>
                )}
                <AvisoDaTaxa vezes={vezesNoCartao} bandeira={bandeira} total={finalAmount} />
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
                      fontSize: 'var(--text-sm-sz)', fontWeight: 700, transition: 'all 100ms',
                      border: isPaid === v ? (v ? '1.5px solid var(--success)' : '1.5px solid var(--warning)') : '1px solid var(--border)',
                      background: isPaid === v ? (v ? 'var(--success-bg)' : 'var(--warning-soft)') : 'var(--surface)',
                      color: isPaid === v ? (v ? 'var(--success)' : 'var(--warning)') : 'var(--text-muted)',
                    }}>
                      {v ? 'Pago' : 'Pendente'}
                    </button>
                  ))}
                </div>
              </div>
              {/* A data do pagamento (2026-10-21, decisão do Heitor): era sempre
                  "agora", e a conta paga na semana passada caía no caixa de hoje. */}
              {isPaid && scheduleMode === 'single' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor="lanc-pago-em">Data do pagamento</Label>
                  <input id="lanc-pago-em" name="paid_on" type="date" className="field"
                    key={hojeBR} defaultValue={hojeBR} max={hojeBR} required />
                </div>
              )}
              {/* A14 da 9ª: a despesa parcelada (ou recorrente) tem o vencimento da 1ª abaixo — um campo só. */}
              {!isPaid && (type !== 'EXPENSE' || scheduleMode === 'single') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor="lanc-vencimento">Vencimento</Label>
                  <input id="lanc-vencimento" name="due_date" type="date" className="field" />
                </div>
              )}
            </div>

            {/* Observações */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Label htmlFor="lanc-obs">Observações</Label>
              <textarea id="lanc-obs" name="notes" rows={2} className="field"
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
                        fontSize: 'var(--text-sm-sz)', fontWeight: 700, transition: 'all 100ms',
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
                      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontWeight: 700 }}>
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
                      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontWeight: 700 }}>
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
              <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 'var(--text-sm-sz)', fontWeight: 700 }}>
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
