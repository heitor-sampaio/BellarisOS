'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Plus, FileImage } from 'lucide-react'
import { UploadForm } from '@/components/branch/client-documents-tab'

export interface FotoDoAtendimento {
  id:        string
  name:      string
  fileName:  string
  mimeType:  string | null
  createdAt: string
  /** URL assinada (bucket privado). */
  url:       string
}

/**
 * As fotos clínicas DESTE atendimento (A30 da simulação de 2026-10-27): a
 * foto entrava só por Clientes → Documentos, fora do fluxo e sem saber de
 * qual atendimento era. É o mesmo upload dos Documentos (bucket privado,
 * categoria "Foto clínica", a recusa do anexo clínico), ligado ao
 * agendamento. Quem hospeda só monta este cartão para quem vê o prontuário.
 */
export function FotosDoAtendimento({ fotos, clientId, branchId, slug, appointmentId, podeAnexar }: {
  fotos:         FotoDoAtendimento[]
  clientId:      string
  branchId:      string
  slug:          string
  appointmentId: string
  podeAnexar:    boolean
}) {
  const router = useRouter()
  const [anexando, setAnexando] = useState(false)
  const fechar = useCallback(() => { setAnexando(false); router.refresh() }, [router])
  const hoje = new Date().toLocaleDateString('pt-BR')

  return (
    <div data-fotos-do-atendimento className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Camera size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Fotos do atendimento</h3>
        {podeAnexar && !anexando && (
          <button type="button" onClick={() => setAnexando(true)} className="btn-secondary" style={{ gap: 6, fontSize: 'var(--text-sm-sz)' }}>
            <Plus size={13} /> Anexar foto
          </button>
        )}
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {anexando && (
          <UploadForm
            clientId={clientId} branchId={branchId} slug={slug}
            podeAnexarClinico podeAnexarComum={false}
            onClose={fechar}
            categoriaFixa="foto_clinica"
            appointmentId={appointmentId}
            nomePadrao={`Foto clínica — ${hoje}`}
            titulo="Nova foto clínica"
            rotuloDoEnvio="Anexar foto"
            aceita=".jpg,.jpeg,.png,.webp"
          />
        )}

        {fotos.length === 0 && !anexando && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
            Nenhuma foto neste atendimento. Ela fica no prontuário da cliente, ligada a ele.
          </p>
        )}

        {fotos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {fotos.map(f => (
              <a key={f.id} href={f.url || undefined} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none', color: 'var(--text)' }}>
                <div style={{ aspectRatio: '1 / 1', borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {f.url && (f.mimeType ?? '').startsWith('image/')
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária: o otimizador do Next não serve aqui
                    ? <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <FileImage size={22} style={{ color: 'var(--text-faint)' }} />}
                </div>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.fileName}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
