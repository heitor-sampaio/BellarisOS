import { CalendarClock } from 'lucide-react'
import { validadeNaTela, loteVencido } from '@/lib/estoque/validade'

/**
 * Os lotes que vencem em 30 dias, no dashboard de quem tem o Estoque (A41 da 7ª
 * simulação, 2026-11-05: o lote que vencia em 10 dias aparecia só na tela do
 * Estoque). A lista vem pronta do servidor (`lotesVencendoDoRecorte`, a mesma
 * conta do cartão "Validade em 30 dias" do Estoque); aqui só se desenha.
 */
export interface LoteNoDashboard {
  id:         string
  produto:    string
  numero:     string | null
  validade:   string | null
  quantidade: number
  embalagem:  string
  /** O nome da unidade, quando o dashboard mostra mais de uma. */
  unidade?:   string | null
  /** O Estoque daquela unidade. */
  href:       string
}

export function LotesVencendo({ lotes, agora }: { lotes: LoteNoDashboard[]; agora: string }) {
  if (!lotes.length) return null
  const hoje = new Date(agora)
  return (
    <div data-lotes-vencendo className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid var(--warning-border)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--warning-border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warning-soft)' }}>
        <CalendarClock size={14} color="var(--warning)" aria-hidden />
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--warning)' }}>Lotes vencendo em 30 dias</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', fontWeight: 800, background: 'var(--warning)', color: 'var(--surface)', padding: '2px 8px', borderRadius: 'var(--radius-chip-token)' }}>
          {lotes.length}
        </span>
      </div>
      <div>
        {lotes.slice(0, 5).map((l, i) => {
          const vencido = loteVencido(l.validade, hoje)
          return (
            <div key={l.id} style={{
              padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              borderBottom: i < Math.min(lotes.length, 5) - 1 ? '1px solid var(--hairline)' : 'none',
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.produto}
                </p>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {[
                    l.numero ? `Lote ${l.numero}` : 'Lote sem número',
                    l.validade ? `${vencido ? 'venceu' : 'vence'} ${validadeNaTela(l.validade)}` : null,
                    `${l.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${l.embalagem}`,
                    l.unidade ?? null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <a href={l.href} style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--warning)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Ver →</a>
            </div>
          )
        })}
        {lotes.length > 5 && (
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--hairline)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            +{lotes.length - 5} mais
          </div>
        )}
      </div>
    </div>
  )
}
