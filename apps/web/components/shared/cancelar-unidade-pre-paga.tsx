'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { previaDoCancelamentoDaUnidade, cancelarUnidadePrePaga } from '@/actions/pre-pago'
import type { PreviaDoCancelamentoDaUnidade } from '@/lib/pre-pago/cancelamento'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import {
  EscolhaDaDevolucao, ESCOLHA_INICIAL, escolhaCompleta, escolhaParaAAcao, type EscolhaDaDevolucaoEstado,
} from '@/components/shared/escolha-da-devolucao'

/**
 * "Cancelar unidade" do pré-pago (D1 da 6ª simulação): o mesmo fluxo do
 * cancelamento do pacote. A janela mostra a conta que o BANCO fez
 * (`procedimento_cancelar_unidade_devolvendo` simulando) — o que a venda
 * passa a valer, o a receber que cai antes e o que volta —, e a recepção
 * escolhe como devolver (estorno ou crédito na clínica; no cartão, o
 * pagamento inteiro estornado e o que fica lançado de novo). Era uma
 * "Devolução" a pagar, sem forma e sem pergunta.
 */
export function CancelarUnidadePrePaga({ unidadeId, onFechar, onCancelada }: {
  unidadeId:   string
  onFechar:    () => void
  /** O que dizer na ficha depois ("R$ 250,00 ficaram de crédito na clínica."). */
  onCancelada: (aviso: string) => void
}) {
  const router = useRouter()
  const [previa, setPrevia] = useState<PreviaDoCancelamentoDaUnidade | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [escolha, setEscolha] = useState<EscolhaDaDevolucaoEstado>(ESCOLHA_INICIAL)
  const [motivo, setMotivo] = useState('')
  const opcoesDeVezes = useOpcoesDeVezes()
  const [cancelando, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    previaDoCancelamentoDaUnidade(unidadeId).then(r => {
      if (!vivo) return
      if (r.error || !r.previa) setErro(r.error ?? 'Não consegui calcular o cancelamento.')
      else {
        setPrevia(r.previa)
        // No cartão só existe o estorno inteiro: já vem escolhido.
        if (r.previa.parcial?.cartao) setEscolha(e => ({ ...e, comoEstornar: 'INTEIRO' }))
      }
    })
    return () => { vivo = false }
  }, [unidadeId])

  const pronto = !!previa && motivo.trim().length > 0 && escolhaCompleta(previa.devolver, previa.parcial, escolha)

  function confirmar() {
    if (!previa) return
    setErro(null)
    iniciar(async () => {
      const r = await cancelarUnidadePrePaga(unidadeId, {
        motivo: motivo.trim(),
        ...escolhaParaAAcao(previa.devolver, previa.parcial, escolha),
        esperado: previa.devolver,
      })
      if (r.error) { setErro(r.error); return }
      onCancelada(r.devolver && r.devolver > 0
        ? r.destino === 'CREDITO'
          ? `Unidade cancelada. ${formatBRL(r.devolver)} ficaram de crédito na clínica.`
          : `Unidade cancelada. ${formatBRL(r.devolver)} estornados à cliente.`
        : r.reduzido && r.reduzido > 0 ? `Unidade cancelada. O a receber diminuiu ${formatBRL(r.reduzido)}.` : 'Unidade cancelada.')
      onFechar()
      router.refresh()
    })
  }

  const linha = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' } as const
  const valor = { color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' } as const

  return (
    <JanelaModal rotulo="Cancelar unidade" largura={480} travado={cancelando} onFechar={onFechar} fechaNoFundo={false}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
          {previa ? `Cancelar a unidade ${previa.unidade} de ${previa.procedimento}?` : 'Cancelar unidade'}
        </h2>

        {!previa && !erro ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Calculando…
          </p>
        ) : previa && (
          <>
            <div data-conta-do-cancelamento style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
              borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)',
            }}>
              <div style={linha}>
                <span>Unidade {previa.unidade} de {previa.quantidade}</span>
                <span style={valor}>{formatBRL(previa.precoUnidade)}</span>
              </div>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                A venda ({formatBRL(previa.vendido)}, com o desconto) passa a valer {formatBRL(previa.valorNovo)}.
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
                    O a receber que passa do que a venda vale cai antes de devolver qualquer coisa.
                  </p>
                </div>
              )}
              {previa.devolvidoAntes > 0 && (
                <div style={linha}><span>Devolução já registrada</span><span style={valor}>{formatBRL(previa.devolvidoAntes)}</span></div>
              )}
              <div data-a-devolver style={{ ...linha, borderTop: '1px solid var(--hairline)', paddingTop: 6 }}>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>A devolver</span>
                <span style={valor}>{formatBRL(previa.devolver)}</span>
              </div>
            </div>

            <EscolhaDaDevolucao prefixo="cancelar-unidade" devolver={previa.devolver} parcial={previa.parcial}
              fidelidade={previa.fidelidade} estado={escolha} aoMudar={setEscolha} desligado={cancelando} opcoesDeVezes={opcoesDeVezes} />

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="field-label">Motivo do cancelamento *</span>
              <textarea className="field" rows={2} maxLength={500} value={motivo} disabled={cancelando}
                onChange={e => setMotivo(e.target.value)} placeholder="Ex.: a cliente mudou de cidade" />
            </label>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              A unidade deixa de valer e não volta a ser agendada. Não se desfaz.
            </p>
          </>
        )}
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={cancelando} onClick={onFechar}>Voltar</button>
          {previa && (
            <button type="button" className="btn-primary" disabled={cancelando || !pronto} onClick={confirmar}>
              {cancelando ? 'Cancelando…' : 'Cancelar unidade'}
            </button>
          )}
        </div>
      </div>
    </JanelaModal>
  )
}
