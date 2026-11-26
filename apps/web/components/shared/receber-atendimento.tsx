'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import { confirmPayment, previaDoPagamento } from '@/actions/appointments'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { trocaDePontosDoAtendimento } from '@/actions/fidelidade'
import { TrocarPontos } from '@/components/shared/trocar-pontos'
import { abaterDoPacote } from '@/actions/a-receber'
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'
import { formatarPontos } from '@/lib/fidelidade/formato'
import { CampoDoDesconto, LembreteDoMotivo, contaDoDesconto, descontoDoEstado, estadoDoDesconto } from '@/components/shared/campo-do-desconto'
import { FORMAS_DO_BALCAO } from '@/components/shared/formas-de-pagamento'
import { Dica } from '@/components/shared/dica'
import { oQueSaiNoReceber, TEXTO_PONTOS_SO_A_VISTA, type SaiDaComanda } from '@/lib/pdv/situacoes'
import { voucherDepoisDoDesconto } from '@/lib/fidelidade/voucher-na-comanda'
import { CampoQuemVendeu, PerguntaDaVenda } from '@/components/shared/pergunta-da-venda'
import { PERGUNTA_SEM_VENDEDOR } from '@/lib/vendas/pergunta-sem-vendedor'
import type { MembroDaVenda } from '@/components/shared/vender'
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
  /**
   * A comanda tem produto acrescentado (ainda não vendido): a equipe para o
   * "Quem vendeu os produtos" (com-06; nasce VAZIO, r2-ven-12). Nulo, sem produto.
   */
  equipeDosProdutos?: MembroDaVenda[] | null
}

/**
 * O formulário do recebimento: a forma em blocos com ícone e o botão
 * "Receber R$ X" (o PDV).
 */
