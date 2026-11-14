'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Plus } from 'lucide-react'
import { UploadForm, DocumentRow, type ClientDocumentItem } from '@/components/branch/client-documents-tab'

/**
 * "Anexos clínicos" (bloco Prontuário, PR1b — a revisão do Heitor,
 * 2026-11-13): o exame, o laudo, a receita, a foto e o termo anexados sem
 * atendimento moram no PRONTUÁRIO, não mais na aba Documentos (que fica com o
 * comum: RG, comprovante, "outro", contrato). Anexar, ver, enviar à cliente e
 * excluir — que só marca: prontuário não se apaga (§14).
 *
 * A foto ligada a um atendimento do prontuário aparece nele (PR1a); a que
 * ficou de fora (o atendimento ainda aberto) vem para cá, com o caminho ao
 * atendimento.
 */
export function AnexosClinicos({ anexos, clientId, branchId, slug, podeAnexar, portalNoPlano }: {
  anexos:        ClientDocumentItem[]
  clientId:      string
  branchId:      string
  slug:          string
  /** O Prontuário em Gerenciar (e a cliente no "só os meus"): anexar, enviar e excluir. */
  podeAnexar:    boolean
  portalNoPlano: boolean
}) {
  const router = useRouter()
  const [anexando, setAnexando] = useState(false)
  const [removidos, setRemovidos] = useState<Set<string>>(() => new Set())
  const lista = anexos.filter(a => !removidos.has(a.id))

  return (
    <section data-anexos-clinicos aria-label="Anexos clínicos" className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: lista.length > 0 || anexando ? '1px solid var(--hairline)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Paperclip size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Anexos clínicos</h3>
        {podeAnexar && !anexando && (
          <button type="button" onClick={() => setAnexando(true)} className="btn-secondary" style={{ gap: 6, fontSize: 'var(--text-sm-sz)' }}>
            <Plus size={13} /> Anexar
          </button>
        )}
      </div>

      {anexando && (
        <div style={{ padding: '16px 20px' }}>
          <UploadForm
            clientId={clientId} branchId={branchId} slug={slug}
            podeAnexarClinico podeAnexarComum={false}
            titulo="Novo anexo clínico"
            exemploDoNome="Ex: Exame de sangue — jun 2026"
            onClose={() => { setAnexando(false); router.refresh() }}
          />
        </div>
      )}

      {lista.length === 0 && !anexando && (
        <p style={{ padding: '0 20px 16px', fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
          Nenhum exame, laudo, receita ou termo anexado. A foto de um atendimento aparece no registro dele, acima.
        </p>
      )}

      {lista.map(doc => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          slug={slug}
          clientId={clientId}
          podeApagar={podeAnexar}
          onDelete={id => { setRemovidos(prev => new Set(prev).add(id)); router.refresh() }}
          portalNoPlano={portalNoPlano}
          clinico
        />
      ))}
    </section>
  )
}
