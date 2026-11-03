'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { previaDoCancelamentoDoPacote, cancelarPacote } from '@/actions/pacotes'
import type { ComoEstornar, DestinoDaDevolucao, EscolhaDosAgendamentos, PreviaDoCancelamento } from '@/lib/pacotes/cancelamento'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { CampoDaBandeira } from '@/components/shared/campo-da-bandeira'

/** As formas do pagamento novo do usado (r2-ven-05). */
const FORMAS_DO_USADO = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

/**
 * "Cancelar pacote" (F2b da 5ª simulação; decisão do Heitor, 2026-11-01:
 * "concordo"): a cliente comprou 6, fez 2 e desistiu. A janela mostra a
 * conta que o BANCO fez (`pacote_cancelar` simulando) — as sessões que
 * sobraram e o valor delas, as parcelas a receber que caem antes de devolver
 * qualquer coisa, e o que volta —, e a recepção escolhe como devolver
 * (estorno ou crédito na clínica) e o que fazer com as sessões já agendadas.
 * Sem as escolhas e o motivo, não confirma.
 *
 * Quando o estorno pega um pagamento EM PARTE, a recepção escolhe como
 * (r2-ven-05, o Heitor: "dar as duas opções (...) flexibilidade"): o estorno
 * parcial ou o pagamento inteiro estornado e o usado lançado de novo, na forma
 * que ela escolher. No cartão o parcial fica desligado, com o motivo
 * (r2-fin-03: "todas as operadoras fazem assim").
 */
