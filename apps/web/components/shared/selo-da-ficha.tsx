import { ClipboardCheck, ClipboardList } from 'lucide-react'
import type { SeloDaFicha as Estado } from '@/lib/pre-atendimento/selos'

/**
 * O selo da ficha de saúde no bloco da agenda (2026-10-21): pendente
 * (âmbar) ou respondida (verde). Só o ícone — o bloco é estreito —, com o
 * nome para quem lê a tela e no `title`. Sem estado, nada.
 */
export function SeloDaFicha({ estado }: { estado?: Estado | null }) {
  if (!estado) return null
  const pendente = estado === 'PENDENTE'
  const rotulo = pendente ? 'Ficha de saúde pendente' : 'Ficha de saúde respondida'
  const Icone = pendente ? ClipboardList : ClipboardCheck
  return (
    <span
      data-ficha-de-saude={estado}
      role="img"
      aria-label={rotulo}
      title={rotulo}
      style={{ display: 'inline-flex', flexShrink: 0, color: pendente ? 'var(--warning)' : 'var(--success)' }}
    >
      <Icone size={11} strokeWidth={2.4} aria-hidden="true" />
    </span>
  )
}
