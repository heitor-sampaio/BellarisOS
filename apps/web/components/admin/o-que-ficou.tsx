import Link from 'next/link'
import { caminhosDoQueFica, type OQueFicaNaUnidade } from '@/lib/unidades/o-que-fica'

/**
 * O que ficou numa unidade e o caminho para resolver cada coisa (F72; D2 e
 * A32 da 14ª, H6): a agenda dela no dia do primeiro agendamento, o estoque
 * dela (a transferência abre com ela de origem), o a receber e as comissões.
 * Os links levam às telas que já existem — a mesma lista na janela de
 * desativar e, depois do clique, no cartão e no detalhe da desativada.
 */
export function CaminhosDoQueFicou({ branchId, oQueFica }: { branchId: string; oQueFica: OQueFicaNaUnidade }) {
  const caminhos = caminhosDoQueFica(branchId, oQueFica)
  if (!caminhos.length) return null
  const texto = { fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 } as const
  return (
    <>
      {caminhos.map(c => (
        <div key={c.chave} data-caminho={c.chave} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
          <p style={texto}>{c.texto}</p>
          <Link href={c.href} className="btn-secondary" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>
            {c.rotulo}
          </Link>
        </div>
      ))}
    </>
  )
}
