'use client'

import { useState, useTransition } from 'react'
import { Gift, Loader2, Ticket } from 'lucide-react'
import { cancelarVoucher, entregarVoucherProduto, resgatarRecompensa, vouchersDoClienteAcao } from '@/actions/fidelidade'
import { erroParaTela } from '@/lib/erro-na-tela'
import { formatarPontos, faltamPontos } from '@/lib/fidelidade/formato'
import { ROTULO_DO_TIPO, descricaoDoVoucher, situacaoDoVoucher, type TipoDeRecompensa } from '@/lib/fidelidade/voucher'
import type { Recompensa, VoucherDoCliente } from '@/lib/fidelidade/leitura'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { useFuso } from '@/components/shared/fuso'

/**
 * Recompensas e vouchers na ficha do cliente.
 *
 * Trocar debita os pontos NA HORA e dá ao cliente um voucher com validade.
 * Voucher de procedimento e de desconto se usa no PDV, ao receber (FD2a: o de
 * desconto em qualquer comanda, o de procedimento no atendimento dele);
 * voucher de produto é ENTREGUE aqui (baixa no estoque da unidade). Cancelar um
 * voucher não usado devolve os pontos; vencido não volta.
 */
const ROTULO_DA_SITUACAO = { ATIVO: 'Ativo', USADO: 'Usado', CANCELADO: 'Cancelado', VENCIDO: 'Vencido' } as const
const CHIP_DA_SITUACAO   = { ATIVO: 'chip chip-success', USADO: 'chip chip-muted', CANCELADO: 'chip chip-muted', VENCIDO: 'chip chip-warning' } as const

