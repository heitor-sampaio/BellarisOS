import type { Metadata } from 'next'
import { BadgeCheck, CircleAlert } from 'lucide-react'
import { espiarLink } from '@/lib/documentos/link-publico'
import { MENSAGEM_DO_ESTADO } from '@/lib/documentos/link'
import { MolduraDaVerificacao } from '@/app/verificar/moldura'
import { AssinarPorLink } from './assinar-por-link'

/**
 * O link público de assinatura — SEM sessão (rota pública no proxy).
 *
 * Antes de o cliente confirmar quem é, a página mostra só a clínica e "um
 * documento": o título pode dizer o procedimento, e quem tem o link na mão
 * pode não ser o cliente (mensagem encaminhada, celular emprestado).
 *
 * `no-referrer`: o token está na URL, e nenhum recurso carregado daqui (o PDF
 * do modelo, por link do storage) pode levá-lo no cabeçalho.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Assinar documento — BellarisOS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function AssinarPeloLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const espiada = await espiarLink(decodeURIComponent(token))

  return (
    <MolduraDaVerificacao marca={null}>
      {espiada.estado === 'valido'
        ? <AssinarPorLink token={decodeURIComponent(token)} clinica={espiada.clinica ?? 'A clínica'} pede={espiada.pede} />
        : (
          <div className="card" style={{ padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: espiada.estado === 'usado' ? 'var(--success-bg)' : 'var(--warning-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {espiada.estado === 'usado'
                ? <BadgeCheck size={22} color="var(--success)" />
                : <CircleAlert size={22} color="var(--warning)" />}
            </div>
            <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
              {espiada.estado === 'usado' ? 'Documento já assinado' : 'Link indisponível'}
            </h1>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }} data-estado={espiada.estado}>
              {MENSAGEM_DO_ESTADO[espiada.estado]}
            </p>
          </div>
        )}
    </MolduraDaVerificacao>
  )
}
