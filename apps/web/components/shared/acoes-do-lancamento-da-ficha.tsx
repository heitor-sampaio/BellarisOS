'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { markTransactionPaid, reverseTransaction } from '@/actions/financial'
import { ConfirmarEstorno } from '@/components/shared/confirmar-estorno'
import { EstornarVendaDeCredito } from '@/components/shared/estornar-venda-de-credito'
import { ReceberNoCartao } from '@/components/shared/receber-no-cartao'
import { temBandeira } from '@/lib/financeiro/bandeiras'

/**
 * As ações de um lançamento na aba Financeiro da ficha da cliente — a mesma
 * porta dos dois financeiros, sem sair da ficha (A32 e A35 da 12ª simulação,
 * 2026-11-11):
 * - "Estornar" o pago (a Helena, no celular, só achava o estorno em Financeiro →
 *   Lançamentos, numa página de 20 mil px). A permissão é a do estorno (o
 *   Financeiro em Gerenciar); a janela é a de sempre (`ConfirmarEstorno`, com os
 *   pontos que saem — A30), e a venda de crédito na clínica abre a dela.
 * - "Receber" a parcela em aberto (a Heloísa, da recepção, via a parcela do
 *   crediário sem ação nem aviso). A permissão é a da baixa (Recebimentos); a
 *   janela pergunta a forma (a parcela do crediário nasce sem meio — D6 da 6ª).
 * As actions conferem tudo de novo (rede, unidade ao alcance, permissão).
 */
export function AcoesDoLancamentoDaFicha({ lancamento, slug, podeEstornar, podeReceber }: {
  lancamento: {
    id: string; descricao: string; valor: number; pago: boolean
    estornada?: boolean; estorno?: boolean; saida?: boolean
    metodo: string | null
    vendaDeProduto?: boolean; vendaDeCredito?: boolean; doAtendimento?: boolean
  }
  slug: string
  podeEstornar: boolean
  podeReceber: boolean
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [aEstornar, setAEstornar] = useState(false)
  const [creditoAEstornar, setCreditoAEstornar] = useState(false)
  const [aReceber, setAReceber] = useState(false)
  const l = lancamento
  const vivo = !l.estornada && !l.estorno && !l.saida
  const mostraEstornar = podeEstornar && vivo && l.pago
  const mostraReceber = podeReceber && vivo && !l.pago

  function estornar(motivo: string, voltou?: boolean) {
    iniciar(async () => {
      const r = await reverseTransaction(l.id, slug, motivo, voltou)
      if (r?.error) { toast.error(r.error); return }
      setAEstornar(false)
      toast.success('Lançamento estornado.')
      router.refresh()
    })
  }
  function receber(bandeira: string | null, vezes: number, forma: string | null) {
    iniciar(async () => {
      const r = await markTransactionPaid(l.id, slug, bandeira, vezes, forma)
      if (r?.error) { toast.error(r.error); return }
      setAReceber(false)
      toast.success('Recebido.')
      router.refresh()
    })
  }

  if (!mostraEstornar && !mostraReceber) return null
  const botao: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700,
    padding: '5px 10px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
  }
  return (
    <>
      {aEstornar && (
        <ConfirmarEstorno alvo={{ id: l.id, descricao: l.descricao, valor: l.valor, vendaDeProduto: l.vendaDeProduto, doAtendimento: l.doAtendimento }}
          estornando={pendente} onConfirmar={estornar} onVoltar={() => setAEstornar(false)} />
      )}
      {creditoAEstornar && (
        <EstornarVendaDeCredito transacaoId={l.id} descricao={l.descricao} onFechar={() => { setCreditoAEstornar(false); router.refresh() }} />
      )}
      {aReceber && (
        <ReceberNoCartao descricao={l.descricao} metodo={l.metodo} valor={l.valor} pending={pendente}
          aoConfirmar={receber} aoFechar={() => setAReceber(false)} />
      )}
      {mostraReceber && (
        <button type="button" data-receber-na-ficha onClick={() => temBandeira(l.metodo) || !l.metodo ? setAReceber(true) : receber(null, 1, null)}
          style={{ ...botao, border: '1.5px solid var(--success)', background: 'var(--success-bg)', color: 'var(--success)' }}>
          <CheckCircle2 size={12} aria-hidden /> Receber
        </button>
      )}
      {mostraEstornar && (
        <button type="button" data-estornar onClick={() => l.vendaDeCredito ? setCreditoAEstornar(true) : setAEstornar(true)}
          style={{ ...botao, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
          <RotateCcw size={12} aria-hidden /> Estornar
        </button>
      )}
    </>
  )
}