export function VouchersDoCliente({
  clientId, saldo, recompensas, inicial, podeGerenciar, unidade: unidadeDaFicha, unidades = [], onMudouSaldo,
}: {
  clientId:      string
  saldo:         number
  recompensas:   Recompensa[]
  inicial:       VoucherDoCliente[]
  podeGerenciar: boolean
  unidade:       string
  /**
   * Sem a unidade da ficha (a da rede com várias — D1 da 8ª simulação), as
   * unidades para escolher: a troca e a entrega do produto (que baixa no
   * estoque dela) perguntam, sem nenhuma escolhida.
   */
  unidades?:     { id: string; name: string }[]
  onMudouSaldo:  () => void
}) {
  const fuso = useFuso()
  const [unidadeEscolhida, setUnidadeEscolhida] = useState('')
  const perguntaAUnidade = !unidadeDaFicha && unidades.length > 1
  const unidade = unidadeDaFicha || (unidades.length === 1 ? unidades[0]!.id : unidadeEscolhida)
  const [vouchers, setVouchers] = useState(inicial)
  // A lista nova do servidor (`router.refresh` depois de um pagamento que usou
  // o voucher) vale sobre a cópia — o mesmo defeito do saldo (D16).
  const [daProp, setDaProp] = useState(inicial)
  if (daProp !== inicial) { setDaProp(inicial); setVouchers(inicial) }
  const [trocando, setTrocando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, iniciar] = useTransition()
  // A chave do envio (D10): o duplo clique em "Trocar" troca os pontos uma vez só.
  const envio = useEnvioUnico()

  function depois(fn: () => Promise<{ error?: string; aviso?: string }>) {
    setErro(null); setAviso(null)
    iniciar(async () => {
      try {
        const r = await fn()
        if (r.error) { setErro(r.error); return }
        if (r.aviso) setAviso(r.aviso)
        setVouchers(await vouchersDoClienteAcao(clientId))
        onMudouSaldo()
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível concluir.'))
      }
    })
  }

  const ativos = vouchers.filter(v => situacaoDoVoucher(v) === 'ATIVO').length

  return (
    <div data-testid="vouchers-do-cliente" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p className="overline">Vouchers{ativos > 0 && ` · ${ativos} ativo${ativos > 1 ? 's' : ''}`}</p>
        {podeGerenciar && recompensas.length > 0 && !trocando && (
          <button type="button" className="btn-ghost" onClick={() => setTrocando(true)}>
            <Gift size={14} /> Trocar pontos
          </button>
        )}
      </div>

      {podeGerenciar && perguntaAUnidade && (recompensas.length > 0 || vouchers.some(v => v.type === 'PRODUTO' && situacaoDoVoucher(v) === 'ATIVO')) && (
        <label data-unidade-do-voucher style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="field-label">Unidade da troca e da entrega</span>
          <select className="filtro-select" value={unidadeEscolhida} onChange={e => setUnidadeEscolhida(e.target.value)}>
            <option value="">Selecione a unidade…</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      )}

      {trocando && (
        <div data-testid="trocar-pontos" style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-row)', padding: 12,
        }}>
          {recompensas.map(r => {
            const alcanca = saldo >= r.points_cost
            const falta = faltamPontos(saldo, r.points_cost)
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{r.name}</p>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                    {ROTULO_DO_TIPO[r.type as TipoDeRecompensa] ?? r.type} · vale {r.validity_days} dias
                  </p>
                  {falta && <p data-faltam-pontos style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 700 }}>{falta}</p>}
                </div>
                <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 800, color: alcanca ? 'var(--brand)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                  {formatarPontos(r.points_cost)}
                </span>
                <button type="button" className="btn-primary" disabled={!alcanca || ocupado || !unidade}
                  title={falta ?? undefined}
                  onClick={() => depois(async () => {
                    const res = await resgatarRecompensa({ clientId, rewardId: r.id, branchId: unidade, envio: envio.chave() })
                    if (!res.error) { envio.renovar(); setTrocando(false) }
                    return res
                  })}>
                  Trocar
                </button>
              </div>
            )
          })}
          <button type="button" className="btn-ghost" onClick={() => setTrocando(false)} style={{ alignSelf: 'flex-start' }}>
            Fechar
          </button>
        </div>
      )}

      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--danger)' }}>{erro}</p>}
      {aviso && <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--warning)' }}>{aviso}</p>}

      {vouchers.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum voucher.</p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
          {vouchers.map(v => {
            const situacao = situacaoDoVoucher(v)
            return (
              <li key={v.id} data-testid="voucher" style={{ padding: '9px 0', borderBottom: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Ticket size={15} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{descricaoDoVoucher(v)}</p>
                    <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                      {situacao === 'ATIVO' || situacao === 'VENCIDO'
                        ? `Válido até ${new Date(v.expires_at).toLocaleDateString('pt-BR', { timeZone: fuso })}`
                        : situacao === 'USADO' && v.used_at
                          ? `Usado em ${new Date(v.used_at).toLocaleDateString('pt-BR', { timeZone: fuso })}`
                          : v.cancel_reason ? `Cancelado: ${v.cancel_reason}` : ''}
                    </p>
                  </div>
                  <span className={CHIP_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO[situacao]}</span>
                </div>
                {situacao === 'ATIVO' && v.type !== 'PRODUTO' && (
                  <p data-voucher-no-pdv style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    {v.type === 'PROCEDIMENTO'
                      ? 'Usa-se no PDV, ao receber a comanda do atendimento deste procedimento.'
                      : 'Usa-se no PDV, ao receber: na comanda do atendimento ou numa venda à vista.'}
                  </p>
                )}
                {podeGerenciar && situacao === 'ATIVO' && cancelando !== v.id && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {v.type === 'PRODUTO' && (
                      <button type="button" className="btn-primary" disabled={ocupado || !unidade} title={unidade ? undefined : 'Escolha a unidade da entrega'}
                        onClick={() => depois(() => entregarVoucherProduto({ voucherId: v.id, branchId: unidade }))}>
                        {ocupado ? <Loader2 size={13} className="animate-spin" /> : null} {v.product_id ? 'Entregar produto' : 'Entregar brinde'}
                      </button>
                    )}
                    <button type="button" className="btn-ghost" onClick={() => { setCancelando(v.id); setMotivo('') }}>
                      Cancelar voucher
                    </button>
                  </div>
                )}
                {cancelando === v.id && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input className="field" name="motivo-cancelamento" value={motivo} onChange={e => setMotivo(e.target.value)}
                      placeholder="Motivo (os pontos voltam ao cliente)" style={{ flex: 1, minWidth: 180 }} />
                    <button type="button" className="btn-primary" disabled={ocupado}
                      onClick={() => depois(async () => {
                        const r = await cancelarVoucher({ voucherId: v.id, motivo })
                        if (!r.error) setCancelando(null)
                        return r
                      })}>
                      Confirmar cancelamento
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setCancelando(null)}>Voltar</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
