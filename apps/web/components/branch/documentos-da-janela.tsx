'use client'

import { useEffect, useState } from 'react'
import { FileCheck, FileText } from 'lucide-react'
import { documentosDaJanela, type DocumentoDaJanela } from '@/actions/documentos-da-janela'

/**
 * Os termos e contratos do agendamento na janela da agenda (A34 da 6ª
 * simulação): o título, a situação e se bloqueia o início — a recepção vê antes
 * de iniciar se falta a assinatura. Sem documento, não mostra nada.
 */
export function DocumentosDaJanela({ appointmentId }: { appointmentId: string }) {
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
          </li>
        ))}
      </ul>
    </div>
  )
}
