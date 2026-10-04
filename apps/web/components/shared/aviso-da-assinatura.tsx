import { AlertTriangle, Clock } from 'lucide-react'
import type { AvisoDaAssinatura as Aviso } from '@/lib/redes/aviso'

/**
 * O aviso da assinatura no topo (só quem administra a rede o recebe):
 * teste acabando, ou pagamento em atraso com a data da suspensão e o link
 * da fatura.
 */
const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

export function AvisoDaAssinatura({ aviso, rotaDaAba }: { aviso: Aviso; rotaDaAba: string }) {
  if (aviso.tipo === 'teste') {
    return (
      <a href={rotaDaAba} className="aviso-assinatura" data-tom="info">
        <Clock size={14} aria-hidden />
        {aviso.dias === 0 ? 'O teste termina hoje' : `O teste termina em ${aviso.dias} ${aviso.dias === 1 ? 'dia' : 'dias'}`}
      </a>
    )
  }
  return (
    <a href={aviso.url ?? rotaDaAba} target={aviso.url ? '_blank' : undefined} rel={aviso.url ? 'noreferrer' : undefined}
      className="aviso-assinatura" data-tom="atraso">
      <AlertTriangle size={14} aria-hidden />
      Pagamento em atraso{aviso.suspendeEm ? ` — regularize até ${dia(aviso.suspendeEm)}` : ''}
    </a>
  )
}
