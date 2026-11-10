import type { ReactNode } from 'react'
import { validadeNaTela } from '@/lib/estoque/validade'

/**
 * Os cartões do topo do Estoque (rede e unidade). A40 da 10ª simulação
 * (2026-11-10): a 1440 px saíam cortados — cinco colunas iguais, com o rótulo e
 * o detalhe numa linha só, com reticências — e o "Validade em 30 dias" dizia só
 * o produto. A grade agora se ajusta à largura (o cartão que não cabe desce), o
 * rótulo quebra linha e o detalhe pode ter mais de uma linha (o lote e a data
 * de cada um). Só desenha: os números vêm prontos da página (lib/metrics).
 */
export interface CartaoDoEstoque {
  id?:        string
  label:      string
  value:      string
  /** Uma linha ou várias embaixo do número. */
  detalhe?:   string | string[]
  icon:       ReactNode
  iconBg:     string
  color:      string
  labelColor: string
  brand:      boolean
}

export function CartoesDoEstoque({ cartoes }: { cartoes: CartaoDoEstoque[] }) {
  return (
    <div data-kpis-do-estoque style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      {cartoes.map(k => {
        const linhas = k.detalhe == null ? [] : Array.isArray(k.detalhe) ? k.detalhe : [k.detalhe]
        return (
          <div
            key={k.label}
            data-kpi={k.id}
            className={k.brand ? 'card-brand' : 'card'}
            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}
          >
            <div className="kpi-icone" style={{
              width: 40, height: 40, borderRadius: 'var(--radius-field-token)', flexShrink: 0,
              background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {k.icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="kpi-rotulo" style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: k.labelColor, letterSpacing: '0.05em', overflowWrap: 'anywhere' }}>
                {k.label}
              </p>
              <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: '-0.02em', color: k.color, marginTop: 3, whiteSpace: 'nowrap' }}>
                {k.value}
              </p>
              {linhas.map(l => (
                <p key={l} style={{ fontSize: 'var(--text-2xs)', color: k.brand ? 'inherit' : 'var(--text-muted)', marginTop: 2, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
                  {l}
                </p>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** "Gel — lote GA-1 · 15/11/2026" (A40 da 10ª): o lote e a data, não só o produto. */
export function loteNoCartao(produto: string, l: { numero: string | null; validade: string | null }): string {
  const lote = l.numero ? `lote ${l.numero}` : 'lote sem número'
  const dia = validadeNaTela(l.validade)
  return `${produto} — ${lote}${dia ? ` · ${dia}` : ''}`
}

/** As linhas do cartão de validade: até três lotes e "e mais N". */
export function linhasDaValidade(lotes: string[]): string[] | undefined {
  if (!lotes.length) return undefined
  return [...lotes.slice(0, 3), ...(lotes.length > 3 ? [`e mais ${lotes.length - 3}`] : [])]
}
