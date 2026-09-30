'use client'

import { formatBRL } from '@estetica-os/utils'
import { SegSelect } from '@/components/shared/seg-select'
import { descontoEmReais, recusaDoDesconto, type Desconto } from '@/lib/vendas/desconto'

/**
 * O desconto de uma venda (2026-09-30): em R$ ou em %, sem teto. O mesmo campo
 * no pacote, no checkout do plano, no pagamento do contrato e no recebimento
 * da recepção. A conta mostrada é a de \`lib/vendas/desconto.ts\` — a mesma que
 * o servidor refaz; o valor que a tela mostra não é o que se grava.
 */

export interface EstadoDoDesconto { tipo: Desconto['tipo']; texto: string }

export const SEM_DESCONTO: EstadoDoDesconto = { tipo: 'VALOR', texto: '' }

/** Um desconto já combinado (em reais) → o estado do campo. */
export function estadoDoDesconto(reais: number | null | undefined): EstadoDoDesconto {
  return reais && reais > 0 ? { tipo: 'VALOR', texto: reais.toFixed(2).replace('.', ',') } : SEM_DESCONTO
}

/** "1.234,56", "40,5" ou "40.5" → número; vazio → 0. */
function numero(texto: string): number {
  const s = texto.trim()
  if (!s) return 0
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : NaN
}

/** O estado → o que a action recebe (nulo = sem desconto). */
export function descontoDoEstado(e: EstadoDoDesconto): Desconto | null {
  const valor = numero(e.texto)
  return valor > 0 ? { tipo: e.tipo, valor } : null
}

/** O desconto em reais e o que sobra, para a tela mostrar o total. */
export function contaDoDesconto(total: number, e: EstadoDoDesconto): { reais: number; liquido: number; recusa: string | null } {
  const d = descontoDoEstado(e)
  const invalido = Number.isNaN(numero(e.texto)) ? 'Desconto inválido.' : null
  const recusa = invalido ?? recusaDoDesconto(total, d)
  const reais = recusa ? 0 : descontoEmReais(total, d)
  return { reais, liquido: Math.round((total - reais) * 100) / 100, recusa }
}

export function CampoDoDesconto({ estado, aoMudar, total }: {
  estado:  EstadoDoDesconto
  aoMudar: (e: EstadoDoDesconto) => void
  /** O valor sobre o qual o desconto é dado. */
  total:   number
}) {
  const { reais, liquido, recusa } = contaDoDesconto(total, estado)
  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <div data-campo-desconto style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={rotulo}>Desconto (opcional)</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <SegSelect
          ariaLabel="Tipo de desconto"
          options={[{ key: 'VALOR', label: 'R$' }, { key: 'PERCENTUAL', label: '%' }]}
          value={estado.tipo}
          onSelect={k => aoMudar({ ...estado, tipo: k as Desconto['tipo'] })}
        />
        <input className="field" inputMode="decimal" aria-label="Desconto" style={{ flex: 1, minWidth: 0 }}
          placeholder={estado.tipo === 'PERCENTUAL' ? '0' : '0,00'}
          value={estado.texto} onChange={e => aoMudar({ ...estado, texto: e.target.value })} />
      </div>
      {recusa ? (
        <p role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{recusa}</p>
      ) : reais > 0 ? (
        <p data-testid="conta-do-desconto" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-soft)' }}>
          −{formatBRL(reais)} sobre {formatBRL(total)} · fica <strong style={{ color: 'var(--text)' }}>{formatBRL(liquido)}</strong>
        </p>
      ) : null}
    </div>
  )
}
