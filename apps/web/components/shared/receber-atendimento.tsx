'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import { confirmPayment, previaDoPagamento } from '@/actions/appointments'
import { abaterDoPacote } from '@/actions/a-receber'
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'
import { formatarPontos } from '@/lib/fidelidade/formato'
import { CampoDoDesconto, LembreteDoMotivo, contaDoDesconto, descontoDoEstado, estadoDoDesconto } from '@/components/shared/campo-do-desconto'
import { JanelaModal } from '@/components/shared/janela-modal'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { CampoDaBandeira, CampoDaMaquininha, useFaltaAMaquininha } from '@/components/shared/campo-da-bandeira'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { SaldoDoCredito } from '@/components/shared/saldo-do-credito'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { FormasDePagamento, FORMAS_DO_BALCAO } from '@/components/shared/formas-de-pagamento'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/**
 * Receber um atendimento: a forma (com as vezes, a bandeira e a maquininha do
 * cartão), o desconto, o voucher e os pontos — a mesma conta que o servidor
 * refaz em `confirmPayment`. Mora aqui desde o PDV (2026-11-13): a comanda do
 * atendimento recebe por ele, e a janela "Confirmar pagamento" da tela do
 * atendimento também, até sair (PDV7).
 */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Uma sessão livre de pacote da cliente, do mesmo procedimento do atendimento. */
export interface PacoteParaAbater { sessaoId: string; pacote: string; restantes: number; preco: number }

/**
 * "Abater do pacote" (D9 da simulação de 2026-10-28): a cliente tem pacote
 * com sessão sobrando do MESMO procedimento — o atendimento vira uma sessão
 * dele, sem cobrança nova. Fica no topo do recebimento: é a primeira
 * pergunta (cobrar ou não), antes da forma de pagamento.
 */
