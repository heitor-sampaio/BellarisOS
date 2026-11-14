'use client'

import { useState } from 'react'
import { formatarPontos } from '@/lib/fidelidade/formato'
import { descontoDoVoucher } from '@/lib/fidelidade/voucher'
import { SEM_FIDELIDADE, contaDaFidelidade, type ContaDaFidelidade, type EscolhaDaFidelidade, type FidelidadeDaVenda } from '@/lib/fidelidade/conta-na-venda'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * FD2a (o plano de adaptação do PDV, 2026-11-13): os pontos e o voucher de
 * desconto também na "Nova venda" — o mesmo bloco do receber o atendimento.
 * Valem no pagamento à vista: no crediário ou no "a receber", a tela diz e
 * não oferece. O voucher desconta primeiro; os pontos valem sobre o que sobra.
 */
export function PontosNaVenda({ fidelidade, vendido, escolha, conta, aVista, aoMudar }: {
  fidelidade: FidelidadeDaVenda
  vendido:    number
  escolha:    EscolhaDaFidelidade
  conta:      ContaDaFidelidade
  aVista:     boolean
  aoMudar:    (e: EscolhaDaFidelidade) => void
}) {
  const vouchers = fidelidade.vouchers
    .map(v => ({ v, d: descontoDoVoucher(v, { procedureId: null, preco: vendido }) }))
    .filter(({ d }) => !d.motivo && d.desconto > 0)
  if (!vouchers.length && fidelidade.saldo <= 0) return null
  return (
    <div data-pontos-da-venda style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
      borderRadius: 'var(--radius-row)', padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="field-label" style={{ margin: 0 }}>Fidelidade</span>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          Saldo: <strong style={{ color: 'var(--text)' }}>{formatarPontos(fidelidade.saldo)}</strong>
        </span>
      </div>
      {!aVista ? (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          Os pontos e o voucher se usam no pagamento à vista.
        </p>
      ) : (
        <>
          {vouchers.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="field-label">Aplicar voucher</span>
              <select className="filtro-select" aria-label="Aplicar voucher" value={escolha.voucherId ?? ''}
                onChange={e => aoMudar({ pontos: 0, voucherId: e.target.value || null })}>
                <option value="">Nenhum</option>
                {vouchers.map(({ v, d }) => <option key={v.id} value={v.id}>{v.name} (−{brl(d.desconto)})</option>)}
              </select>
            </label>
          )}
          {fidelidade.saldo > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" min={0} step={1} inputMode="numeric" className="field" aria-label="Pontos a usar"
                  value={escolha.pontos ? String(escolha.pontos) : ''} placeholder="0" style={{ flex: 1 }}
                  onChange={e => aoMudar({ ...escolha, pontos: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
                <button type="button" className="btn-ghost" disabled={conta.maximo <= 0}
                  onClick={() => aoMudar({ ...escolha, pontos: conta.maximo })}>
                  Usar o máximo
                </button>
              </div>
              {conta.motivo ? (
                <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{conta.motivo}</p>
              ) : conta.pontos > 0 ? (
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>
                  {formatarPontos(conta.pontos)} = <strong style={{ color: 'var(--brand)' }}>−{brl(conta.desconto)}</strong>
                </p>
              ) : (
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  Cada ponto vale {brl(fidelidade.valorDoPonto)}.
                  {fidelidade.minimo > 0 && ` Mínimo de ${fidelidade.minimo} pontos.`}
                  {fidelidade.tetoPct < 100 && ` Pontos pagam até ${String(fidelidade.tetoPct).replace('.', ',')}% do valor.`}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

/**
 * A fidelidade num formulário de venda: a escolha, a conta e o bloco. `aPagar`
 * é o que a cliente paga em dinheiro (o total do pagamento e do "Vender por");
 * `paraEnviar`, o que vai à action (nulo fora do à vista ou sem nada escolhido).
 */
export function useFidelidadeNaVenda(fidelidade: FidelidadeDaVenda | null | undefined, vendido: number, formaDoPagamento: string) {
  const [escolha, setEscolha] = useState<EscolhaDaFidelidade>(SEM_FIDELIDADE)
  const aVista = formaDoPagamento === 'AVISTA'
  const ativa = !!fidelidade && aVista
  const conta = contaDaFidelidade(vendido, ativa ? fidelidade : null, ativa ? escolha : SEM_FIDELIDADE)
  const escolheu = ativa && (escolha.pontos > 0 || !!escolha.voucherId)
  return {
    aPagar: conta.restante,
    recusa: escolheu ? conta.motivo ?? null : null,
    paraEnviar: escolheu ? escolha : null,
    reiniciar: () => setEscolha(SEM_FIDELIDADE),
    bloco: fidelidade ? (
      <PontosNaVenda fidelidade={fidelidade} vendido={vendido} escolha={escolha} conta={conta} aVista={aVista} aoMudar={setEscolha} />
    ) : null,
  }
}
