'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileCheck, FileText, PenLine } from 'lucide-react'
import { rotaNoPortal } from '@/lib/rotas'
import { documentosDaJanela, type DocumentoDaJanela } from '@/actions/documentos-da-janela'
import { EnviarLinkDeAssinatura } from '@/components/shared/enviar-link-de-assinatura'

/**
 * Os termos e contratos do agendamento na janela da agenda (A34 da 6ª
 * simulação): o título, a situação e se bloqueia o início — a recepção vê antes
 * de iniciar se falta a assinatura. Sem documento, não mostra nada.
 */
export function DocumentosDaJanela({ appointmentId, slug }: { appointmentId: string; slug: string }) {
  const pathname = usePathname()
  const [docs, setDocs] = useState<DocumentoDaJanela[] | null>(null)
  useEffect(() => {
    let vivo = true
    documentosDaJanela(appointmentId).then(r => { if (vivo) setDocs(r) }).catch(() => { /* sem a lista, o bloco não aparece */ })
    return () => { vivo = false }
  }, [appointmentId])

  if (!docs?.length) return null
  return (
    <div data-documentos-do-agendamento style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="overline">Termos e contratos</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {docs.map(d => (
          <li key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
            {d.assinado
              ? <FileCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} aria-hidden="true" />
              : <FileText size={14} style={{ color: d.bloqueia ? 'var(--warning)' : 'var(--text-faint)', flexShrink: 0 }} aria-hidden="true" />}
            {/* A29 da 7ª: o nome inteiro (quebra a linha), e não cortado sem dica. */}
            <span data-titulo-do-documento title={d.titulo} style={{ flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{d.titulo}</span>
            <span style={{ flexShrink: 0, fontWeight: 700, color: d.assinado ? 'var(--success)' : d.bloqueia ? 'var(--warning)' : 'var(--text-muted)' }}>
              {d.situacao}{!d.assinado && d.bloqueia ? ' · bloqueia o início' : ''}
            </span>
            {/* A23 da 9ª: colher a assinatura daqui, a quem tem os Termos em Gerenciar. */}
            {d.podeColher && (
              <Link href={rotaNoPortal(pathname, slug, `/documentos/${d.id}/assinar?voltar=${encodeURIComponent(pathname)}`)} data-colher-assinatura
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}>
                <PenLine size={12} aria-hidden="true" /> Colher assinatura
              </Link>
            )}
            {/* A9 da 11ª: o que falta no cadastro, com o caminho para completar. */}
            {d.podeCompletar && d.clienteId && (
              <Link href={rotaNoPortal(pathname, slug, `/clients/${d.clienteId}?aba=dados`)} data-completar-cadastro
                style={{ flexShrink: 0, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}>
                Completar o cadastro
              </Link>
            )}
            {/* A8 da 11ª: o link de assinatura também daqui, não só da ficha. */}
            {d.podeEnviarLink && <EnviarLinkDeAssinatura documentoId={d.id} jaEnviadoAte={d.linkAte} compacto />}
          </li>
        ))}
      </ul>
    </div>
  )
}
