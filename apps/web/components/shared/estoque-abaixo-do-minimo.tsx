import { Package } from 'lucide-react'

/**
 * O quadro "Estoque abaixo do mínimo" do dashboard da UNIDADE (A39 da 10ª
 * simulação, 2026-11-10): só o da rede tinha ("Estoque crítico"), e quem
 * opera a unidade só via o mínimo na tela do Estoque. A lista vem pronta do
 * servidor (`itensAbaixoDoMinimo`, a régua da tela de estoque); aqui só se
 * desenha.
 *
 * D14 da 28ª (ES-20): o número do quadro conta só o "no mínimo ou abaixo",
 * como o "Estoque baixo" do Estoque; o zerado aparece à parte, em "Sem
 * estoque", fora da conta.
 */
export interface ItemDoQuadroDoMinimo {
  productName: string
  saldo:       string
  minimo:      string
  situacao:    string
  /** Zerado: vai ao "Sem estoque", fora da conta (ES-20). */
  semEstoque?: boolean
}

function Linhas({ itens, href, ultimaSemBorda }: { itens: ItemDoQuadroDoMinimo[]; href: string; ultimaSemBorda: boolean }) {
  const vistos = itens.slice(0, 5)
  return (
    <>
      {vistos.map((item, i) => (
        <div key={item.productName} style={{
          padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          borderBottom: i < vistos.length - 1 || !ultimaSemBorda || itens.length > 5 ? '1px solid var(--hairline)' : 'none',
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
        <div style={{
          padding: '10px 18px', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', textAlign: 'center',
          borderBottom: ultimaSemBorda ? 'none' : '1px solid var(--hairline)',
        }}>
          +{itens.length - 5} mais
        </div>
      )}
    </>
  )
}

export function EstoqueAbaixoDoMinimo({ itens, href }: { itens: ItemDoQuadroDoMinimo[]; href: string }) {
  if (!itens.length) return null
  const baixos = itens.filter(i => !i.semEstoque)
  const zerados = itens.filter(i => i.semEstoque)
  return (
    <div data-estoque-abaixo-do-minimo className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid var(--danger-border)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--danger-soft)' }}>
        <Package size={14} color="var(--danger)" aria-hidden />
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--danger)' }}>Estoque no mínimo ou abaixo</span>
        <span data-conta-do-minimo style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', fontWeight: 800, background: 'var(--danger)', color: 'var(--surface)', padding: '2px 8px', borderRadius: 'var(--radius-chip-token)' }}>{baixos.length}</span>
      </div>
      <div>
        {baixos.length > 0
          ? <Linhas itens={baixos} href={href} ultimaSemBorda={zerados.length === 0} />
          : (
            <p style={{ padding: '11px 18px', margin: 0, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', borderBottom: '1px solid var(--hairline)' }}>
              Nenhum produto no mínimo ou abaixo.
            </p>
          )}
        {zerados.length > 0 && (
          <div data-sem-estoque>
            <p style={{ padding: '10px 18px 0', margin: 0, fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Sem estoque
            </p>
            <Linhas itens={zerados} href={href} ultimaSemBorda />
          </div>
        )}
      </div>
    </div>
  )
}
