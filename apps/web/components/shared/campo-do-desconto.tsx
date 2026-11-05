'use client'

import { formatBRL, parseDinheiro } from '@estetica-os/utils'
import { SegSelect } from '@/components/shared/seg-select'
import { descontoEmReais, recusaDoDesconto, type Desconto } from '@/lib/vendas/desconto'

/**
 * O desconto de uma venda (2026-09-30): em R$ ou em %, sem teto. O mesmo campo
 * no pacote, no checkout do plano, no pagamento do contrato e no recebimento
 * da recepção. A conta mostrada é a de \`lib/vendas/desconto.ts\` — a mesma que
 * o servidor refaz; o valor que a tela mostra não é o que se grava.
 */

export interface EstadoDoDesconto { tipo: Desconto['tipo']; texto: string; motivo?: string }

export const SEM_DESCONTO: EstadoDoDesconto = { tipo: 'VALOR', texto: '' }

/** Um desconto já combinado (em reais) → o estado do campo. */
export function estadoDoDesconto(reais: number | null | undefined): EstadoDoDesconto {
  return reais && reais > 0 ? { tipo: 'VALOR', texto: reais.toFixed(2).replace('.', ',') } : SEM_DESCONTO
}

/** "1.234,56", "1.400", "40,5" ou "40.5" → número (`parseDinheiro`, D3); vazio → 0; ambíguo → NaN. */
function numero(texto: string): number {
  const s = texto.trim()
  if (!s) return 0
  return parseDinheiro(s)
}

/** O estado → o que a action recebe (nulo = sem desconto). */
export function descontoDoEstado(e: EstadoDoDesconto): Desconto | null {
  const valor = numero(e.texto)
  const motivo = e.motivo?.trim()
  return valor > 0 ? { tipo: e.tipo, valor, ...(motivo ? { motivo } : {}) } : null
}

/** O desconto em reais e o que sobra, para a tela mostrar o total. */
export function contaDoDesconto(total: number, e: EstadoDoDesconto): { reais: number; liquido: number; recusa: string | null } {
  const d = descontoDoEstado(e)
  const invalido = Number.isNaN(numero(e.texto)) ? 'Desconto inválido.' : null
  const recusa = invalido ?? recusaDoDesconto(total, d)
  const reais = recusa ? 0 : descontoEmReais(total, d)
  return { reais, liquido: Math.round((total - reais) * 100) / 100, recusa }
}

export function CampoDoDesconto({ estado, aoMudar, total, comMotivo = false }: {
  estado:  EstadoDoDesconto
  aoMudar: (e: EstadoDoDesconto) => void
  /** O valor sobre o qual o desconto é dado. */
  total:   number
  /**
   * Pede o motivo (opcional) quando há desconto — fin-01: ele vai ao lançamento
   * e aparece na lista do Financeiro. O recebimento do atendimento tem o dele.
   */
  comMotivo?: boolean
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
      {comMotivo && reais > 0 && !recusa && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <span style={rotulo}>Motivo do desconto (opcional)</span>
          <input className="field" aria-label="Motivo do desconto" maxLength={300}
            placeholder="Ex.: cliente fiel, kit, cortesia da casa"
            value={estado.motivo ?? ''} onChange={e => aoMudar({ ...estado, motivo: e.target.value })} />
          {!estado.motivo?.trim() && <LembreteDoMotivo />}
        </label>
      )}
    </div>
  )
}

/**
 * O desconto sem motivo grava (o motivo segue OPCIONAL — fin-01), mas a janela
 * lembra que ele existe (A49 da 7ª simulação: o desconto de R$ 100 da Ana saiu
 * sem o porquê, e a lista do Financeiro diz só o valor).
 */
export function LembreteDoMotivo() {
  return (
    <span data-lembrete-do-motivo style={{ fontSize: 'var(--text-2xs)', fontWeight: 500, color: 'var(--text-muted)' }}>
      Sem motivo, a lista do Financeiro mostra só o valor do desconto. Se quiser, diga o porquê (é opcional).
    </span>
  )
}
