import Link from 'next/link'
import { Compass, ArrowLeft } from 'lucide-react'

/**
 * A rota que não existe (D12 da simulação de 2026-10-27): o 404 padrão do Next
 * vinha em inglês, sem layout nem caminho de volta. Cada lugar (raiz, rede,
 * unidade, portal da cliente) renderiza esta tela DENTRO do layout dele, com o
 * link para o início daquele lugar.
 */
export function PaginaNaoEncontrada({ voltarPara, rotuloDaVolta = 'Voltar ao início' }: {
  voltarPara:     string
  rotuloDaVolta?: string
}) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', margin: '0 auto 14px',
          background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Compass size={20} style={{ color: 'var(--brand)' }} aria-hidden="true" />
        </div>
        <h1 style={{
          fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
          color: 'var(--text)', marginBottom: 6,
        }}>
          Página não encontrada
        </h1>
        <p style={{
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
          lineHeight: 'var(--leading-snug)', marginBottom: 20,
        }}>
          O endereço não existe ou mudou de lugar. Confira o link ou volte para o início.
        </p>
        <Link href={voltarPara} className="btn-primary" style={{ display: 'inline-flex' }}>
          <ArrowLeft size={14} aria-hidden="true" /> {rotuloDaVolta}
        </Link>
      </div>
    </div>
  )
}