function AbaterDoPacote({ appointmentId, pacotes, onFeito }: {
  appointmentId: string; pacotes: PacoteParaAbater[]; onFeito: () => void
}) {
  const [gravando, setGravando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function abater(sessaoId: string) {
    setGravando(sessaoId); setErro(null)
    const r = await abaterDoPacote(appointmentId, sessaoId)
    setGravando(null)
    if (r.error) { setErro(r.error); return }
    onFeito()
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pacotes.map(p => (
        <div key={p.sessaoId} data-abater-do-pacote style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
          borderRadius: 'var(--radius-row)', padding: '12px 14px',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{p.pacote}</p>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              {p.restantes} {p.restantes === 1 ? 'sessão sobrando' : 'sessões sobrando'} deste procedimento · a sessão vale {brl(p.preco)} no pacote
            </p>
          </div>
          <button type="button" className="btn-primary" disabled={gravando !== null} onClick={() => abater(p.sessaoId)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {gravando === p.sessaoId ? <Loader2 size={13} className="animate-spin" /> : null}
            Abater do pacote
          </button>
        </div>
      ))}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
        Abater usa uma sessão do pacote e não cobra nada. Para cobrar avulso, siga abaixo.
      </p>
    </div>
  )
}

export interface ReceberAtendimentoProps {
  appointmentId: string
  slug:          string
  price:         number
  /** A cliente: com o crédito na clínica escolhido, o saldo dela e o que sobra (A36 da 8ª). */
  clienteId?:    string
  /** O pagamento combinado no contrato do procedimento: o meio (e o desconto) já vêm escolhidos. */
  pagamentoCombinado?: { metodo: string | null; rotulo: string; desconto?: number } | null
  /** Sessões de pacote da cliente que podem pagar este atendimento (D9). */
  pacotesParaAbater?: PacoteParaAbater[]
}

/**
 * O formulário do recebimento. `emBlocos`: a forma em blocos com ícone e o
 * botão "Receber R$ X" (o PDV); sem ele, a lista e "Confirmar pagamento" (a
 * janela da tela do atendimento).
 */
export function FormularioDeReceberAtendimento({
  appointmentId, slug, price, pagamentoCombinado, pacotesParaAbater = [], clienteId, onFeito, onVoltar, emBlocos = false, onPendente,
}: ReceberAtendimentoProps & {
  onFeito:   () => void
  onVoltar?: () => void
  emBlocos?: boolean
  /** Enquanto grava: a janela não fecha no meio. */
  onPendente?: (gravando: boolean) => void
}) {
  // A37 da 6ª simulação: a forma nasce VAZIA (o Pix era o padrão calado, e o
  // ?receber=1 abre esta janela sozinha — um clique gravava no Pix). Só o meio
  // combinado no contrato vem escolhido.
  const metodoInicial = (FORMAS_DO_BALCAO as readonly string[]).includes(pagamentoCombinado?.metodo ?? '') ? pagamentoCombinado!.metodo! : ''
  // Controlado só para saber se é crédito: aí aparecem as vezes na maquininha.
  const [metodoEscolhido, setMetodoEscolhido] = useState(metodoInicial)
  const [vezes, setVezes] = useState(1)
  // r3-f13-01: a bandeira do cartão, opcional (vazia = a regra geral).
  const [bandeira, setBandeira] = useState('')
  // C75: "Qual maquininha?" (só com mais de uma na rede).
  const [maquininha, setMaquininha] = useState('')
  const faltaAMaquininha = useFaltaAMaquininha(metodoEscolhido, maquininha)
  // Até quantas vezes a maquininha parcela no crédito (D-15).
  const opcoesDeVezes = useOpcoesDeVezes(maquininha)
  const [state, action, pending] = useActionState(confirmPayment, null)
  // Pontos de fidelidade: só aparecem com o programa ligado e saldo positivo
  // (`previaDoPagamento` devolve nulo fora disso). A conta mostrada aqui é a
  // mesma que o servidor refaz — o valor que sai do navegador não é usado.
  const [previa, setPrevia] = useState<Awaited<ReturnType<typeof previaDoPagamento>>>(null)
  const [pontos, setPontos] = useState('')
  const [voucherId, setVoucherId] = useState('')
  // Desconto comercial (2026-09-30): o combinado no contrato já vem preenchido.
  const [descontoEstado, setDescontoEstado] = useState(() => estadoDoDesconto(pagamentoCombinado?.desconto))
  // O motivo do desconto, controlado: sem ele, a janela lembra que existe (A49 da 7ª).
  const [motivoDoDesconto, setMotivoDoDesconto] = useState('')
  useEffect(() => {
    let vivo = true
    previaDoPagamento(appointmentId).then(r => { if (vivo) setPrevia(r) }).catch(() => { /* sem pontos a oferecer */ })
    return () => { vivo = false }
  }, [appointmentId])
  const feito = state !== null && !state?.error && !pending
  useEffect(() => { onPendente?.(pending) }, [pending]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (feito) onFeito() }, [feito]) // eslint-disable-line react-hooks/exhaustive-deps
  // O voucher desconta primeiro, depois o desconto comercial; os pontos valem
  // sobre o que sobra — a mesma ordem do servidor.
  const voucher = previa?.vouchers.find(v => v.id === voucherId) ?? null
  const aposVoucher = Math.round((price - (voucher?.desconto ?? 0)) * 100) / 100
  const doDesconto  = contaDoDesconto(aposVoucher, descontoEstado)
  const pedidoDeDesconto = doDesconto.recusa ? null : descontoDoEstado(descontoEstado)
  const base    = doDesconto.liquido
  const regras  = previa ? { valorDoPonto: previa.valorDoPonto, minimo: previa.minimo, tetoPct: previa.tetoPct } : null
  const resgate = previa && regras
    ? calcularDescontoComPontos({ saldo: previa.saldo, preco: base, pedido: Number(pontos) || 0, regras })
    : { pontos: 0, desconto: 0, restante: base }
  const maximo  = previa && regras ? maximoDePontos(previa.saldo, base, regras) : 0
  const totalZero = resgate.restante === 0 && !resgate.motivo
  const total = resgate.motivo ? base : resgate.restante
  const comAbatimento = resgate.pontos > 0 || !!voucher || doDesconto.reais > 0
  if (feito) return null

  const camposDoCartao = (
    <>
      {metodoEscolhido === 'INTERNAL_CREDIT' && clienteId && <SaldoDoCredito clienteId={clienteId} valor={resgate.restante} />}
      <CampoDaMaquininha metodo={metodoEscolhido} valor={maquininha} aoMudar={v => { setMaquininha(v); setVezes(1) }} name="maquininha_id" />
      {metodoEscolhido === 'CREDIT_CARD' && (
        <>
          {/* A39: o campo das vezes tem rótulo, como os outros. */}
          <label className="field-label" htmlFor="pagamento-vezes" style={{ marginTop: 6 }}>Vezes no cartão</label>
          <select id="pagamento-vezes" name="cartao_vezes" className="field" value={vezes} onChange={e => setVezes(Number(e.target.value))}>
            {/* Acessibilidade (9ª): a opção diz "6x", como em toda tela de cobrança. */}
            {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
          </select>
          <DicaDasVezes total={resgate.restante} vezes={vezes} opcoes={opcoesDeVezes} />
          <AvisoDaTaxa vezes={vezes} bandeira={bandeira} total={resgate.restante} maquininha={maquininha} />
        </>
      )}
      <CampoDaBandeira metodo={metodoEscolhido} valor={bandeira} aoMudar={setBandeira} name="cartao_bandeira" total={resgate.restante} maquininha={maquininha} />
      {pagamentoCombinado && (
        <p data-testid="pagamento-combinado" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          Combinado no contrato: {pagamentoCombinado.rotulo}.
        </p>
      )}
    </>
  )

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="slug" value={slug} />
      {pacotesParaAbater.length > 0 && (
        <AbaterDoPacote appointmentId={appointmentId} pacotes={pacotesParaAbater} onFeito={onFeito} />
      )}
      {pedidoDeDesconto && <input type="hidden" name="desconto_tipo" value={pedidoDeDesconto.tipo} />}
      {pedidoDeDesconto && <input type="hidden" name="desconto_valor" value={String(pedidoDeDesconto.valor)} />}
      <CampoDoDesconto estado={descontoEstado} aoMudar={e => { setDescontoEstado(e); setPontos('') }} total={aposVoucher} />
      {/* J-47: o porquê do desconto, opcional — fica no lançamento e na linha do tempo. */}
      {pedidoDeDesconto && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
          Motivo do desconto (opcional)
          <input name="desconto_motivo" className="field" maxLength={300} placeholder="Ex.: cliente fiel, retorno, cortesia da casa"
            value={motivoDoDesconto} onChange={e => setMotivoDoDesconto(e.target.value)} />
          {!motivoDoDesconto.trim() && <LembreteDoMotivo />}
        </label>
      )}
      {previa && previa.vouchers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="field-label" htmlFor="voucher-do-pagamento">Aplicar voucher</label>
          <select id="voucher-do-pagamento" name="voucher_id" className="filtro-select" value={voucherId}
            onChange={e => { setVoucherId(e.target.value); setPontos('') }}>
            <option value="">Nenhum</option>
            {previa.vouchers.map(v => (
              <option key={v.id} value={v.id}>{v.name} (−{brl(v.desconto)})</option>
            ))}
          </select>
        </div>
      )}
      {previa && previa.saldo > 0 && base > 0 && (
        <div data-testid="usar-pontos" style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
          borderRadius: 'var(--radius-row)', padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="field-label" style={{ margin: 0 }}>Usar pontos</span>
            <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Saldo: <strong style={{ color: 'var(--text)' }}>{formatarPontos(previa.saldo)}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input name="pontos" type="number" min={0} step={1} inputMode="numeric" className="field"
              value={pontos} onChange={e => setPontos(e.target.value)} placeholder="0" style={{ flex: 1 }} />
            <button type="button" className="btn-ghost" disabled={maximo <= 0}
              onClick={() => setPontos(String(maximo))}>
              Usar o máximo
            </button>
          </div>
          {resgate.motivo ? (
            <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{resgate.motivo}</p>
          ) : resgate.pontos > 0 ? (
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
              {formatarPontos(resgate.pontos)} = <strong style={{ color: 'var(--brand)' }}>−{brl(resgate.desconto)}</strong>
            </p>
          ) : (
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              Cada ponto vale {brl(previa.valorDoPonto)}.
              {previa.minimo > 0 && ` Mínimo de ${previa.minimo} pontos.`}
              {previa.tetoPct < 100 && ` Pontos pagam até ${String(previa.tetoPct).replace('.', ',')}% do valor.`}
            </p>
          )}
        </div>
      )}
      {emBlocos ? (
        totalZero ? (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>Nada a receber — sem forma de pagamento.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <FormasDePagamento valor={metodoEscolhido} aoMudar={setMetodoEscolhido} name="payment_method" />
            {camposDoCartao}
          </div>
        )
      ) : (
        <div className="form-2col">
          {totalZero ? (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', alignSelf: 'end' }}>
              Nada a receber — sem forma de pagamento.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="field-label" htmlFor="pagamento-forma">Forma de pagamento *</label>
              <select id="pagamento-forma" name="payment_method" className="field" value={metodoEscolhido} onChange={e => setMetodoEscolhido(e.target.value)} required>
                <option value="">Selecione…</option>
                {FORMAS_DO_BALCAO.map(m => <option key={m} value={m}>{rotuloDaForma(m)}</option>)}
              </select>
              {camposDoCartao}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="field-label">{comAbatimento ? 'Total a receber' : 'Valor (R$)'}</label>
            <p data-testid="total-a-receber" style={{
              fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.02em',
              color: comAbatimento ? 'var(--brand)' : 'var(--text)', padding: '6px 0',
            }}>
              {brl(total)}
            </p>
          </div>
        </div>
      )}
      {state?.error && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        {onVoltar && <button type="button" onClick={onVoltar} className="btn-secondary"><X size={13} /> Voltar</button>}
        <button type="submit" disabled={pending || !!doDesconto.recusa || (!totalZero && !metodoEscolhido) || (!totalZero && !!faltaAMaquininha)} className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 'var(--text-base-sz)', minWidth: 170, justifyContent: 'center', flex: emBlocos ? 1 : undefined }}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {pending ? 'Registrando…' : emBlocos ? `Receber ${brl(total)}` : 'Confirmar pagamento'}
        </button>
      </div>
    </form>
  )
}

/** A janela "Confirmar pagamento" da tela do atendimento. */
export function PaymentModal({ onClose, ...props }: ReceberAtendimentoProps & { onClose: () => void }) {
  const router = useRouter()
  const [travado, setTravado] = useState(false)
  return (
    <JanelaModal onFechar={onClose} rotulo="Confirmar pagamento" largura={440} travado={travado}>
      <div>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--brand)' }} />
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Confirmar pagamento</h2>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <FormularioDeReceberAtendimento {...props} onVoltar={onClose} onPendente={setTravado} onFeito={() => { onClose(); router.refresh() }} />
        </div>
      </div>
    </JanelaModal>
  )
}
