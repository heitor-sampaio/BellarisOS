import type { Metadata } from 'next'
import { BadgeCheck, CircleAlert } from 'lucide-react'
import { espiarLinkDaFicha, MENSAGEM_DO_LINK_DA_FICHA } from '@/lib/pre-atendimento/link-publico'
import { formatarTelefone } from '@/lib/documentos/valores'
import { telefoneParaWhatsApp } from '@/lib/documentos/link'
import { MolduraDaVerificacao } from '@/app/verificar/moldura'
import { FichaPorLink } from './ficha-por-link'

/**
 * O link da ficha de pré-atendimento — SEM sessão (rota pública no proxy),
 * para a cliente que não usa o app (2026-10-20).
 *
 * Antes de ela confirmar quem é, a página mostra só a clínica: as perguntas
 * (e as respostas de antes) são dado de saúde, e quem tem o link na mão pode
 * não ser a cliente. `no-referrer`: o token está na URL.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ficha de pré-atendimento — BellarisOS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function FichaPeloLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const espiada = await espiarLinkDaFicha(decodeURIComponent(token))
  const telefone = formatarTelefone(espiada.telefone)
  const zap = telefoneParaWhatsApp(espiada.telefone)

  return (
    <MolduraDaVerificacao marca={null}>
      {espiada.estado === 'valido'
        ? <FichaPorLink token={decodeURIComponent(token)} clinica={espiada.clinica ?? 'A clínica'} pede={espiada.pede} />
        : (
          <div className="card" style={{ padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: espiada.estado === 'usado' ? 'var(--success-bg)' : 'var(--warning-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {espiada.estado === 'usado'
                ? <BadgeCheck size={22} color="var(--success)" />
                : <CircleAlert size={22} color="var(--warning)" />}
            </div>
            <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
              {espiada.estado === 'usado' ? 'Ficha já respondida' : 'Link indisponível'}
            </h1>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }} data-estado={espiada.estado}>
              {MENSAGEM_DO_LINK_DA_FICHA[espiada.estado]}
            </p>
            {espiada.estado === 'usado' && (
              <p data-contato-da-clinica style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                Precisa corrigir alguma resposta? Fale com {espiada.clinica ?? 'a clínica'}
                {telefone ? <>: <a href={`tel:${zap ? `+${zap}` : telefone.replace(/\D/g, '')}`} style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>{telefone}</a></> : '.'}
                {zap && <> · <a href={`https://wa.me/${zap}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>WhatsApp</a></>}
              </p>
            )}
          </div>
        )}
    </MolduraDaVerificacao>
  )
}
