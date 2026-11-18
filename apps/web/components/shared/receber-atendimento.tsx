'use client'

import { useActionState, useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import { confirmPayment, previaDoPagamento } from '@/actions/appointments'
import { abaterDoPacote } from '@/actions/a-receber'
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'
import { formatarPontos } from '@/lib/fidelidade/formato'
import { CampoDoDesconto, LembreteDoMotivo, contaDoDesconto, descontoDoEstado, estadoDoDesconto } from '@/components/shared/campo-do-desconto'
import { FORMAS_DO_BALCAO } from '@/components/shared/formas-de-pagamento'
import { Dica } from '@/components/shared/dica'
import { oQueSaiNoReceber, type SaiDaComanda } from '@/lib/pdv/situacoes'
import {
  CamposDoPagamento, MotivoDoBotao, estadoDoPagamento, montarPagamento, recusaForaDoCampo, useRecusaDoPagamento,
  type EstadoDoPagamento,
} from '@/components/shared/campos-do-pagamento'

/**
 * Receber um atendimento: a forma (com as vezes, a bandeira e a maquininha do
 * cartão), o desconto, o voucher e os pontos — a mesma conta que o servidor
 * refaz em `confirmPayment`. As formas são as da venda (o Heitor, 2026-11-16:
 * "Mesma regra de pagamentos dos outros"): à vista numa forma ou em várias
 * ("+ Outra forma", D1 da 18ª), o crediário com entrada e parcelas, o a receber. É o "Receber" da comanda do atendimento no PDV
 * (PDV1). A janela "Confirmar pagamento" da tela do atendimento saiu (PDV7, a
 * revisão do Heitor de 2026-11-13: "Sai a cobrança da conclusão do atendimento
 * como porta própria (vira a comanda)"): todo caminho leva à comanda.
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
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>{p.pacote}</span>
              {/* O "o que abater faz" mora na dica (2026-11-16 — era uma linha fixa embaixo). */}
              <Dica rotulo="Sobre abater do pacote">
                Abater usa uma sessão do pacote e não cobra nada. Para cobrar avulso, siga abaixo.
              </Dica>
            </p>
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
 * O formulário do recebimento: a forma em blocos com ícone e o botão
 * "Receber R$ X" (o PDV).
 */
export function FormularioDeReceberAtendimento({
  appointmentId, slug, price, pagamentoCombinado, pacotesParaAbater = [], clienteId, onFeito, onVoltar, onPendente, aoMudarOQueSai,
}: ReceberAtendimentoProps & {
  /** A10 da 23ª: o que sai do valor (o voucher, o desconto, os pontos) e o total, para a comanda os mostrar. */
  aoMudarOQueSai?: (linhas: SaiDaComanda[], total: number) => void
  onFeito:   () => void
  onVoltar?: () => void
  /** Enquanto grava: quem chama não fecha no meio. */
  onPendente?: (gravando: boolean) => void
}) {
  // A37 da 6ª simulação: a forma nasce VAZIA (o Pix era o padrão calado — um
  // clique gravava no Pix). Só o meio combinado no contrato vem escolhido.
  const metodoInicial = (FORMAS_DO_BALCAO as readonly string[]).includes(pagamentoCombinado?.metodo ?? '') ? pagamentoCombinado!.metodo! : ''
  const [estado, setEstado] = useState<EstadoDoPagamento>(() => ({ ...estadoDoPagamento(null, 'AVISTA'), metodo: metodoInicial }))
  // C75: a maquininha de cada cartão entra na recusa (com mais de uma na rede).
  const recusaDoPagamento = useRecusaDoPagamento()
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
  // Os pontos e o voucher são do à vista (a mesma regra da venda): o crediário e
  // o a receber os tiram.
  const aVista = estado.forma === 'AVISTA'
  const mudarPagamento = (e: EstadoDoPagamento) => {
    if (e.forma !== 'AVISTA') { setPontos(''); setVoucherId('') }
    setEstado(e)
  }
  const recusa = totalZero ? null : recusaDoPagamento(estado, total, 'da comanda')
  // A10 da 23ª (princípio 3): o total da comanda segue o que sai aqui — não só o botão.
  const oQueSai = oQueSaiNoReceber({
    voucher: voucher ? { nome: voucher.name, desconto: voucher.desconto } : null,
    desconto: doDesconto.recusa ? 0 : doDesconto.reais,
    pontos: resgate.motivo ? { pontos: 0, desconto: 0 } : { pontos: resgate.pontos, desconto: resgate.desconto },
  })
  const chaveDoQueSai = JSON.stringify([oQueSai, total])
  useEffect(() => { aoMudarOQueSai?.(oQueSai, total) }, [chaveDoQueSai]) // eslint-disable-line react-hooks/exhaustive-deps
  if (feito) return null

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
      {aVista && previa && previa.vouchers.length > 0 && (
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
      {aVista && previa && previa.saldo > 0 && base > 0 && (
        <div data-testid="usar-pontos" style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
          borderRadius: 'var(--radius-row)', padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="field-label" style={{ margin: 0 }}>Usar pontos</span>
              {/* O "quanto vale o ponto" mora na dica (2026-11-16 — era uma linha fixa). */}
              <Dica rotulo="Quanto vale o ponto">
                Cada ponto vale {brl(previa.valorDoPonto)}.
                {previa.minimo > 0 && ` Mínimo de ${previa.minimo} pontos.`}
                {previa.tetoPct < 100 && ` Pontos pagam até ${String(previa.tetoPct).replace('.', ',')}% do valor.`}
              </Dica>
            </span>
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
          ) : null}
        </div>
      )}
      {totalZero ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>Nada a receber — sem forma de pagamento.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* O pagamento vai inteiro, como na venda: o servidor refaz as contas e grava numa transação. */}
          <input type="hidden" name="pagamento" value={JSON.stringify(montarPagamento(estado, total))} />
          <CamposDoPagamento estado={estado} aoMudar={mudarPagamento} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']}
            total={total} doQue="da comanda" clienteId={clienteId} variasFormas />
          {pagamentoCombinado && (
            <p data-testid="pagamento-combinado" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              Combinado no contrato: {pagamentoCombinado.rotulo}.
            </p>
          )}
        </div>
      )}
      {state?.error && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>{state.error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, flexWrap: 'wrap' }}>
        <MotivoDoBotao motivo={pending || state?.error ? null : recusaForaDoCampo(estado, total, recusa, 'da comanda')} />
        {onVoltar && <button type="button" onClick={onVoltar} className="btn-secondary"><X size={13} /> Voltar</button>}
        <button type="submit" disabled={pending || !!doDesconto.recusa || !!recusa} className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 'var(--text-base-sz)', minWidth: 170, justifyContent: 'center', flex: 1 }}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {/* No crediário e no a receber, nada (ou só a entrada) entra agora: o botão fecha a comanda. */}
          {pending ? 'Registrando…' : aVista || totalZero ? `Receber ${brl(total)}` : 'Fechar a comanda'}
        </button>
      </div>
    </form>
  )
}
