import { Package } from 'lucide-react'

/**
 * O quadro "Estoque abaixo do mínimo" do dashboard da UNIDADE (A39 da 10ª
 * simulação, 2026-11-10): só o da rede tinha ("Estoque crítico"), e quem
 * opera a unidade só via o mínimo na tela do Estoque. A lista vem pronta do
 * servidor (`itensAbaixoDoMinimo`, a régua da tela de estoque); aqui só se
 * desenha.
 */
export interface ItemDoQuadroDoMinimo {
  productName: string
  saldo:       string
  minimo:      string
  situacao:    string
}

export function EstoqueAbaixoDoMinimo({ itens, href }: { itens: ItemDoQuadroDoMinimo[]; href: string }) {
  if (!itens.length) return null
  return (
    <div data-estoque-abaixo-do-minimo className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid var(--danger-border)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--danger-soft)' }}>
        <Package size={14} color="var(--danger)" aria-hidden />
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--danger)' }}>Estoque no mínimo ou abaixo</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', fontWeight: 800, background: 'var(--danger)', color: 'var(--surface)', padding: '2px 8px', borderRadius: 'var(--radius-chip-token)' }}>
          {itens.length}
        </span>
      </div>
      <div>
        {itens.slice(0, 5).map((item, i) => (
          <div key={item.productName} style={{
            padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            borderBottom: i < Math.min(itens.length, 5) - 1 ? '1px solid var(--hairline)' : 'none',
          }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', margin: 0, overflowWrap: 'anywhere' }}>{item.productName}</p>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {item.saldo} · mín. {item.minimo} · {item.situacao}
              </p>
            </div>
            <a href={href} style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--danger)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Ver →</a>
          </div>
        ))}
        {itens.length > 5 && (
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--hairline)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            +{itens.length - 5} mais
          </div>
        )}
      </div>
    </div>
  )
}
