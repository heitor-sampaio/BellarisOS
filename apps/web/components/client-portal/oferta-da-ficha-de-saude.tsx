'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, ClipboardList, Loader2 } from 'lucide-react'
import { abrirMinhaFichaDeSaude } from '@/actions/pre-atendimento-cliente'

/**
 * "Responda a sua ficha de saúde" no Início (15ª A33 = 16ª A11): a cliente com
 * atendimento marcado e sem ficha válida. O pendente nasce no clique dela
 * (`abrirMinhaFichaDeSaude`) e a ficha abre na tela de sempre.
 */
export function OfertaDaFichaDeSaude({ appointmentId, slug }: { appointmentId: string; slug: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [abrindo, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function abrir() {
    setErro(null)
    iniciar(async () => {
      const r = await abrirMinhaFichaDeSaude(appointmentId)
      if ('error' in r) { setErro(r.error); return }
      // A16 da 35ª: na própria página da ficha (aberta pelo endereço), recarrega.
      const destino = `/${slug}/cliente/pre-atendimento`
      if (pathname === destino) router.refresh()
      else router.push(destino)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button type="button" data-testid="oferta-da-ficha-de-saude" onClick={abrir} disabled={abrindo} className="card" style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', cursor: 'pointer',
        borderColor: 'var(--brand-soft-border)', background: 'var(--brand-soft)',
      }}>
        <ClipboardList size={20} color="var(--brand)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>Responda a sua ficha de saúde</p>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Algumas perguntas antes do seu atendimento.</p>
        </div>
        {abrindo ? <Loader2 size={16} color="var(--brand)" className="animate-spin" /> : <ChevronRight size={16} color="var(--brand)" />}
      </button>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}