export function FormularioDeReceberAtendimento({
  appointmentId, slug, price, pagamentoCombinado, pacotesParaAbater = [], clienteId, onFeito, onVoltar, onPendente, aoMudarOQueSai,
  equipeDosProdutos = null,
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
  // O clique duplo é o MESMO envio (o Heitor, 25/11: "As duas respostas dizem 'recebido'"): a chave nasce
  // no primeiro clique e vale para o segundo; a comanda recebida sai da tela (`feito`).
  const envio = useEnvioUnico()
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
  // A50 da 24ª: a troca de pontos por voucher, aqui mesmo (era só na ficha).
  const [troca, setTroca] = useState<Awaited<ReturnType<typeof trocaDePontosDoAtendimento>>>(null)
  // "Quem vendeu os produtos" (com-06: "Se o campo ficar vazio, aviso e confirmação.
  // Campo vazio não gera comissão para ninguém"): nasce vazio; vazio, pergunta antes.
  const [vendedorId, setVendedorId] = useState('')
  const [semVendedor, setSemVendedor] = useState(false)
  const [perguntaDoVendedor, setPerguntaDoVendedor] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)
  useEffect(() => {
    let vivo = true
    previaDoPagamento(appointmentId).then(r => { if (vivo) setPrevia(r) }).catch(() => { /* sem pontos a oferecer */ })
    trocaDePontosDoAtendimento(appointmentId).then(r => { if (vivo) setTroca(r) }).catch(() => { /* nada a trocar */ })
    return () => { vivo = false }
  }, [appointmentId])
  // Trocou: relê os vouchers e os pontos, e deixa o voucher novo escolhido.
  async function depoisDaTroca(novo: string) {
    const [p, t] = await Promise.all([
      previaDoPagamento(appointmentId).catch(() => null),
      trocaDePontosDoAtendimento(appointmentId).catch(() => null),
    ])
    setPrevia(p); setTroca(t); setPontos('')
    if (p?.vouchers.some(v => v.id === novo)) setVoucherId(novo)
  }
  const feito = state !== null && !state?.error && !pending
  useEffect(() => { onPendente?.(pending) }, [pending]) // eslint-disable-line react-hooks/exhaustive-deps
  // Recebido: o próximo "Receber" (a comanda reaberta pelo estorno) é outro envio.
  useEffect(() => { if (feito) { envio.renovar(); onFeito() } }, [feito]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Desconto, voucher, pontos" (o Heitor, 2026-11-18): o desconto comercial
  // sobre o total da comanda, o voucher sobre o que sobrou, os pontos sobre o
  // resto — a mesma conta do servidor e do banco (`voucherDepoisDoDesconto`).
  const doDesconto  = contaDoDesconto(price, descontoEstado)
  const pedidoDeDesconto = doDesconto.recusa ? null : descontoDoEstado(descontoEstado)
  const descontoDoVoucherAgora = (v: NonNullable<typeof previa>['vouchers'][number]) => previa
    ? voucherDepoisDoDesconto(v.voucher, { procedureId: previa.procedureId, preco: previa.preco, itens: previa.itens, descontoVenda: doDesconto.reais })
    : { desconto: 0 }
  const escolhido = previa?.vouchers.find(v => v.id === voucherId) ?? null
  const contaDoVoucher = escolhido ? descontoDoVoucherAgora(escolhido) : null
  const voucher = escolhido && contaDoVoucher && !contaDoVoucher.motivo ? { name: escolhido.name, desconto: contaDoVoucher.desconto } : null
  const base    = Math.max(0, Math.round((doDesconto.liquido - (voucher?.desconto ?? 0)) * 100) / 100)
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
  const comProdutos = equipeDosProdutos !== null
  function antesDeEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (comProdutos && !vendedorId && !semVendedor) { e.preventDefault(); setPerguntaDoVendedor(true) }
  }
  function receberSemVendedor() {
    flushSync(() => { setSemVendedor(true); setPerguntaDoVendedor(false) })
    formulario.current?.requestSubmit()
  }
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
    <form ref={formulario} action={fd => { fd.set('_envio', envio.chave()); action(fd) }} onSubmit={antesDeEnviar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <input type="hidden" name="slug" value={slug} />
      {pacotesParaAbater.length > 0 && (
        <AbaterDoPacote appointmentId={appointmentId} pacotes={pacotesParaAbater} onFeito={onFeito} />
      )}
      {pedidoDeDesconto && <input type="hidden" name="desconto_tipo" value={pedidoDeDesconto.tipo} />}
      {pedidoDeDesconto && <input type="hidden" name="desconto_valor" value={String(pedidoDeDesconto.valor)} />}
      <CampoDoDesconto estado={descontoEstado} aoMudar={e => { setDescontoEstado(e); setPontos('') }} total={price} />
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
              <option key={v.id} value={v.id}>{v.name} (−{brl(descontoDoVoucherAgora(v).desconto)})</option>
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
      {aVista && troca && <TrocarPontos troca={troca} aoTrocar={v => { void depoisDaTroca(v) }} />}
      {/* D16 da 32ª (PD-06): fora do à vista, diz por que os pontos e o voucher sumiram — a frase da venda. */}
      {!aVista && previa && (previa.vouchers.length > 0 || (previa.saldo > 0 && base > 0) || !!troca) && (
        <p data-pontos-so-a-vista style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{TEXTO_PONTOS_SO_A_VISTA}</p>
      )}
      {comProdutos && (
        <>
          <input type="hidden" name="vendedor_dos_produtos" value={vendedorId} />
          <input type="hidden" name="sem_vendedor_dos_produtos" value={semVendedor ? '1' : ''} />
          <CampoQuemVendeu rotulo="Quem vendeu os produtos" equipe={equipeDosProdutos ?? []} valor={vendedorId}
            aoMudar={id => { setVendedorId(id); setSemVendedor(false); setPerguntaDoVendedor(false) }} />
        </>
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
      {perguntaDoVendedor && (
        <PerguntaDaVenda texto={PERGUNTA_SEM_VENDEDOR} pendente={pending} rotuloConfirmar="Receber assim"
          aoConfirmar={receberSemVendedor} aoVoltar={() => setPerguntaDoVendedor(false)} />
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
