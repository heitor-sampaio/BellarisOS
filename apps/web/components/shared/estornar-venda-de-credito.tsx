'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { previaDoEstornoDoCredito, estornarVendaDeCredito } from '@/actions/credito-na-clinica'
import type { PreviaDoEstornoDoCredito } from '@/lib/creditos/venda-de-credito'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import {
  EscolhaDaDevolucao, ESCOLHA_INICIAL, escolhaCompleta, escolhaParaAAcao, comOPagamentoInteiro, type EscolhaDaDevolucaoEstado,
} from '@/components/shared/escolha-da-devolucao'

/**
 * "Estornar a venda de crédito na clínica?" (decisão 1 da 9ª simulação: o
 * crédito vendido "estornável como as outras vendas — o saldo não usado
 * volta"). A conta é a do BANCO (`credito_estornar_venda` simulando): o que foi
 * vendido, o que ela já usou (fica pago) e o que volta — o saldo de crédito
 * dela hoje, até o pago. Quando volta só uma parte, a escolha de sempre
 * (`EscolhaDaDevolucao`, só o estorno): estorno parcial, ou — no cartão, o
 * único caminho — o pagamento inteiro e o usado lançado de novo.
 */
export function EstornarVendaDeCredito({ transacaoId, descricao, onFechar }: {
  transacaoId: string; descricao: string; onFechar: () => void
}) {
  const router = useRouter()
  const [previa, setPrevia] = useState<PreviaDoEstornoDoCredito | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  // Só o estorno: devolver o crédito como crédito não faz sentido.
  const [escolha, setEscolha] = useState<EscolhaDaDevolucaoEstado>({ ...ESCOLHA_INICIAL, destino: 'ESTORNO' })
  const opcoesDeVezes = useOpcoesDeVezes()
  const [estornando, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    previaDoEstornoDoCredito(transacaoId).then(r => {
      if (!vivo) return
      if (r.error || !r.previa) { setErro(r.error ?? 'Não consegui calcular o estorno.'); return }
      setPrevia(r.previa)
      // No cartão só existe o estorno inteiro: já vem escolhido, na forma original (A41 da 8ª).
      if (r.previa.parcial?.cartao) setEscolha(e => comOPagamentoInteiro({ ...e, comoEstornar: null }, r.previa!.parcial))
    })
    return () => { vivo = false }
  }, [transacaoId])

  const pronto = !!previa && previa.volta > 0 && motivo.trim().length > 0 && escolhaCompleta(previa.volta, previa.parcial, escolha)

  function confirmar() {
    if (!previa) return
    setErro(null)
    const { estorno, novo } = escolhaParaAAcao(previa.volta, previa.parcial, escolha)
    iniciar(async () => {
      const r = await estornarVendaDeCredito(transacaoId, { motivo: motivo.trim(), estorno, novo, esperado: previa.volta })
      if (r.error) { setErro(r.error); return }
      toast.success(`Venda de crédito estornada: ${formatBRL(r.volta ?? previa.volta)} voltam à cliente.`)
      onFechar()
      router.refresh()
    })
  }

  const linha = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' } as const
  const valor = { color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' } as const
  const titulo = 'Estornar a venda de crédito na clínica?'

  return (
    <JanelaModal rotulo={titulo} largura={480} travado={estornando} onFechar={onFechar} fechaNoFundo={false}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{titulo}</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{descricao}</strong>. Volta à cliente o crédito que ela ainda não usou; o que ela já usou fica pago. Não se desfaz.
        </p>
        {!previa && !erro && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Calculando…
          </p>
        )}
        {previa && (
          <>
            <div data-conta-do-estorno-do-credito style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
              borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--bg-app)',
            }}>
              <div style={linha}><span>Vendido</span><span style={valor}>{formatBRL(previa.pago)}</span></div>
              <div style={linha}><span>Já usado</span><span style={valor}>{formatBRL(previa.usado)}</span></div>
              <div style={{ ...linha, borderTop: '1px solid var(--hairline)', paddingTop: 6 }}>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>Volta à cliente</span><span style={valor}>{formatBRL(previa.volta)}</span>
              </div>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                O que volta é o saldo de crédito dela hoje ({formatBRL(previa.saldo)}), até o que ela pagou
                {previa.metodo ? ` (${rotuloDaForma(previa.metodo, previa.vezes)})` : ''}. O crédito que volta sai do saldo dela.
              </p>
            </div>
            {previa.volta <= 0 ? (
              <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                O crédito desta venda já foi todo usado: não há o que devolver.
              </p>
            ) : previa.parcial ? (
              <EscolhaDaDevolucao prefixo="estorno-credito" devolver={previa.volta} parcial={previa.parcial} fidelidade={false}
                estado={escolha} aoMudar={setEscolha} desligado={estornando} opcoesDeVezes={opcoesDeVezes} soEstorno />
            ) : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="field-label">Motivo do estorno *</span>
              <textarea className="field" rows={2} maxLength={500} value={motivo} disabled={estornando}
                onChange={e => setMotivo(e.target.value)} placeholder="Ex.: a cliente desistiu do vale" />
            </label>
          </>
        )}
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={estornando} onClick={onFechar}>Voltar</button>
          <button type="button" className="btn-primary" disabled={estornando || !pronto} onClick={confirmar}>
            {estornando ? 'Estornando…' : 'Confirmar estorno'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
