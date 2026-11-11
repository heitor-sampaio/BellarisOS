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
import { previaDoCancelamentoDoPlano, cancelarPlano } from '@/actions/treatment-plans'
import type { EscolhaDosAgendamentos, PreviaDoCancelamento } from '@/lib/pacotes/cancelamento'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import {
  EscolhaDaDevolucao, ESCOLHA_INICIAL, escolhaCompleta, escolhaParaAAcao, comOPagamentoInteiro, type EscolhaDaDevolucaoEstado,
} from '@/components/shared/escolha-da-devolucao'

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
  return <CancelarConjunto tipo="PACOTE" id={clientPackageId} onFechar={onFechar} />
}

/**
 * "Cancelar plano" (D4 da 9ª simulação; decisão 2 do Heitor, 2026-11-07:
 * "sim usa a mesma coisa do pacote (...) os dois são, em essencia, conjuntos de
 * procedimentos"): a MESMA janela, com a conta de `plano_cancelar_devolvendo`
 * — o usado é o preço das sessões feitas no plano, com o desconto, sem multa.
 */
export function CancelarPlano({ planId, onFechar, onCancelado }: {
  planId: string; onFechar: () => void
  /**
   * D5 da 12ª: a tela que lê o plano no navegador (o plano aberto, o resumo)
   * relê aqui — o `router.refresh()` não chega ao estado do cliente.
   */
  onCancelado?: () => void
}) {
  return <CancelarConjunto tipo="PLANO" id={planId} onFechar={onFechar} onCancelado={onCancelado} />
}

function CancelarConjunto({ tipo, id, onFechar, onCancelado }: { tipo: 'PACOTE' | 'PLANO'; id: string; onFechar: () => void; onCancelado?: () => void }) {
  const doPlano = tipo === 'PLANO'
  const nome = doPlano ? 'plano' : 'pacote'
  const Nome = doPlano ? 'Plano' : 'Pacote'
  const router = useRouter()
  const [previa, setPrevia] = useState<PreviaDoCancelamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Como devolver, e como estornar o pagamento pego em parte (com a forma, as
  // vezes e a bandeira do pagamento novo do usado): EscolhaDaDevolucao.
  const [escolha, setEscolha] = useState<EscolhaDaDevolucaoEstado>(ESCOLHA_INICIAL)
  const [agendamentos, setAgendamentos] = useState<EscolhaDosAgendamentos | null>(null)
  const [motivo, setMotivo] = useState('')
  const opcoesDeVezes = useOpcoesDeVezes()
  const [cancelando, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    const conta = doPlano ? previaDoCancelamentoDoPlano(id) : previaDoCancelamentoDoPacote(id)
    conta.then(r => {
      if (!vivo) return
      if (r.error || !r.previa) setErro(r.error ?? 'Não consegui calcular o cancelamento.')
      else {
        setPrevia(r.previa)
        // No cartão só existe o estorno inteiro: já vem escolhido.
        if (r.previa.parcial?.cartao) setEscolha(e => comOPagamentoInteiro(e, r.previa!.parcial))
      }
    })
    return () => { vivo = false }
  }, [doPlano, id])

  const temAgendadas = (previa?.agendamentos.length ?? 0) > 0
  const pronto = !!previa && motivo.trim().length > 0
    && escolhaCompleta(previa.devolver, previa.parcial, escolha)
    && (!temAgendadas || agendamentos !== null)

  function confirmar() {
    if (!previa) return
    iniciar(async () => {
      const entrada = {
        motivo: motivo.trim(),
        ...escolhaParaAAcao(previa.devolver, previa.parcial, escolha),
        agendamentos: temAgendadas ? agendamentos : null,
        esperado: previa.devolver,
      }
      const r = doPlano ? await cancelarPlano(id, entrada) : await cancelarPacote(id, entrada)
      if (r.error) { toast.error(r.error); return }
      toast.success(previa.devolver > 0
        ? escolha.destino === 'CREDITO'
          ? `${Nome} cancelado. ${formatBRL(previa.devolver)} ficaram de crédito na clínica.`
          : `${Nome} cancelado. ${formatBRL(previa.devolver)} estornados à cliente.`
        : `${Nome} cancelado.`)
      onFechar()
      onCancelado?.()
      router.refresh()
    })
  }

  const linha = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' } as const
  const valor = { color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' } as const
  const opcao = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', cursor: 'pointer' } as const

  return (
    <JanelaModal rotulo={`Cancelar ${nome}`} largura={480} travado={cancelando} onFechar={onFechar} fechaNoFundo={false}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
          {previa ? `Cancelar o ${nome} ${previa.pacote}?` : `Cancelar ${nome}`}
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
                {doPlano
                  ? <>O valor das restantes é o preço de cada sessão no plano ({formatBRL(previa.preco)} no total, com o desconto); a feita vale o dela, sem multa.</>
                  : <>O valor das restantes é a parte de cada uma no preço do pacote ({formatBRL(previa.preco)}, com o desconto).</>}
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

            <EscolhaDaDevolucao prefixo="cancelar-pacote" devolver={previa.devolver} parcial={previa.parcial}
              fidelidade={previa.fidelidade} estado={escolha} aoMudar={setEscolha} desligado={cancelando} opcoesDeVezes={opcoesDeVezes} />

            {/* A26 da 10ª: a Camila tinha trocado os pontos do pacote, e o estorno a levou a −380 sem aviso. */}
            {previa.devolver > 0 && previa.pontos && previa.pontos.ganhos > 0 && (
              <p data-pontos-do-cancelamento role="note" style={{
                fontSize: 'var(--text-xs-sz)', lineHeight: 1.5, padding: '10px 12px', borderRadius: 'var(--radius-field-token)',
                color: 'var(--text)', background: previa.pontos.saldo < previa.pontos.ganhos ? 'var(--warning-soft)' : 'var(--bg-app)',
                border: `1px solid ${previa.pontos.saldo < previa.pontos.ganhos ? 'var(--warning-border)' : 'var(--border)'}`,
              }}>
                Os pagamentos deste {nome} deram <strong>{previa.pontos.ganhos.toLocaleString('pt-BR')} pontos</strong>, e a cliente tem{' '}
                <strong>{previa.pontos.saldo.toLocaleString('pt-BR')}</strong> hoje. O estorno tira os pontos do que voltar, na proporção
                {previa.pontos.saldo < previa.pontos.ganhos ? ' — e o saldo pode ficar negativo (ela já trocou ou usou parte deles)' : ''}.
                Com crédito na clínica, os pontos ficam.
              </p>
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
              {cancelando ? 'Cancelando…' : `Cancelar ${nome}`}
            </button>
          )}
        </div>
      </div>
    </JanelaModal>
  )
}
