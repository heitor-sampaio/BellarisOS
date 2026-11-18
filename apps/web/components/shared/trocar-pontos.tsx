'use client'

import { useState, useTransition } from 'react'
import { Gift } from 'lucide-react'
import { toast } from 'sonner'
import { resgatarRecompensa } from '@/actions/fidelidade'
import { erroParaTela } from '@/lib/erro-na-tela'
import { formatarPontos, faltamPontos } from '@/lib/fidelidade/formato'
import { ROTULO_DO_TIPO, type TipoDeRecompensa } from '@/lib/fidelidade/voucher'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import type { TrocaNaComanda } from '@/lib/fidelidade/troca-na-comanda'

/**
 * A50 da 24ª: trocar pontos por voucher sem sair da comanda (o receber o
 * atendimento e a "Nova venda"). A mesma troca da ficha (`resgatarRecompensa`):
 * debita os pontos na hora e emite o voucher, que a comanda já pode aplicar.
 * Sem a Fidelidade em Gerenciar, a linha diz de quem é a troca.
 */
export function TrocarPontos({ troca, aoTrocar }: {
  troca:    TrocaNaComanda
  /** O voucher emitido: quem chama relê o que a comanda oferece e o deixa escolhido. */
  aoTrocar: (voucherId: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  // A chave do envio (D10): o duplo clique em "Trocar" troca os pontos uma vez só.
  const envio = useEnvioUnico()

  if (!troca.podeTrocar) {
    return troca.quemTroca
      ? <p data-quem-troca-pontos style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{troca.quemTroca}</p>
      : null
  }

  function trocar(rewardId: string, nome: string) {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await resgatarRecompensa({ clientId: troca.clienteId, rewardId, branchId: troca.branchId, envio: envio.chave() })
        if (r.error || !r.voucherId) { setErro(r.error ?? 'Não foi possível trocar os pontos.'); return }
        envio.renovar()
        setAberto(false)
        toast.success(`Voucher emitido: ${nome}.`)
        aoTrocar(r.voucherId)
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível trocar os pontos.'))
      }
    })
  }

  return (
    <div data-trocar-pontos-na-comanda style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!aberto ? (
        <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAberto(true)}>
          <Gift size={14} aria-hidden="true" /> Trocar pontos por voucher
        </button>
      ) : (
        <div role="group" aria-label="Trocar pontos por voucher" style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-row)', padding: 12,
        }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            Saldo: <strong style={{ color: 'var(--text)' }}>{formatarPontos(troca.saldo)}</strong>
          </p>
          {troca.recompensas.map(r => {
            const falta = faltamPontos(troca.saldo, r.points_cost)
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', overflowWrap: 'anywhere' }}>{r.name}</p>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                    {ROTULO_DO_TIPO[r.type as TipoDeRecompensa] ?? r.type} · {formatarPontos(r.points_cost)}
                  </p>
                  {falta && <p data-faltam-pontos style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 'var(--weight-bold)' }}>{falta}</p>}
                </div>
                <button type="button" className="btn-primary" disabled={!!falta || ocupado} onClick={() => trocar(r.id, r.name)}>
                  {ocupado ? 'Trocando…' : 'Trocar'}
                </button>
              </div>
            )
          })}
          <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={ocupado}
            onClick={() => { setAberto(false); setErro(null) }}>
            Fechar
          </button>
        </div>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--danger)' }}>{erro}</p>}
    </div>
  )
}