export function CancelarPacote({ clientPackageId, onFechar }: { clientPackageId: string; onFechar: () => void }) {
  const router = useRouter()
  const [previa, setPrevia] = useState<PreviaDoCancelamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [destino, setDestino] = useState<DestinoDaDevolucao | null>(null)
  const [agendamentos, setAgendamentos] = useState<EscolhaDosAgendamentos | null>(null)
  const [motivo, setMotivo] = useState('')
  const [comoEstornar, setComoEstornar] = useState<ComoEstornar | null>(null)
  const [novoMetodo, setNovoMetodo] = useState<string>('')
  const [novoVezes, setNovoVezes] = useState(1)
  // r3-f13-01: a bandeira do cartão do pagamento novo, opcional.
  const [novaBandeira, setNovaBandeira] = useState('')
  const opcoesDeVezes = useOpcoesDeVezes()
  const [cancelando, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    previaDoCancelamentoDoPacote(clientPackageId).then(r => {
      if (!vivo) return
      if (r.error || !r.previa) setErro(r.error ?? 'Não consegui calcular o cancelamento.')
      else {
        setPrevia(r.previa)
        // No cartão só existe o estorno inteiro: já vem escolhido.
        if (r.previa.parcial?.cartao) setComoEstornar('INTEIRO')
      }
    })
    return () => { vivo = false }
  }, [clientPackageId])

  const temAgendadas = (previa?.agendamentos.length ?? 0) > 0
  const emParte = previa && previa.devolver > 0 && destino === 'ESTORNO' ? previa.parcial : null
  const pronto = !!previa && motivo.trim().length > 0
    && (previa.devolver <= 0 || destino !== null)
    && (!temAgendadas || agendamentos !== null)
    && (!emParte || (comoEstornar === 'PARCIAL' && !emParte.cartao) || (comoEstornar === 'INTEIRO' && novoMetodo !== ''))

  function confirmar() {
    if (!previa) return
    iniciar(async () => {
      const r = await cancelarPacote(clientPackageId, {
        motivo: motivo.trim(),
        destino: previa.devolver > 0 ? destino : null,
        agendamentos: temAgendadas ? agendamentos : null,
        esperado: previa.devolver,
        estorno: emParte ? comoEstornar : null,
        novo: emParte && comoEstornar === 'INTEIRO'
          ? { metodo: novoMetodo, vezes: novoMetodo === 'CREDIT_CARD' ? novoVezes : 1, bandeira: novaBandeira || null }
          : null,
      })
      if (r.error) { toast.error(r.error); return }
      toast.success(previa.devolver > 0
        ? destino === 'CREDITO'
          ? `Pacote cancelado. ${formatBRL(previa.devolver)} ficaram de crédito na clínica.`
          : `Pacote cancelado. ${formatBRL(previa.devolver)} estornados à cliente.`
        : 'Pacote cancelado.')
      onFechar()
      router.refresh()
    })
  }

  const linha = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' } as const
  const valor = { color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' } as const
  const opcao = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', cursor: 'pointer' } as const

  return (
    <JanelaModal rotulo="Cancelar pacote" largura={480} travado={cancelando} onFechar={onFechar} fechaNoFundo={false}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
          {previa ? `Cancelar o pacote ${previa.pacote}?` : 'Cancelar pacote'}
        </h2>

        {erro ? (
          <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>
        ) : !previa ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Calculando…
          </p>
        ) : (
          <>
            <div data-conta-do-cancelamento style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
              borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)',
            }}>
              <div style={linha}>
                <span>{previa.restantes} de {previa.sessoes} sessões restantes</span>
                <span style={valor}>{formatBRL(previa.valorRestante)}</span>
              </div>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                O valor das restantes é a parte de cada uma no preço do pacote ({formatBRL(previa.preco)}, com o desconto).
                Usado: {formatBRL(previa.usado)}.
              </p>
              <div style={linha}><span>Pago</span><span style={valor}>{formatBRL(previa.pago)}</span></div>
              {previa.aReceber > 0 && (
                <div style={linha}><span>A receber</span><span style={valor}>{formatBRL(previa.aReceber)}</span></div>
              )}
              {previa.cai > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={linha}><span>Parcelas a receber que caem</span><span style={valor}>{formatBRL(previa.cai)}</span></div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {previa.parcelas.map(p => (
                      <li key={p.id} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                        {p.descricao}{p.vencimento ? ` (vence ${format(new Date(p.vencimento), 'dd/MM', { locale: ptBR })})` : ''}:{' '}
                        {p.fica > 0 ? `de ${formatBRL(p.valor)} passa a ${formatBRL(p.fica)}` : `${formatBRL(p.valor)} cancelada`}
                      </li>
                    ))}
                  </ul>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                    O a receber que passa do usado cai antes de devolver qualquer coisa.
                  </p>
                </div>
              )}
              <div data-a-devolver style={{ ...linha, borderTop: '1px solid var(--hairline)', paddingTop: 6 }}>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>A devolver</span>
                <span style={valor}>{formatBRL(previa.devolver)}</span>
              </div>
            </div>

            {previa.devolver > 0 && (
              <div role="radiogroup" aria-labelledby="cancelar-pacote-destino" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span id="cancelar-pacote-destino" className="field-label">Como devolver {formatBRL(previa.devolver)}? *</span>
                <label style={opcao}>
                  <input type="radio" name="cancelar-pacote-destino" checked={destino === 'ESTORNO'} disabled={cancelando}
                    onChange={() => setDestino('ESTORNO')} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                  <span>Estorno <span style={{ color: 'var(--text-muted)' }}>— o dinheiro volta à cliente na forma em que ela pagou{previa.fidelidade ? ', e os pontos dele saem do saldo' : ''}</span></span>
                </label>
                <label style={opcao}>
                  <input type="radio" name="cancelar-pacote-destino" checked={destino === 'CREDITO'} disabled={cancelando}
                    onChange={() => setDestino('CREDITO')} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                  <span>Crédito na clínica <span style={{ color: 'var(--text-muted)' }}>— fica de saldo para ela usar em outro atendimento</span></span>
                </label>
              </div>
            )}

            {emParte && (
              <div data-como-estornar role="radiogroup" aria-labelledby="cancelar-pacote-como-estornar" style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
                borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)',
              }}>
                <span id="cancelar-pacote-como-estornar" className="field-label">
                  Como estornar o {rotuloDaForma(emParte.metodo, emParte.vezes)} de {formatBRL(emParte.valor)}? *
                </span>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  Voltam {formatBRL(emParte.volta)} deste pagamento; {formatBRL(emParte.fica)} são do que a cliente usou.
                </p>
                <label style={{ ...opcao, cursor: emParte.cartao ? 'not-allowed' : 'pointer', opacity: emParte.cartao ? 0.6 : 1 }}>
                  <input type="radio" name="cancelar-pacote-como-estornar" checked={comoEstornar === 'PARCIAL'}
                    disabled={cancelando || emParte.cartao}
                    onChange={() => setComoEstornar('PARCIAL')} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                  <span>
                    Estorno parcial{' '}
                    <span style={{ color: 'var(--text-muted)' }}>
                      — o pagamento passa a valer {formatBRL(emParte.fica)} e um “Estorno parcial” de {formatBRL(emParte.volta)} leva o resto
                    </span>
                    {emParte.cartao && (
                      <span data-motivo-sem-parcial style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                        No cartão, a operadora estorna o pagamento inteiro: o estorno parcial não existe.
                      </span>
                    )}
                  </span>
                </label>
                <label style={opcao}>
                  <input type="radio" name="cancelar-pacote-como-estornar" checked={comoEstornar === 'INTEIRO'} disabled={cancelando}
                    onChange={() => setComoEstornar('INTEIRO')} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                  <span>
                    Estornar o pagamento inteiro e lançar o usado de novo{' '}
                    <span style={{ color: 'var(--text-muted)' }}>
                      — {formatBRL(emParte.valor)} voltam e {formatBRL(emParte.fica)} entram de novo, na forma que você escolher
                    </span>
                  </span>
                </label>
                {comoEstornar === 'INTEIRO' && (
                  <div className="form-2col" style={{ paddingLeft: 24 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="field-label">Forma do pagamento do usado *</span>
                      <select className="field" aria-label="Forma do pagamento do usado" value={novoMetodo} disabled={cancelando}
                        onChange={e => { setNovoMetodo(e.target.value); setNovoVezes(1) }}>
                        <option value="">Selecione…</option>
                        {FORMAS_DO_USADO.map(f => <option key={f} value={f}>{rotuloDaForma(f, null, { longo: true })}</option>)}
                      </select>
                    </label>
                    {novoMetodo === 'CREDIT_CARD' && (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="field-label">Vezes no cartão</span>
                        <select className="field" aria-label="Vezes no cartão" value={novoVezes} disabled={cancelando}
                          onChange={e => setNovoVezes(Number(e.target.value))}>
                          {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : n + 'x'}</option>)}
                        </select>
                        <DicaDasVezes total={emParte.fica} vezes={novoVezes} opcoes={opcoesDeVezes} />
                      </label>
                    )}
                    <CampoDaBandeira metodo={novoMetodo} valor={novaBandeira} aoMudar={setNovaBandeira} />
                  </div>
                )}
              </div>
            )}

            {temAgendadas && (
              <div data-agendamentos-do-pacote role="radiogroup" aria-labelledby="cancelar-pacote-agendadas" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span id="cancelar-pacote-agendadas" className="field-label">
                  {previa.agendamentos.length === 1 ? '1 sessão já agendada' : `${previa.agendamentos.length} sessões já agendadas`} *
                </span>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {previa.agendamentos.map(a => (
                    <li key={a.id} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                      {format(new Date(a.quando), "EEE, dd/MM 'às' HH:mm", { locale: ptBR })} · {a.procedimento ?? 'Sessão'}
                      {a.profissional ? ` · ${a.profissional}` : ''}
                    </li>
                  ))}
                </ul>
                <label style={opcao}>
                  <input type="radio" name="cancelar-pacote-agendadas" checked={agendamentos === 'CANCELAR'} disabled={cancelando}
                    onChange={() => setAgendamentos('CANCELAR')} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                  <span>Cancelar os agendamentos <span style={{ color: 'var(--text-muted)' }}>— a cliente e a profissional são avisadas</span></span>
                </label>
                <label style={opcao}>
                  <input type="radio" name="cancelar-pacote-agendadas" checked={agendamentos === 'SOLTAR'} disabled={cancelando}
                    onChange={() => setAgendamentos('SOLTAR')} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
                  <span>Manter como avulso <span style={{ color: 'var(--text-muted)' }}>— o horário fica, e a sessão é cobrada à parte ({previa.agendamentos.map(a => formatBRL(a.preco)).join(', ')})</span></span>
                </label>
              </div>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="field-label">Motivo do cancelamento *</span>
              <textarea className="field" rows={2} maxLength={500} value={motivo} disabled={cancelando}
                onChange={e => setMotivo(e.target.value)} placeholder="Ex.: a cliente mudou de cidade" />
            </label>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              As sessões que sobraram deixam de valer, e a comissão de venda volta na proporção do que caiu. Não se desfaz.
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={cancelando} onClick={onFechar}>Voltar</button>
          {previa && !erro && (
            <button type="button" className="btn-primary" disabled={cancelando || !pronto} onClick={confirmar}>
              {cancelando ? 'Cancelando…' : 'Cancelar pacote'}
            </button>
          )}
        </div>
      </div>
    </JanelaModal>
  )
}
